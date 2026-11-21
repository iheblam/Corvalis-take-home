"""Question -> retrieve policy extracts -> local LLM answer with citations (or "ask HR")."""

import json
import re
import threading
import time
from dataclasses import dataclass, field

from app.config import settings
from app.rag import llm
from app.rag.retrieval import Hit, Retriever

LANG_NAME = {"en": "English", "fr": "French", "nl": "Dutch"}

# "je" is left out on purpose: it is both French ("puis-je") and Dutch ("je hebt").
_FR = re.compile(r"\b(est|les|des|une|pour|puis|quand|combien|quel|quelle|mon|ma|mes|dois|faut|avec|sont|pas|qui|que|ai|vous|votre|au|du|la|le|il)\b|[éèêàçù]")
_NL = re.compile(r"\b(ik|het|een|mijn|hoe|wanneer|waar|wie|mag|moet|heb|hebt|krijg|zijn|niet|van|voor|met|wat|nodig|ben|jouw|jij|uw|naar|binnen|ook|kun|kunt|bent|moeten|worden|wordt|geen|deze|dit|dat|als|maar|dan)\b|ij")
_EN = re.compile(r"\b(i|the|my|how|when|where|who|can|do|does|is|are|what|need|for|with|have)\b")


def detect_language(text: str) -> str:
    """Tiny regex detector for EN / FR / NL (enough for three languages and short questions)."""
    t = re.sub(r"\b(één|vóór)\b", " ", text.lower())  # Dutch words with French-looking accents
    scores = {"fr": len(_FR.findall(t)), "nl": len(_NL.findall(t)), "en": len(_EN.findall(t))}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "en"


MESSAGES = {
    "not_found": {
        "en": "I couldn't find this in the Corvalis policies. You can send your question to HR and they will answer you here.",
        "fr": "Je n'ai pas trouvé cette information dans les règles de Corvalis. Vous pouvez envoyer votre question aux RH : la réponse arrivera ici.",
        "nl": "Ik heb dit niet gevonden in de regels van Corvalis. U kunt uw vraag naar HR sturen; het antwoord verschijnt hier.",
    },
    "offline": {
        "en": "The assistant is not available right now. You can send your question to HR instead.",
        "fr": "L'assistant n'est pas disponible pour le moment. Vous pouvez envoyer votre question aux RH.",
        "nl": "De assistent is momenteel niet beschikbaar. U kunt uw vraag naar HR sturen.",
    },
}

SYSTEM_PROMPT = """You are the Corvalis internal-rules assistant. Corvalis is an engineering consultancy in Brussels and Liège.
Answer the employee's question using ONLY the numbered policy extracts{personal_hint}.
Rules:
- Reply in {language}, the language of the question.
- Speak directly to the employee ("you" / "vous" / "u"), never about them in the third person.
- Be short and friendly: 1 to 3 sentences, plain words, no headings, no lists.
- After each fact, cite the extract number in square brackets, for example [1].
- Never invent rules, amounts, people or deadlines that are not written in the extracts.
- The question may use other words than the policy (a beer is alcohol, a cab is a taxi, driving from home to
  the office is commuting, arriving on the first day is being welcomed at 9 o'clock). If an extract contains
  the rule that settles the question, it IS answered: set found to true and apply the rule to the question.
Return JSON: {{"found": true or false, "answer": "...", "citations": [extract numbers used]}}.
If the extracts do not answer the question, return {{"found": false, "answer": "", "citations": []}}."""

# Structured output: the "is it answered?" decision no longer depends on the model's wording.
ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "found": {"type": "boolean"},
        "answer": {"type": "string"},
        "citations": {"type": "array", "items": {"type": "integer"}},
    },
    "required": ["found", "answer", "citations"],
}


def parse_reply(reply: str) -> tuple[bool, str, list[int]]:
    """JSON reply -> (found, answer, citations). Falls back to plain text (older models, tests)."""
    try:
        data = json.loads(reply)
        found = bool(data.get("found")) and bool(str(data.get("answer", "")).strip())
        cites = [int(n) for n in data.get("citations", []) if str(n).lstrip("-").isdigit()]
        return found, str(data.get("answer", "")).strip(), cites
    except (ValueError, AttributeError, TypeError):
        text = (reply or "").strip()
        return bool(text) and "NOT_FOUND" not in text, text, []


@dataclass
class Answer:
    text: str
    answered: bool
    reason: str | None  # None | "not_found" | "offline"
    language: str
    sources: list[dict] = field(default_factory=list)
    latency_ms: int = 0


# ------------------------------------------------------------------ shared retriever

_retriever: Retriever | None = None
_lock = threading.Lock()


def get_retriever() -> Retriever:
    global _retriever
    with _lock:
        if _retriever is None:
            r = Retriever()
            r.warm_up((settings.retrieval_mode,))  # type: ignore[arg-type]
            _retriever = r
    return _retriever


def warm_up_in_background() -> None:
    """Load the embedding model and the LLM at startup without blocking the API."""
    threading.Thread(target=lambda: (get_retriever(), llm.warm_up()), daemon=True).start()


# ------------------------------------------------------------------ pipeline


def _source(n: int, hit: Hit) -> dict:
    c = hit.chunk
    return {"n": n, "id": c.id, "doc": c.doc, "doc_title": c.doc_title, "section": c.section, "text": c.text}


def build_user_message(question: str, hits: list[Hit], personal: str | None) -> str:
    extracts = "\n\n".join(f"[{i}] {h.chunk.content}" for i, h in enumerate(hits, start=1))
    parts = [f"Policy extracts:\n{extracts}"]
    if personal:
        parts.append(f"About the employee asking (from the leave app, may be used for personal questions):\n{personal}")
    parts.append(f"Question: {question}")
    return "\n\n".join(parts)


def answer_question(question: str, personal: str | None = None, retriever: Retriever | None = None) -> Answer:
    started = time.perf_counter()
    lang = detect_language(question)
    retriever = retriever or get_retriever()
    hits = retriever.search(question, top_k=settings.retrieval_top_k)

    def done(a: Answer) -> Answer:
        a.latency_ms = int((time.perf_counter() - started) * 1000)
        return a

    # Gate 1: nothing close enough in the policies -> don't even ask the LLM.
    gate = settings.retrieval_mode == "dense" and (not hits or hits[0].score < settings.retrieval_min_score)
    if not hits or gate:
        return done(Answer(MESSAGES["not_found"][lang], False, "not_found", lang))

    system = SYSTEM_PROMPT.format(
        language=LANG_NAME[lang],
        personal_hint=" and the employee's own leave data" if personal else "",
    )
    try:
        reply = llm.chat(system, build_user_message(question, hits, personal), schema=ANSWER_SCHEMA)
    except llm.LLMUnavailable:
        return done(Answer(MESSAGES["offline"][lang], False, "offline", lang))

    # Gate 2: the LLM read the extracts and says they don't answer the question.
    found, text, listed = parse_reply(reply)
    if not found:
        return done(Answer(MESSAGES["not_found"][lang], False, "not_found", lang))

    in_text = [int(n) for n in re.findall(r"\[(\d+)\]", text)]
    cited = sorted({n for n in in_text + listed if 1 <= n <= len(hits)})
    sources = [_source(n, hits[n - 1]) for n in cited] or [_source(1, hits[0])]
    return done(Answer(text, True, None, lang, sources))
