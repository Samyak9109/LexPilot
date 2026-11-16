# EVAL.md — LexPilot RAG & Generation Evaluation Report

This document reports the evaluation methodology, dataset structure, retrieval metrics, generation quality scores, and empirical latency benchmarks measured on the LexPilot AI pipeline.

---

## 1. Evaluation Setup

| Component | Specification |
|---|---|
| **Pipeline Architecture** | Ingest (pdfplumber) → Structure-aware Chunking → Embeddings (`gemini-embedding-001`) → Vector Search (MongoDB Atlas `$vectorSearch`) → CrossEncoder Reranker (`ms-marco-MiniLM-L-6-v2`) → LLM Generation (`gemini-3.5-flash-lite`) → Grounding Verification |
| **Frameworks** | LangChain, LangGraph, Ragas 0.4.4, Sentence-Transformers 3.x, FastAPI, Express.js |
| **Tracing & Observability**| Langfuse (OpenTelemetry span tracking), PostHog Node SDK (user events & feedback) |
| **Benchmark Hardware / Env** | Windows OS, Python 3.12 (via Astral uv virtual environment), Node.js v20+ |

### Execution Commands
```bash
# 1. Retrieval Evaluation (Precision@k, Recall@k, MRR, Hit Rate)
cd backend-fastapi && uv run python ../eval/retrieval_eval.py --doc-id <MONGO_DOC_ID>

# 2. Answer Quality Evaluation (Ragas Faithfulness, Relevancy, Precision, Recall)
cd backend-fastapi && uv run python ../eval/answer_eval.py --doc-id <MONGO_DOC_ID>

# 3. Latency & TTFT Benchmark (50 queries, p50 / p95)
cd backend-fastapi && uv run python -u ../eval/latency_eval.py --queries 50
```

---

## 2. Golden Evaluation Dataset (`/eval/dataset.json`)

A curated 40-question benchmark dataset constructed specifically for contract and legal agreement Q&A:

| Category | Count | Focus / Objective |
|---|---|---|
| **Easy** | 20 | Single-clause precision retrieval (parties, effective dates, payment schedules, notice periods, liability caps, dispute resolution). |
| **Multi-Hop** | 12 | Complex cross-clause reasoning across disjoint sections (e.g., early termination notice combined with fee schedules and IP survival). |
| **Unanswerable / Refusal** | 8 | Out-of-document facts, legal advice requests, and non-contractual business inquiries designed to test fail-closed refusal. |
| **Total** | **40** | Full taxonomy coverage across all 7 LexPilot clause classifications. |

*Note: Questions Q001–Q032 contain structured annotation placeholders for live document indexing; questions Q033–Q040 evaluate zero-citation refusal.*

---

## 3. Retrieval Metrics Table

Evaluated using `eval/retrieval_eval.py` at $k \in \{3, 5, 10\}$ comparing base Atlas Vector Search against neural CrossEncoder reranking:

| Metric | Base Vector Search | + CrossEncoder Reranker (`ms-marco-MiniLM-L-6-v2`) | Δ Improvement |
|---|---|---|---|
| **Precision@3** | *pending* | *pending* | — |
| **Precision@5** | *pending* | *pending* | — |
| **Precision@10** | *pending* | *pending* | — |
| **Recall@3** | *pending* | *pending* | — |
| **Recall@5** | *pending* | *pending* | — |
| **Recall@10** | *pending* | *pending* | — |
| **Hit Rate@3** | *pending* | *pending* | — |
| **Hit Rate@5** | *pending* | *pending* | — |
| **Hit Rate@10** | *pending* | *pending* | — |
| **Mean Reciprocal Rank (MRR)** | *pending* | *pending* | — |

*Status: Retrieval metrics require populating MongoDB clause IDs for a user test document in `eval/dataset.json`. The evaluation script is fully implemented and tested.*

---

## 4. Answer Quality Metrics (Ragas)

Evaluated using `eval/answer_eval.py` with LangChain LLM and Embeddings wrappers:

| Metric | Measured Score | Evaluation Target | Status |
|---|---|---|---|
| **Faithfulness** | *pending* | $\ge 0.90$ | Awaiting user ground-truth document annotation |
| **Answer Relevancy** | *pending* | $\ge 0.85$ | Awaiting user ground-truth document annotation |
| **Context Precision** | *pending* | $\ge 0.80$ | Awaiting user ground-truth document annotation |
| **Context Recall** | *pending* | $\ge 0.85$ | Awaiting user ground-truth document annotation |
| **Refusal Rate (Unanswerable)** | *pending* | $100\%$ | Evaluated when target document is provided |

---

## 5. Measured Latency Table (N = 50 Queries)

Empirical latency profiled over 50 real queries against the Gemini API with active CrossEncoder reranking and token-level streaming:

| Pipeline Component | p50 (ms) | p95 (ms) | Mean (ms) |
|---|---|---|---|
| **Retrieval** (Embedding + Vector Search) | 538.64 | 4477.49 | 1226.75 |
| **Rerank** (CrossEncoder `ms-marco-MiniLM-L-6-v2`) | 32.25 | 38.97 | 33.13 |
| **Time-to-First-Token (TTFT)** | 1281.73 | 4258.60 | 1822.17 |
| **LLM Generation** | 1379.60 | 4287.85 | 2018.54 |
| **Total End-to-End Latency** | **1952.23** | **8558.87** | **3278.44** |

*Raw per-query records logged in `eval/results/latency_2026-11-16.json`.*

---

## 6. System Limitations & Production Roadmap

1. **Fixed-Token vs. Structure Chunking**: LexPilot mandates heading/paragraph structure segmentation (`segmentation.py`). Direct side-by-side benchmarking against a fixed token window requires dual indexing in MongoDB Atlas.
2. **Cold-Start Reranker Loading**: PyTorch model weights for `cross-encoder/ms-marco-MiniLM-L-6-v2` take $\approx 1.5\text{s}$ to load into memory on cold start, but subsequent inference is fast ($32.25\text{ms}$ p50). In production, keep the reranker resident in worker memory.
3. **API Rate Quotas & Jitter**: Cloud LLM API response times vary (p50: 1.95s vs p95: 8.56s). Introducing semantic response caching for identical queries will mitigate tail latency.

---

## 7. Resume Impact Bullets (Based on Real Measured Data)

- **Engineered an end-to-end evaluation harness and latency profiling suite** for a legal contract RAG system, measuring a p50 end-to-end latency of **1,952ms** with a streaming Time-to-First-Token (TTFT) of **1,282ms** benchmarked across 50 live queries with Langfuse tracing.
- **Implemented neural two-stage retrieval** using a CrossEncoder (`ms-marco-MiniLM-L-6-v2`) reranker adding just **32ms** p50 overhead over base vector search, supported by an automated evaluation pipeline measuring Precision@k, Recall@k, and MRR.
- **Built production telemetry and user feedback infrastructure** using PostHog, in-database session and query logging, thumbs up/down UI rating capture, and a real-time `/admin/stats` aggregation endpoint.
