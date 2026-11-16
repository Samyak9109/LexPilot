# eval/ — LexPilot Evaluation Suite

This directory contains all evaluation artefacts for the LexPilot RAG pipeline.

## Files

| File | Phase | Status |
|------|-------|--------|
| `dataset.json` | Phase 2 | ✅ Created — **needs annotation** |
| `retrieval_eval.py` | Phase 3 | 🔜 Pending |
| `answer_eval.py` | Phase 4 | 🔜 Pending |
| `latency_eval.py` | Phase 5 | 🔜 Pending |
| `results/` | Phase 4+ | 🔜 Pending |

---

## Dataset Annotation Guide (`dataset.json`)

The dataset ships with **40 questions** but many `ground_truth_answer` fields contain `ANNOTATOR:` placeholders. You **must** replace these before running any metrics.

### Steps

1. **Pick a real test document** — a PDF/DOCX contract you can upload to LexPilot (NDA, employment agreement, lease, or vendor contract).
2. **Upload it** through the LexPilot UI and note the `documentId` from MongoDB.
3. **For each question** with `needs_review: true`:
   - Find the clause in your document that answers the question.
   - Replace the `ANNOTATOR:` placeholder in `ground_truth_answer` with the exact text or a close paraphrase.
   - Replace `CHUNK_*` placeholders in `relevant_chunk_ids` with the real `clauseId` values from MongoDB `document_chunks` collection.
4. **For unanswerable questions** (`category: "unanswerable"`): leave `ground_truth_answer` as `"NOT_IN_DOCUMENT"` — no annotation needed.

### Coverage

| Category | Count | Purpose |
|----------|-------|---------|
| `easy` | 20 | Single-clause retrieval; baseline recall test |
| `multi_hop` | 12 | Cross-clause reasoning; tests context assembly |
| `unanswerable` | 8 | Out-of-document / legal-advice refusal; tests fail-closed behaviour |
| **Total** | **40** | — |

### Clause Types Covered

`parties`, `effective_date`, `payment_terms`, `termination_conditions`, `confidentiality`, `liability`, `dispute_resolution`, `general`

All map directly to the taxonomy in `graph.py` `ClauseClassification`.

---

## Running Evaluations (once annotated)

```bash
# Phase 3 — Retrieval metrics
cd backend-fastapi
python ../eval/retrieval_eval.py

# Phase 4 — Answer quality
python ../eval/answer_eval.py

# Phase 5 — Latency
python ../eval/latency_eval.py
```
