# Retrieval evaluation for the internal-rules assistant (P1)

**Decision: dense retrieval with `intfloat/multilingual-e5-large`, no reranker, top 3 chunks to the LLM.**
It found the right section first for **100 % of the 50 test questions in English, French and Dutch**, in **~46 ms** per question on the CPU,
and its score also tells "answerable" from "off-topic" as well as the reranker does (AUC 0.98).

| | Chosen | Lighter alternative |
|---|---|---|
| Config (`backend/.env`) | `EMBEDDING_MODEL=intfloat/multilingual-e5-large`, `RETRIEVAL_MODE=dense` | `EMBEDDING_MODEL=…paraphrase-multilingual-MiniLM-L12-v2`, `RETRIEVAL_MODE=dense_rerank`, `RERANK_CANDIDATES=5` |
| Top-1 accuracy (EN / FR / NL) | 100 / 100 / 100 % | 100 / 100 / 100 % |
| Retrieval time per question | **46 ms** (p95 53 ms) | 321 ms (p95 396 ms) |
| Models to download | 1 model, 2.24 GB | 2 models, 0.22 + 0.57 GB |
| RAM | ~1.55 GB | ~1.38 GB |

## 1. The problem

- **Corpus:** the five Corvalis policies in `docs/` (expenses, IT security, leave, onboarding, purchasing), in English, 85 lines in total.
- **Users:** about fifty people in Brussels and Liège. Many will ask in **French or Dutch**, about **English** text.
- **Constraints:** answers must be right and quick, everything must run locally, and the GPU (4 GB) is kept for the LLM (`qwen3.5:4b` in Ollama), so **retrieval runs on the CPU** (fastembed / ONNX).

## 2. Chunking

One chunk per `##` section, prefixed with `Document > Section` (`backend/app/rag/chunking.py`):

```
Expense policy > Approval
Every claim is approved by the direct manager. A claim above 500 euros also needs the approval
of the finance director. Claims must be submitted within 60 days.
```

Why: each section is one rule (the docs are written that way), so a section is the natural unit to retrieve and to cite.
The prefix matters: "Approval" alone could be about leave or purchases. With the prefix, both the retrievers and the LLM know the context.
The result is **21 chunks of 100–255 characters**, well under the 128-token limit of the smallest model and the 512-token limit of e5.

Obstacles handled with regular expressions (all covered by `tests/test_rag.py`):

| Obstacle | Handling |
|---|---|
| Windows line endings, BOM | normalised before splitting |
| Text before the first `##` | kept as an "Introduction" chunk |
| `###` sub-headings | stay in their `##` chunk, rendered as "Title:" |
| Empty sections, duplicate titles | skipped / unique ids |
| Very long sections (future docs) | split by sentence at 700 characters, prefix repeated |
| Bold, links, bullets, wrapped lines | cleaned to plain sentences |
| Number formats across languages: `2,500` (EN), `2.500` (NL), `4 000` (FR) | normalised to `2500` for BM25 |
| Accents, French elisions (`l'alcool`), `€` / `euros` | folded / removed / unified for BM25 |

## 3. The six combinations

| Mode | How it works |
|---|---|
| **dense** | multilingual sentence embeddings, cosine similarity |
| **dense + rerank** | dense proposes 5 candidates, a cross-encoder (`BAAI/bge-reranker-v2-m3-int8`, multilingual) re-orders them |
| **sparse** | BM25 (`rank_bm25`) over regex tokens with EN/FR/NL stop-words |
| **sparse + rerank** | BM25 candidates, re-ordered by the cross-encoder |
| **hybrid** | dense and BM25 rankings merged with Reciprocal Rank Fusion (k = 60) |
| **hybrid + rerank** | fused candidates, re-ordered by the cross-encoder |

## 4. How it was measured

- **50 labelled questions** (`backend/eval/questions.json`): **21 English, 18 French, 11 Dutch**. They are written the way staff talk, not copied from the policy: "Can I expense a beer with a client?" (the policy says *alcohol*), "doktersbriefje" (*medical certificate*), "4 000 euros", "cab to the train station" (*taxi*).
- **12 off-topic questions** (`backend/eval/out_of_scope.json`), several of them near a real topic: "wifi password for guests", "paternity leave", "company car".
- **Metrics:** Hit@1 (right section first), Hit@3 (right section among the 3 given to the LLM), MRR, mean and p95 time per question after a warm-up, and AUC for answerable vs off-topic.
- **Machine:** this laptop, 12-core CPU, retrieval on CPU only.
- **Reproduce:** `cd backend; uv run python -m app.rag.evaluate --models sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 intfloat/multilingual-e5-large --candidates 5` (raw output in `backend/eval/latest_run.md`, details per question in `backend/eval/results.json`).

## 5. Results

### Accuracy and speed (5 reranker candidates)

| Embedding model | Mode | Hit@1 | Hit@3 | MRR | EN Hit@1 | FR Hit@1 | NL Hit@1 | Time (mean) | p95 |
|---|---|---|---|---|---|---|---|---|---|
| MiniLM-L12 (0.22 GB) | dense | 94% | 100% | 0.967 | 95% | 94% | 91% | 4.5 ms | 5.3 ms |
| MiniLM-L12 | dense + rerank | 100% | 100% | 1.000 | 100% | 100% | 100% | 321 ms | 396 ms |
| — | sparse (BM25) | 46% | 58% | 0.507 | 71% | **33%** | **18%** | 0.1 ms | 0.1 ms |
| — | sparse + rerank | 56% | 58% | 0.570 | 76% | 39% | 45% | 115 ms | 322 ms |
| MiniLM-L12 | hybrid | 86% | 96% | 0.917 | 76% | 94% | 91% | 4.5 ms | 5.4 ms |
| MiniLM-L12 | hybrid + rerank | 100% | 100% | 1.000 | 100% | 100% | 100% | 314 ms | 380 ms |
| **e5-large (2.24 GB)** | **dense** | **100%** | **100%** | **1.000** | **100%** | **100%** | **100%** | **46 ms** | **53 ms** |
| e5-large | dense + rerank | 100% | 100% | 1.000 | 100% | 100% | 100% | 363 ms | 413 ms |
| e5-large | hybrid | 90% | 96% | 0.937 | 76% | 100% | 100% | 46 ms | 53 ms |
| e5-large | hybrid + rerank | 100% | 100% | 1.000 | 100% | 100% | 100% | 356 ms | 410 ms |

(BM25 does not use an embedding model, so its rows are identical for both.)

### How many candidates should the reranker read? (MiniLM)

| Candidates | dense + rerank Hit@1 | time | hybrid + rerank Hit@1 | time |
|---|---|---|---|---|
| 3 | 98% | 203 ms | 94% | 196 ms |
| **5** | **100%** | **350 ms** | **100%** | **368 ms** |
| 8 | 98% | 612 ms | 98% | 552 ms |

The reranker's cost grows with each candidate, and more candidates are not better: at 8, an ambiguous section gets an extra chance to win. **5 is the sweet spot**, now the default.

### Can the score tell "answerable" from "off-topic"?

| Mode | AUC | Best cut-off | Correct |
|---|---|---|---|
| MiniLM dense | 0.86 | 0.246 | 84% |
| MiniLM dense + rerank | 0.98 | −6.33 | 95% |
| **e5-large dense** | **0.98** | **0.783** | **95%** |
| hybrid (either) | 0.69 | — | 81% |
| sparse (either) | 0.72 | — | 81% |

## 6. What the results say

1. **The language barrier kills BM25.** BM25 finds 71 % of English questions first, but only 33 % of French and 18 % of Dutch ones, because "congé" never appears in an English text. The regex normalisation helps with numbers, accents and words spelled the same in both languages ("médical" → `medical`), but it cannot translate. A reranker cannot fix this either: if BM25 returns nothing, there is nothing to re-order.
2. **Hybrid is worse than dense alone here.** On 21 short chunks, BM25 adds noise: "station" pulls in the VPN rule (*"…such as a hotel or a station"*) for a taxi question, and "laptop" pulls in *Approved suppliers* for a software question. Equal-weight fusion then pushes the right answer down (English Hit@1 drops from 95–100 % to 76 %). Hybrid helps on large corpora full of codes and names. Ours is small and written in plain language.
3. **A bigger multilingual embedding model does the reranker's job, at about 1/7 of the time.** MiniLM ranks the right section 2nd or 3rd for 3 questions; the reranker fixes them, but costs ~320 ms. e5-large ranks all 50 first in ~46 ms, and its score separates off-topic questions just as well.
4. **Near-topic questions cannot be caught by the score alone.** e5 similarity scores are bunched together: the weakest real question scores 0.783, but "wifi password for guests" (→ *Passwords*) scores 0.804 and "paternity leave" (→ *Annual leave*) 0.803. So:
   - `RETRIEVAL_MIN_SCORE=0.75` (deliberately low) only filters **clearly** unrelated questions, such as the bike parking or salaries. No real question is lost.
   - For everything else, **the LLM is the second gate.** It is told to answer only from the 3 extracts, to say when they do not contain the answer, and then to offer to send the question to HR (the HR ticket).

## 7. Final choice

```
EMBEDDING_MODEL=intfloat/multilingual-e5-large
RETRIEVAL_MODE=dense
RETRIEVAL_TOP_K=3
RETRIEVAL_MIN_SCORE=0.75
```

- **Accuracy:** 100 % top-1 in all three languages, and 100 % of the right sections inside the 3 extracts given to the LLM.
- **Speed:** ~46 ms on the CPU. That is negligible next to the LLM writing the answer (seconds), and ~7× faster than any reranked mode.
- **Simplicity:** one model, no reranker, no BM25 index to keep consistent.
- **Cost:** a 2.24 GB download the first time, ~6 s to load when the server starts, ~1.5 GB RAM.

Everything stays configurable in `.env`. On a machine with little disk or RAM, use the lighter alternative (MiniLM + reranker, 5 candidates): just as accurate on this set, ~320 ms.

## 8. Limits of this evaluation

- **Small test set:** 50 + 12 questions, written and labelled by the developer. One question is 2 points. Several configurations reach 100 %, so the differences between the top ones are within the noise; the gaps for BM25 and hybrid are not.
- **The 0.75 cut-off was chosen on the same questions it is judged on.** It should be checked against real questions once people use the assistant (the question log will provide them).
- **Timings are from one laptop.** The order between configurations is what matters, not the exact milliseconds.
- **Retrieval only.** Answer quality (no invented rules, correct citations, replying in the question's language) is evaluated in the next step, with the LLM.

## 9. End to end, with the LLM (`qwen3.5:4b`, thinking off)

The whole assistant, run on the 50 answerable and 12 off-topic questions (`uv run python -m app.rag.evaluate_answers`, details in `backend/eval/answers.json`):

| Check | Result |
|---|---|
| Answerable questions answered, citing the right section | **48 / 50** |
| Replies in the language of the question (EN / FR / NL) | **48 / 48** answered |
| Off-topic questions refused (offer to ask HR, nothing invented) | **12 / 12** |
| Time per answer | ~5 s (clearly off-topic: 0.05 s, the LLM is not called) |

Choices made while testing:
- **Thinking mode off:** same answers, but 3–5 s instead of 44–62 s.
- **Structured output** (JSON schema `{found, answer, citations}`): the model sometimes wrote "the documents say nothing about pets" instead of `NOT_FOUND`, and the app counted that as an answer. With the schema, the decision no longer depends on wording.
- **No name in the personal context:** with the name, the 4B model answered "Camille peut…" instead of "vous pouvez…".
- **Two gates:** the retrieval score drops clearly unrelated questions; the LLM drops near-topic ones ("wifi password", "paternity leave").

Known limit: 2 questions are still refused although the rule exists: "beer with a client" (the policy says *alcohol*) and "what time on my first day" (*welcomed at 9 o'clock*). The model is cautious when the wording differs a lot. It errs on the safe side: the employee is offered HR rather than given a wrong rule.
