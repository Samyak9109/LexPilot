# architecture.md — LexPilot Technical Architecture & Engineering Decisions

**Status:** Authoritative for HOW the product is built. Must satisfy every requirement in `PRD.md`. Takes priority over `design.md` and `phases.md` in case of conflict.
**Rule:** A deliberate architectural decision documented here (with rationale) must be preserved by any implementing agent unless explicitly instructed otherwise.

---

## 1. System Overview

```
┌────────────────┐      ┌──────────────────────┐      ┌───────────────────────┐
│  React Frontend │ ───▶ │  Express (Node) API   │ ───▶ │  FastAPI (Python) AI   │
│  (doc viewer,    │      │  auth, user mgmt,     │      │  parsing, LangGraph    │
│  chat, compare)  │ ◀─── │  document metadata,   │ ◀─── │  pipeline, LLM calls   │
└────────────────┘      │  history               │      └───────────┬───────────┘
                          └──────────┬────────────┘                  │
                                     │                                │
                                     ▼                                ▼
                          ┌────────────────────────────────────────────┐
                          │            MongoDB Atlas                     │
                          │  users / documents (metadata) / vector index │
                          └────────────────────────────────────────────┘
```

**Ownership boundary (hard rule):** Express owns auth, session, user data, and document metadata. FastAPI owns parsing, extraction, embeddings, and all LLM orchestration. Neither service reaches into the other's responsibility — communication is exclusively via a defined internal REST contract (§4). This boundary exists to keep the AI pipeline independently testable and swappable without touching auth/user logic.

---

## 2. Component Responsibilities

| Component | Responsibility | Does NOT do |
|---|---|---|
| React frontend | Rendering, user interaction, calling Express API only | Never calls FastAPI directly |
| Express (Node) | Auth, session, user/document metadata, orchestrating calls to FastAPI, serving results to frontend | Never performs parsing, embedding, or LLM calls |
| FastAPI (Python) | Document parsing, clause segmentation, LangGraph pipeline execution, embeddings, LLM calls, grounding verification | Never handles user auth/session state |
| MongoDB Atlas | Persists users, document metadata, extracted structured data, vector embeddings | N/A |

Rationale: two backends is added complexity, accepted deliberately because it lets the AI pipeline (Python-native LangChain/LangGraph ecosystem) run in the language it's built for, while auth/user management stays in the team's primary web stack (MERN). This is the documented tradeoff — do not "simplify" by merging responsibilities into one service without updating this file first.

---

## 3. Data Model (MongoDB Atlas)

**Collections:**

- `users` — account/auth data (owned by Express)
- `documents` — metadata: `{_id, userId, filename, uploadDate, status, jurisdiction, docType}`
- `document_clauses` — structured extraction output: `{documentId, clauseType, originalText, sourceSpan, simpleExplanation, detailedExplanation, riskTier, riskReasoning, confidence}`
- `document_chunks` — vector-indexed retrieval units: `{documentId, chunkText, embedding, clauseType, sectionRef}` (Atlas Vector Search index on `embedding`)
- `qa_history` — `{documentId, userId, question, answer, citedClauseIds, timestamp}`
- `comparisons` — `{documentIdA, documentIdB, alignedClauses[], generatedAt}`

**Rationale for MongoDB Atlas Vector Search over a separate vector DB (Chroma/pgvector):** the team already runs Mongo as part of MERN. Adding a second database purely for vectors increases operational surface area without a clear MVP-stage benefit. Revisit only if Atlas Vector Search limits (index size, query latency) are actually hit in practice — do not pre-optimize this away.

---

## 4. API Contracts

### Frontend ↔ Express
- `POST /api/documents` — upload (multipart), returns `documentId`, triggers async processing
- `GET /api/documents/:id` — status + processed result (extraction, risk tags, explanations)
- `POST /api/documents/:id/ask` — question → proxies to FastAPI, returns answer + citations
- `POST /api/compare` — `{documentIdA, documentIdB}` → proxies to FastAPI, returns aligned table
- `GET /api/documents/:id/checklist` — generates/returns exportable checklist

### Express ↔ FastAPI (internal only, not exposed publicly)
- `POST /internal/process` — `{documentId, fileUrl, jurisdiction?}` → runs full LangGraph pipeline, writes results directly to `document_clauses`/`document_chunks`, returns status
- `POST /internal/ask` — `{documentId, question}` → RAG retrieval + grounded generation, returns `{answer, citations[], confidence}`
- `POST /internal/compare` — `{documentIdA, documentIdB}` → semantic alignment, returns aligned table

All internal endpoints require a service-level shared secret (not user auth) — Express is the only authorized caller.

---

## 5. AI Pipeline Architecture (LangGraph)

```
extract_entities → classify_clauses → risk_score → generate_explanations
```

**Node contract (each node independently testable):**
- `extract_entities`: input = parsed document text + structural segmentation; output = structured entities matching Pydantic schema (parties, dates, terms) with `source_span` per field
- `classify_clauses`: input = segmented text blocks; output = clause-type label per block from the defined taxonomy (PRD.md §4.a)
- `risk_score`: input = classified clauses (+ jurisdiction if provided); output = risk tier + reasoning string per clause
- `generate_explanations`: input = classified clauses; output = plain-English + detailed explanations, generated in a **separate pass** from extraction (deliberate — conflating extraction and explanation generation is a documented source of hallucination, see §6)

Each node is a discrete, independently callable function/prompt — this is a deliberate design choice to keep the pipeline debuggable and evaluable per-stage (NFR-008), not a suggestion to be "optimized" into a single mega-prompt.

**Document parsing/chunking:** Segmentation follows document structure (headings, numbering) rather than fixed token windows. This is a hard architectural requirement, not a style preference — fixed-window chunking has been identified as a direct cause of broken cross-references (e.g., "as defined in Section 2.1" losing its referent) and degraded retrieval quality.

---

## 6. RAG & Hallucination Mitigation Architecture

This section is binding — it implements PRD.md §6 (AI/GenAI Requirements) and must not be weakened without updating the PRD first.

**6.1 Retrieval layer**
- Retrieve top 8–10 candidate chunks, re-rank, pass top 3–4 to generation
- Metadata-filtered retrieval by clause type where the question implies a specific clause category

**6.2 Generation layer**
- Citation-or-refuse system prompt: model must cite the exact clause it's answering from, or explicitly state the document doesn't address the question
- Structured output (Pydantic schema) for extraction — no free-text extraction
- Temperature 0–0.2 for extraction and Q&A (not creative generation)
- Extraction and explanation are separate LLM calls (see §5)

**6.3 Verification layer (mandatory, non-optional)**
- Post-hoc grounding check: every cited `source_span` is programmatically verified to exist (substring/fuzzy match) in the retrieved source chunk before the answer is returned to the frontend. Failing this check means the claim is **discarded or flagged**, never silently shown.
- Confidence scoring per extracted field/answer; low-confidence items are visually distinguished (design.md §4)

**6.4 Process layer**
- A labeled evaluation set (10–15 documents with known correct extractions) is run against every change to prompts, chunking, or pipeline structure — required before merging changes that touch the AI pipeline (see phases.md acceptance criteria)
- Explicit scope refusal: prompts instruct the model not to use outside legal knowledge; questions about law in general (not the specific document) are refused, not answered from training data

---

## 7. Security & Auth

- Session-based auth (Express), documents scoped by `userId` at the query layer — every document read/write query includes a `userId` filter, no exceptions
- Internal FastAPI endpoints authenticated via shared service secret, never exposed to the public internet directly
- Documents encrypted at rest (MongoDB Atlas native encryption) and in transit (TLS)
- No document content used for LLM provider training (verify provider API terms/opt-out settings at implementation time)

---

## 8. Error Handling & Resilience

- Partial pipeline failure: if `risk_score` fails but `extract_entities`/`classify_clauses` succeeded, the document still shows extraction results with risk section marked "unavailable — retry" — never blocks the whole result on one node's failure
- LLM provider outage: fail visibly with retry option; never silently degrade to an unlabeled fallback response
- File parsing failure (corrupted/unsupported file): explicit, specific error returned to frontend at upload time, not discovered later in the pipeline

---

## 9. Engineering Decisions Log (ADR-style)

**ED-001 — Two backends (Express + FastAPI) instead of one**
Decision: Keep Node/Express for auth+user+metadata, Python/FastAPI for the AI pipeline.
Rationale: Python-native AI ecosystem (LangChain/LangGraph) vs. team's existing MERN fluency for the web layer. Tradeoff accepted: added integration surface, mitigated by a strict internal API contract (§4).
Status: Deliberate, preserve unless explicitly revisited.

**ED-002 — MongoDB Atlas Vector Search instead of Chroma/pgvector**
Decision: Single database for metadata + vectors.
Rationale: Avoids a third infra dependency at MVP stage; team already runs Mongo.
Status: Deliberate. Revisit only if Atlas Vector Search hits real scale/latency limits in practice, not preemptively.

**ED-003 — Structure-aware chunking instead of fixed-token chunking**
Decision: Chunk by document heading/section structure.
Rationale: Fixed-token chunking breaks legal cross-references and directly degrades retrieval/grounding quality.
Status: Hard requirement, not a style choice.

**ED-004 — Extraction and explanation as separate LLM passes**
Decision: `extract_entities`/`classify_clauses` never share a prompt with `generate_explanations`.
Rationale: Conflating fact-extraction with prose explanation was identified as a direct hallucination vector.
Status: Deliberate, preserve.

**ED-005 — Grounding verification is mandatory, not a nice-to-have**
Decision: No AI-generated claim is shown to the user without a passed post-hoc grounding check.
Rationale: Domain stakes (legal misinterpretation) require fail-closed behavior over fail-open.
Status: Hard requirement.

---

## 10. Tech Stack Summary

| Layer | Choice |
|---|---|
| AI backend | FastAPI + LangChain/LangGraph (Python) |
| Web backend | Express (Node) |
| Vector store | MongoDB Atlas Vector Search |
| Parsing | PyMuPDF / pdfplumber |
| Frontend | React |
| LLM | Provider-abstracted (Claude/GPT class) |
| OCR | Tesseract (deferred to post-MVP) |

---

## 11. Testing Strategy

- Unit tests per LangGraph node (independently, per §5 contract)
- Integration test: full pipeline run against the labeled eval set (§6.4), required before any AI-pipeline-touching change is merged
- API contract tests for Express↔FastAPI internal endpoints
- Auth boundary test: user A cannot access user B's document via any endpoint (implements FR-006 acceptance criteria)

---

## 12. Deployment & Environments

- Environments: local, staging, production — each with isolated MongoDB Atlas cluster/database
- Secrets (LLM API keys, internal service secret) via environment variables, never committed
- FastAPI workers stateless — horizontal scaling requires no code change (implements NFR-003)
