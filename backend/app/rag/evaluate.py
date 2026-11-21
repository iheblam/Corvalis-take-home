"""Retrieval evaluation: 6 modes x embedding models on the labelled EN/FR/NL question set.

    uv run python -m app.rag.evaluate                       # default embedding model
    uv run python -m app.rag.evaluate --models A B          # compare embedding models

Writes eval/results.json and prints Markdown tables.
"""

import argparse
import json
import statistics
import time
from pathlib import Path

from app.config import BACKEND_DIR, settings
from app.rag.retrieval import MODES, Retriever

QUESTIONS = BACKEND_DIR / "eval" / "questions.json"
RESULTS = BACKEND_DIR / "eval" / "results.json"
OUT_OF_SCOPE = BACKEND_DIR / "eval" / "out_of_scope.json"
LANGS = ("en", "fr", "nl")


def rank_of(gold: str, ids: list[str]) -> int | None:
    return ids.index(gold) + 1 if gold in ids else None


def metrics(ranks: list[int | None]) -> dict[str, float]:
    n = len(ranks)
    return {
        "hit@1": sum(r == 1 for r in ranks) / n,
        "hit@3": sum(r is not None and r <= 3 for r in ranks) / n,
        "mrr": sum(1 / r for r in ranks if r) / n,
    }


def separation(answerable: list[float], off_topic: list[float]) -> dict[str, float]:
    """How well the top-1 score tells "the docs answer this" from "off-topic -> ask HR".

    auc: probability that an answerable question scores higher than an off-topic one.
    threshold / accuracy: best cut-off on this set and the share of questions it classifies right.
    """
    pairs = [(a > o) + 0.5 * (a == o) for a in answerable for o in off_topic]
    auc = sum(pairs) / len(pairs) if pairs else 0.0
    best = (0.0, 0.0)
    for t in sorted(set(answerable + off_topic)):
        correct = sum(a >= t for a in answerable) + sum(o < t for o in off_topic)
        acc = correct / (len(answerable) + len(off_topic))
        if acc > best[1]:
            best = (t, acc)
    return {"auc": auc, "threshold": best[0], "accuracy": best[1]}


def evaluate_model(embedding_model: str, questions: list[dict], modes=MODES, candidates: int | None = None,
                   off_topic: list[dict] | None = None) -> list[dict]:
    retriever = Retriever(embedding_model=embedding_model, rerank_candidates=candidates)
    t0 = time.perf_counter()
    retriever.warm_up(tuple(modes))
    load_s = time.perf_counter() - t0

    rows = []
    for mode in modes:
        for q in questions:  # warm-up pass (first calls are slower: ONNX graph optimisation)
            retriever.search(q["q"], mode, top_k=10)
        ranks, latencies, misses, top_scores = [], [], [], []
        per_lang: dict[str, list[int | None]] = {lang: [] for lang in LANGS}
        for q in questions:
            t = time.perf_counter()
            hits = retriever.search(q["q"], mode, top_k=10)
            latencies.append((time.perf_counter() - t) * 1000)
            r = rank_of(q["gold"], [h.chunk.id for h in hits])
            top_scores.append(hits[0].score if hits else float("-inf"))
            ranks.append(r)
            per_lang[q["lang"]].append(r)
            if r != 1:
                misses.append({"q": q["q"], "gold": q["gold"], "rank": r, "top1": hits[0].chunk.id if hits else None})
        lat = sorted(latencies)
        off_scores = []
        for q in off_topic or []:
            hits = retriever.search(q["q"], mode, top_k=1)
            off_scores.append(hits[0].score if hits else float("-inf"))
        rows.append({
            "model": embedding_model,
            "mode": mode,
            "candidates": retriever.rerank_candidates if mode.endswith("rerank") else None,
            **metrics(ranks),
            "by_lang": {lang: metrics(rs) for lang, rs in per_lang.items() if rs},
            "latency_ms_mean": statistics.mean(lat),
            "latency_ms_p95": lat[int(0.95 * (len(lat) - 1))],
            "model_load_s": load_s,
            "answerability": separation(top_scores, off_scores) if off_scores else None,
            "misses": misses,
        })
    return rows


def pct(x: float) -> str:
    return f"{100 * x:.0f}%"


def print_tables(rows: list[dict]) -> None:
    print("\n| Embedding model | Mode | Rerank cand. | Hit@1 | Hit@3 | MRR | EN Hit@1 | FR Hit@1 | NL Hit@1 | Latency mean | p95 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        bl = r["by_lang"]
        print(f"| {r['model'].split('/')[-1]} | {r['mode']} | {r.get('candidates') or '-'} | {pct(r['hit@1'])} | {pct(r['hit@3'])} | {r['mrr']:.3f} | "
              f"{pct(bl['en']['hit@1'])} | {pct(bl['fr']['hit@1'])} | {pct(bl['nl']['hit@1'])} | "
              f"{r['latency_ms_mean']:.1f} ms | {r['latency_ms_p95']:.1f} ms |")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=[settings.embedding_model])
    parser.add_argument("--modes", nargs="+", default=list(MODES), choices=MODES)
    parser.add_argument("--candidates", type=int, nargs="+", default=[settings.rerank_candidates],
                        help="reranker candidate counts to try")
    parser.add_argument("--out", default=str(RESULTS))
    args = parser.parse_args()
    questions = json.loads(QUESTIONS.read_text(encoding="utf-8"))
    off_topic = json.loads(OUT_OF_SCOPE.read_text(encoding="utf-8"))
    print(f"{len(questions)} questions ({', '.join(f'{l}: {sum(q['lang'] == l for q in questions)}' for l in LANGS)}), "
          f"reranker {settings.reranker_model}, candidates {args.candidates}")
    rows = []
    for model in args.models:
        for n in args.candidates:
            modes = args.modes if n == args.candidates[0] else [m for m in args.modes if m.endswith("rerank")]
            rows += evaluate_model(model, questions, modes, n, off_topic)
    Path(args.out).write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
    print_tables(rows)
    print("\n| Embedding model | Mode | Answerable vs off-topic AUC | Best threshold | Accuracy |")
    print("|---|---|---|---|---|")
    for r in rows:
        a = r["answerability"]
        print(f"| {r['model'].split('/')[-1]} | {r['mode']} | {a['auc']:.2f} | {a['threshold']:.3f} | {pct(a['accuracy'])} |")
    print(f"\nDetails (misses per mode): {args.out}")


if __name__ == "__main__":
    main()
