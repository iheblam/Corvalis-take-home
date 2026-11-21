50 questions (en: 21, fr: 18, nl: 11), reranker BAAI/bge-reranker-v2-m3-int8, 8 candidates

| Embedding model | Mode | Rerank cand. | Hit@1 | Hit@3 | MRR | EN Hit@1 | FR Hit@1 | NL Hit@1 | Latency mean | p95 |
|---|---|---|---|---|---|---|---|---|---|---|
| paraphrase-multilingual-MiniLM-L12-v2 | dense | - | 94% | 100% | 0.967 | 95% | 94% | 91% | 4.5 ms | 5.3 ms |
| paraphrase-multilingual-MiniLM-L12-v2 | dense_rerank | 5 | 100% | 100% | 1.000 | 100% | 100% | 100% | 320.6 ms | 395.6 ms |
| paraphrase-multilingual-MiniLM-L12-v2 | sparse | - | 46% | 58% | 0.507 | 71% | 33% | 18% | 0.1 ms | 0.1 ms |
| paraphrase-multilingual-MiniLM-L12-v2 | sparse_rerank | 5 | 56% | 58% | 0.570 | 76% | 39% | 45% | 115.2 ms | 322.0 ms |
| paraphrase-multilingual-MiniLM-L12-v2 | hybrid | - | 86% | 96% | 0.917 | 76% | 94% | 91% | 4.5 ms | 5.4 ms |
| paraphrase-multilingual-MiniLM-L12-v2 | hybrid_rerank | 5 | 100% | 100% | 1.000 | 100% | 100% | 100% | 313.8 ms | 379.6 ms |
| multilingual-e5-large | dense | - | 100% | 100% | 1.000 | 100% | 100% | 100% | 45.7 ms | 53.4 ms |
| multilingual-e5-large | dense_rerank | 5 | 100% | 100% | 1.000 | 100% | 100% | 100% | 362.7 ms | 412.9 ms |
| multilingual-e5-large | sparse | - | 46% | 58% | 0.507 | 71% | 33% | 18% | 0.1 ms | 0.1 ms |
| multilingual-e5-large | sparse_rerank | 5 | 56% | 58% | 0.570 | 76% | 39% | 45% | 118.2 ms | 333.8 ms |
| multilingual-e5-large | hybrid | - | 90% | 96% | 0.937 | 76% | 100% | 100% | 46.1 ms | 53.0 ms |
| multilingual-e5-large | hybrid_rerank | 5 | 100% | 100% | 1.000 | 100% | 100% | 100% | 356.2 ms | 410.3 ms |

| Embedding model | Mode | Answerable vs off-topic AUC | Best threshold | Accuracy |
|---|---|---|---|---|
| paraphrase-multilingual-MiniLM-L12-v2 | dense | 0.86 | 0.246 | 84% |
| paraphrase-multilingual-MiniLM-L12-v2 | dense_rerank | 0.98 | -6.326 | 95% |
| paraphrase-multilingual-MiniLM-L12-v2 | sparse | 0.72 | -inf | 81% |
| paraphrase-multilingual-MiniLM-L12-v2 | sparse_rerank | 0.74 | -inf | 81% |
| paraphrase-multilingual-MiniLM-L12-v2 | hybrid | 0.69 | 0.016 | 81% |
| paraphrase-multilingual-MiniLM-L12-v2 | hybrid_rerank | 0.98 | -6.326 | 95% |
| multilingual-e5-large | dense | 0.98 | 0.783 | 95% |
| multilingual-e5-large | dense_rerank | 0.98 | -7.304 | 94% |
| multilingual-e5-large | sparse | 0.72 | -inf | 81% |
| multilingual-e5-large | sparse_rerank | 0.74 | -inf | 81% |
| multilingual-e5-large | hybrid | 0.69 | 0.016 | 81% |
| multilingual-e5-large | hybrid_rerank | 0.98 | -7.529 | 94% |

Details (misses per mode): C:\Users\ihebl\Documents\arckone home task\corvalis-leave\backend\eval\results.json
