---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Hybrid Search Implementation

Atrium uses a hybrid search system that combines vector similarity and fuzzy text matches to deliver low-latency query speeds.

---

## 1. Hybrid Search Architecture

Atrium queries PostgreSQL through two separate indexes, fusing the results using Reciprocal Rank Fusion (RRF):

```
                     ┌──────────────────┐
                     │   User Query     │
                     └────────┬─────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
     Vector Cosine Search          Trigram Text Search
       (HNSW index)                  (GIN index)
               │                             │
               └──────────────┬──────────────┘
                              ▼
                 Reciprocal Rank Fusion (RRF)
               ┌─────────────────────────────┐
               │ RRF Score = Sum(1 / (k + r))│
               └──────────────┬──────────────┘
                              ▼
                      Reranking Engine
               (Xenova/ms-marco-MiniLM-L-6-v2)
                              │
                              ▼
                      Synthesized RAG
```

---

## 2. Search Paths

### Path A: Vector Search (HNSW)
- **Model**: ONNX compiled embeddings model yielding a 384-dimensional vector.
- **Index**: HNSW cosine similarity index (`idx_items_embedding`) configured with `m=16` and `ef_construction=64`.
- **Query Type**: Low-latency cosine search.

### Path B: Text Search (GIN Trigram)
- **Field**: Plaintext `summary` column (excludes the encrypted `raw_text`).
- **Index**: GIN trigram index (`idx_items_text_gin`) using `gin_trgm_ops`.
- **Query Type**: Performant fuzzy text matching.

---

## 3. Reciprocal Rank Fusion (RRF) & Reranking

1. **RRF Merge**: The results of vector and text searches are combined using Reciprocal Rank Fusion:
   $$\text{RRF Score} = \sum_{m \in M} \frac{1}{60 + r_m(d)}$$
   where $r_m(d)$ is the rank of document $d$ under search mechanism $m$.
2. **LLM Query Rewriting**: If enabled, the search service runs the user's query through the LLM cascade to expand/rewrite the query with synonyms before hitting the indexes.
3. **Cross-Encoder Reranker**: The top candidates are reranked using the configured Xenova cross-encoder model to select the top relevant chunks for the final context window.

---
