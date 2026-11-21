"""Six retrieval modes over the policy chunks: dense / sparse / hybrid, each with or without a reranker.

- sparse : BM25 (rank_bm25) over regex tokens (see text.py)
- dense  : multilingual sentence embeddings (fastembed, ONNX, CPU), cosine similarity
- hybrid : Reciprocal Rank Fusion of the dense and sparse rankings (no score calibration needed)
- *_rerank : the first stage proposes `rerank_candidates` chunks, a multilingual cross-encoder
             (fastembed, CPU) reads each (question, chunk) pair and re-orders them.
Models load lazily, once, and stay in memory.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np
from rank_bm25 import BM25Okapi

from app.config import BACKEND_DIR, settings
from app.rag.chunking import Chunk, load_corpus
from app.rag.text import tokenize

Mode = Literal["dense", "dense_rerank", "sparse", "sparse_rerank", "hybrid", "hybrid_rerank"]
MODES: tuple[Mode, ...] = ("dense", "dense_rerank", "sparse", "sparse_rerank", "hybrid", "hybrid_rerank")
RRF_K = 60  # standard constant from the RRF paper

# Some embedding models are trained with instruction prefixes.
PREFIXES = {
    "intfloat/multilingual-e5-large": ("query: ", "passage: "),
}


@dataclass
class Hit:
    chunk: Chunk
    score: float


def _cache_dir() -> str:
    p = Path(settings.models_cache_dir)
    return str(p if p.is_absolute() else BACKEND_DIR / p)


class Retriever:
    def __init__(
        self,
        chunks: list[Chunk] | None = None,
        embedding_model: str | None = None,
        reranker_model: str | None = None,
        rerank_candidates: int | None = None,
    ):
        self.chunks = chunks if chunks is not None else load_corpus(settings.docs_dir)
        self.embedding_model = embedding_model or settings.embedding_model
        self.reranker_model = reranker_model or settings.reranker_model
        self.rerank_candidates = rerank_candidates or settings.rerank_candidates
        self.bm25 = BM25Okapi([tokenize(c.content) for c in self.chunks])
        self._embedder = None
        self._doc_vectors: np.ndarray | None = None
        self._reranker = None

    # ------------------------------------------------------------ models (lazy)

    def _embed(self, texts: list[str], kind: Literal["query", "passage"]) -> np.ndarray:
        if self._embedder is None:
            from fastembed import TextEmbedding

            self._embedder = TextEmbedding(self.embedding_model, cache_dir=_cache_dir(), providers=["CPUExecutionProvider"])
        q_prefix, p_prefix = PREFIXES.get(self.embedding_model, ("", ""))
        prefix = q_prefix if kind == "query" else p_prefix
        vectors = np.array(list(self._embedder.embed([prefix + t for t in texts])), dtype=np.float32)
        return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)

    @property
    def doc_vectors(self) -> np.ndarray:
        if self._doc_vectors is None:
            self._doc_vectors = self._embed([c.content for c in self.chunks], "passage")
        return self._doc_vectors

    @property
    def reranker(self):
        if self._reranker is None:
            from fastembed.rerank.cross_encoder import TextCrossEncoder

            self._reranker = TextCrossEncoder(self.reranker_model, cache_dir=_cache_dir(), providers=["CPUExecutionProvider"])
        return self._reranker

    def warm_up(self, modes: tuple[Mode, ...] = MODES) -> None:
        """Load models and embed the corpus before the first real question."""
        if any(m.startswith(("dense", "hybrid")) for m in modes):
            _ = self.doc_vectors
        if any(m.endswith("rerank") for m in modes):
            list(self.reranker.rerank("warm up", ["warm up"]))

    # ------------------------------------------------------------ first stage

    def dense(self, query: str) -> list[Hit]:
        scores = self.doc_vectors @ self._embed([query], "query")[0]
        order = np.argsort(-scores)
        return [Hit(self.chunks[i], float(scores[i])) for i in order]

    def sparse(self, query: str) -> list[Hit]:
        """BM25. Chunks sharing no word with the question are dropped (score 0 = no evidence)."""
        tokens = tokenize(query)
        if not tokens:
            return []
        scores = self.bm25.get_scores(tokens)
        order = np.argsort(-scores)
        return [Hit(self.chunks[i], float(scores[i])) for i in order if scores[i] > 0]

    def hybrid(self, query: str) -> list[Hit]:
        fused: dict[str, float] = {}
        by_id = {c.id: c for c in self.chunks}
        for ranking in (self.dense(query), self.sparse(query)):
            for rank, hit in enumerate(ranking, start=1):
                fused[hit.chunk.id] = fused.get(hit.chunk.id, 0.0) + 1.0 / (RRF_K + rank)
        return [Hit(by_id[cid], s) for cid, s in sorted(fused.items(), key=lambda kv: -kv[1])]

    # ------------------------------------------------------------ second stage

    def rerank(self, query: str, hits: list[Hit]) -> list[Hit]:
        candidates = hits[: self.rerank_candidates]
        if not candidates:
            return []
        scores = list(self.reranker.rerank(query, [h.chunk.content for h in candidates]))
        return sorted((Hit(h.chunk, float(s)) for h, s in zip(candidates, scores)), key=lambda h: -h.score)

    def search(self, query: str, mode: Mode | None = None, top_k: int | None = None) -> list[Hit]:
        mode = mode or settings.retrieval_mode  # type: ignore[assignment]
        if mode not in MODES:
            raise ValueError(f"Unknown retrieval mode {mode!r}; use one of {MODES}")
        base, _, rr = mode.partition("_")
        hits = {"dense": self.dense, "sparse": self.sparse, "hybrid": self.hybrid}[base](query)
        if rr:
            hits = self.rerank(query, hits)
        return hits[: top_k or settings.retrieval_top_k]
