"""Chunking, tokenizer and retrieval. Model-based tests run only when the models are downloaded."""

import json
from pathlib import Path

import pytest

from app.config import BACKEND_DIR, settings
from app.rag.chunking import chunk_markdown, load_corpus
from app.rag.retrieval import MODES, Retriever
from app.rag.text import tokenize

# ------------------------------------------------------------------ chunking


def test_corpus_has_one_chunk_per_section():
    chunks = load_corpus(settings.docs_dir)
    assert len(chunks) == 21
    assert len({c.id for c in chunks}) == 21
    sick = next(c for c in chunks if c.id == "leave.md#sick-leave")
    assert sick.content.startswith("Leave and working time > Sick leave\n")
    assert "medical certificate is required from the second day" in sick.text
    assert all(c.content.startswith(f"{c.doc_title} > {c.section}\n") for c in chunks)


def test_chunker_handles_messy_markdown():
    md = (
        "﻿# Travel guide\r\nIntro line.\r\n\r\n"
        "## Trains\r\nFirst class\r\nwhen longer than 3 hours.\r\n### Tickets\r\nKeep the **receipt**, see [rules](x.md).\r\n"
        "## Empty\r\n\r\n"
        "## Trains\nSecond section with the same title.\n"
    )
    chunks = chunk_markdown(md, "travel.md")
    assert [c.section for c in chunks] == ["Introduction", "Trains", "Trains"]  # empty section skipped
    assert chunks[1].text == "First class when longer than 3 hours.\nTickets: Keep the receipt, see rules."
    assert chunks[1].content.startswith("Travel guide > Trains\n")
    assert len({c.id for c in chunks}) == 3  # duplicate titles get unique ids


def test_long_sections_are_split_with_the_prefix_repeated():
    body = " ".join(f"Sentence number {i} explains a rule." for i in range(60))
    chunks = chunk_markdown(f"# Doc\n## Long\n{body}\n", "doc.md")
    assert len(chunks) > 1
    assert all(len(c.text) <= 700 and c.content.startswith("Doc > Long\n") for c in chunks)


# ------------------------------------------------------------------ tokenizer


@pytest.mark.parametrize(
    "text,expected",
    [
        ("above 2,500 euros", ["above", "2500", "eur"]),  # English thousands
        ("un achat de 4 000 euros", ["achat", "4000", "eur"]),  # French thousands + space
        ("een factuur van 2.500 €", ["factuur", "2500", "eur"]),  # Dutch thousands + euro sign
        ("L'alcool est-il remboursé ?", ["alcool", "rembourse"]),  # elision + accents
        ("Télétravail", ["teletravail"]),
        ("quotes policies", ["quote", "policy"]),  # light plural stripping
    ],
)
def test_tokenizer_removes_language_differences(text, expected):
    assert tokenize(text) == expected


def test_bm25_works_without_models():
    r = Retriever()
    hits = r.search("How many quotes do I need for a 3,000 euro purchase?", "sparse", top_k=3)
    assert hits[0].chunk.id == "purchasing.md#quotes"
    assert r.search("Combien de jours de congé ?", "sparse") == []  # no shared word: BM25 cannot translate


def test_unknown_mode_is_refused():
    with pytest.raises(ValueError):
        Retriever().search("x", "magic")  # type: ignore[arg-type]


# ------------------------------------------------------------------ models (optional)


def _downloaded(model: str) -> bool:
    cache = Path(settings.models_cache_dir)
    cache = cache if cache.is_absolute() else BACKEND_DIR / cache
    return any(model.split("/")[-1].lower() in p.name.lower() for p in cache.glob("models--*"))


needs_models = pytest.mark.skipif(
    not (_downloaded(settings.embedding_model) and _downloaded("bge-reranker-v2-m3")),
    reason="retrieval models not downloaded (run the app or `uv run python -m app.rag.evaluate` once)",
)


@pytest.fixture(scope="module")
def retriever():
    r = Retriever()
    r.warm_up()
    return r


@needs_models
def test_chosen_configuration_keeps_its_accuracy(retriever):
    """Regression guard for the evaluation result: >= 95% top-1 in every language."""
    questions = json.loads((BACKEND_DIR / "eval" / "questions.json").read_text(encoding="utf-8"))
    for lang in ("en", "fr", "nl"):
        qs = [q for q in questions if q["lang"] == lang]
        top1 = sum(retriever.search(q["q"], top_k=1)[0].chunk.id == q["gold"] for q in qs) / len(qs)
        assert top1 >= 0.95, (lang, top1)


@needs_models
@pytest.mark.parametrize("mode", MODES)
def test_every_mode_answers_a_french_question(retriever, mode):
    hits = retriever.search("Combien de jours de congé ai-je par an ?", mode, top_k=3)
    if mode.startswith("sparse"):
        assert hits == []  # no word in common with the English policy: BM25 cannot translate
    else:
        assert hits[0].chunk.id == "leave.md#annual-leave"


@needs_models
@pytest.mark.parametrize("question", ["Où se trouve le parking vélo à Liège ?", "Quel est le salaire d'un ingénieur junior ?"])
def test_clearly_off_topic_questions_score_below_the_threshold(retriever, question):
    """The score gate only catches clearly unrelated questions; near-topic ones go to the LLM (see report)."""
    if settings.embedding_model != "intfloat/multilingual-e5-large":
        pytest.skip("threshold calibrated for multilingual-e5-large")
    assert retriever.search(question, top_k=1)[0].score < settings.retrieval_min_score
