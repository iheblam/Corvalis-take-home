"""End-to-end check of the assistant (retrieval + local LLM) on the evaluation questions.

    uv run python -m app.rag.evaluate_answers

Needs Ollama running. For each question: answered or not, right section cited, reply in the
question's language, time. Off-topic questions must NOT be answered.
"""

import json
import statistics

from app.config import BACKEND_DIR, settings
from app.rag.assistant import answer_question, detect_language, get_retriever

QUESTIONS = BACKEND_DIR / "eval" / "questions.json"
OUT_OF_SCOPE = BACKEND_DIR / "eval" / "out_of_scope.json"
RESULTS = BACKEND_DIR / "eval" / "answers.json"


def main() -> None:
    get_retriever()
    answerable = json.loads(QUESTIONS.read_text(encoding="utf-8"))
    off_topic = json.loads(OUT_OF_SCOPE.read_text(encoding="utf-8"))
    rows = []
    for q in answerable + off_topic:
        a = answer_question(q["q"])
        rows.append({
            "lang": q["lang"], "q": q["q"], "gold": q.get("gold"), "answered": a.answered, "reason": a.reason,
            "cited_gold": q.get("gold") in [s["id"] for s in a.sources],
            "reply_lang": detect_language(a.text), "answer": a.text, "ms": a.latency_ms,
        })
        print(f"{a.latency_ms:6} ms | {q['lang']} | {'OK ' if a.answered else '-- '} | {q['q'][:50]:50} | {a.text[:90]}", flush=True)
    RESULTS.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")

    ans = [r for r in rows if r["gold"]]
    off = [r for r in rows if not r["gold"]]
    llm_ms = [r["ms"] for r in rows if r["answered"] or r["reason"] == "not_found" and r["ms"] > 500]
    print(f"\nModel {settings.ollama_model}, retrieval {settings.retrieval_mode} / {settings.embedding_model}")
    print(f"Answerable questions answered:          {sum(r['answered'] for r in ans)}/{len(ans)}")
    print(f"  ...citing the right section:          {sum(r['answered'] and r['cited_gold'] for r in ans)}/{len(ans)}")
    print(f"  ...replying in the question language: {sum(r['answered'] and r['reply_lang'] == r['lang'] for r in ans)}/{len(ans)}")
    print(f"Off-topic questions correctly refused:  {sum(not r['answered'] for r in off)}/{len(off)}")
    print(f"Time per question: mean {statistics.mean(r['ms'] for r in rows) / 1000:.1f} s, "
          f"median {statistics.median(llm_ms) / 1000:.1f} s with the LLM, max {max(r['ms'] for r in rows) / 1000:.1f} s")


if __name__ == "__main__":
    main()
