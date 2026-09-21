# PRD.md — LexPilot Product Requirements Document

**Status:** Authoritative source of truth for product scope. Governs `architecture.md`, `design.md`, `phases.md`.
**Conflict priority:** PRD.md → architecture.md → design.md → phases.md → existing implementation (unless an existing decision is explicitly documented as deliberate in architecture.md).

---

## 1. Product Overview

**Product name:** LexPilot

**One-line description:** A GenAI-powered legal document copilot that helps non-lawyers understand, analyze, compare, and navigate legal documents in plain language.

**Problem being solved:** People routinely sign legal documents (leases, employment offers, NDAs, freelance contracts) without understanding what they're agreeing to, because the language is dense, obligations are buried, and professional review is expensive or inaccessible for low-stakes decisions.

**Why it matters:** Misunderstood obligations lead to real financial and legal harm (unfavorable lease terms, unenforceable non-competes signed unknowingly, missed renewal deadlines). Closing the comprehension gap reduces harm without requiring a lawyer for every document.

**Target users:**
- Freelancers reviewing client contracts
- Tenants reviewing lease agreements
- Employees reviewing offer letters / employment agreements
- Early-stage founders reviewing NDAs and vendor agreements

**Primary use cases:**
- Understand a single legal document in plain language
- Identify risky or unusual clauses before signing
- Ask specific questions about a document and get a grounded, cited answer
- Compare two versions of a document or two competing offers
- Generate a checklist and a list of questions to bring to a lawyer

**Product vision:** Turn complicated legal documents into understandable information, evidence-backed insights, and actionable next steps — without replacing professional legal judgment.

**Product goals:**
- G1: Reduce time-to-understanding for a legal document from hours to minutes
- G2: Ground every AI claim in a traceable source clause (zero unsupported claims)
- G3: Make risk visible before a user signs, not after
- G4: Never present output in a way that could be mistaken for legal advice

---

## 2. User Personas

### Persona: Freelance Ananya
- **Technical ability:** Comfortable with web apps, not technical
- **Goals:** Quickly check if a client contract has unfair payment or IP terms before signing
- **Pain points:** Can't afford a lawyer for every small contract; doesn't know which clauses matter
- **Typical workflow:** Uploads PDF, skims the risk summary, asks "what happens if I miss a deadline"
- **Expected behavior:** Wants a fast, plain-language answer, not legal jargon
- **Success looks like:** Signs (or renegotiates) with confidence in under 10 minutes

### Persona: First-time Renter Rohan
- **Technical ability:** Basic smartphone/web user
- **Goals:** Understand a rental agreement before signing, know when it renews/what happens if he leaves early
- **Pain points:** Legal language is intimidating; doesn't know what's "normal" for a lease
- **Typical workflow:** Uploads lease photo/PDF, reads simple explanations clause by clause
- **Expected behavior:** Wants clear risk flags and a checklist he can act on
- **Success looks like:** Correctly identifies deposit/termination terms without needing to call anyone

### Persona: Founder Priya
- **Technical ability:** High — technical founder, comfortable with tools
- **Goals:** Compare two vendor contracts or two investor term sheets side by side
- **Pain points:** Manually diffing dense contracts is slow and error-prone
- **Typical workflow:** Uploads two documents, uses compare mode, exports a checklist for her advisor
- **Expected behavior:** Wants structured, comparable output she can forward to counsel
- **Success looks like:** Walks into a lawyer conversation with specific, informed questions already prepared

---

## 3. Core User Journeys

### Journey A — Single Document Understanding
- **Entry point:** Home screen "Upload document"
- **User action:** Uploads PDF/DOCX
- **System response:** Parses, extracts clauses, generates plain-English summary + risk tags
- **Data required:** File (PDF/DOCX, <20MB), optional jurisdiction selection
- **Success state:** Dashboard shows structured summary, risk tiers, and chat is ready
- **Failure state:** Unsupported file type / corrupted file → explicit error, no silent failure
- **Empty state:** No document uploaded yet → clear call-to-action, no blank dashboard
- **Loading state:** Progress indicator during parse + extraction (may take 10-30s for longer docs)
- **Recovery path:** Re-upload option always visible; partial extraction failures shown per-section, not as a full-page error

### Journey B — Grounded Q&A
- **Entry point:** Chat panel on document dashboard
- **User action:** Types a question about the uploaded document
- **System response:** RAG retrieval → answer with cited clause/section
- **Data required:** Existing processed document, user question
- **Success state:** Answer displayed with visible citation link to source clause
- **Failure state:** Question unanswerable from document → explicit "not addressed in this document," never a guess
- **Empty state:** No prior chat history → suggested starter questions shown
- **Loading state:** Typing/thinking indicator while retrieval + generation run
- **Recovery path:** User can rephrase; prior answers remain visible

### Journey C — Document Comparison
- **Entry point:** "Compare documents" action, requires 2 processed documents
- **User action:** Selects two documents
- **System response:** Semantic clause alignment → side-by-side table of same/different/missing
- **Data required:** Two fully processed documents
- **Success state:** Aligned comparison table rendered, differences highlighted
- **Failure state:** Documents too dissimilar to align meaningfully → explicit notice, not a forced/garbage comparison
- **Empty state:** Fewer than 2 documents available → prompt to upload a second
- **Loading state:** Comparison processing indicator (may take longer than single-doc analysis)
- **Recovery path:** User can swap documents or re-run comparison

### Journey D — Actionable Output / Export
- **Entry point:** "Generate checklist" button on dashboard
- **User action:** Requests checklist / questions-for-lawyer export
- **System response:** Generates structured checklist derived from flagged risks and key dates
- **Data required:** Fully processed document with risk tags
- **Success state:** Downloadable/exportable checklist (MD/PDF)
- **Failure state:** Document has no flagged items → checklist still generated but explicitly states "no significant risks flagged," not an empty broken export
- **Empty state:** N/A (always derivable once document is processed)
- **Loading state:** Brief generation indicator
- **Recovery path:** Regenerate on demand

---

## 4. Functional Requirements

**FR-001 — Document Upload**
- Purpose: Ingest a legal document for analysis
- User story: As a user, I want to upload a PDF/DOCX so LexPilot can analyze it
- Inputs: File (PDF, DOCX), max 20MB
- Outputs: Stored document reference + processing status
- Business logic: Validate file type/size before accepting; queue for processing
- Validation rules: Reject non-PDF/DOCX, reject >20MB, reject empty files
- Error handling: Explicit user-facing error per validation failure (not generic "upload failed")
- Permissions: Authenticated user only
- Dependencies: Auth (FR-006)
- Edge cases: Scanned/image-only PDFs (no extractable text) → flagged as low-confidence/OCR-required, not silently processed as empty
- Acceptance criteria: Valid file uploads succeed and trigger processing within 2s of upload completion; invalid files are rejected with a specific reason shown to the user

**FR-002 — Clause Extraction**
- Purpose: Convert raw document text into structured clause data
- User story: As a user, I want key clauses identified automatically
- Inputs: Parsed document text, section/heading structure
- Outputs: Structured JSON — clause type, original text, source_span, confidence score
- Business logic: Segment by document structure (headings/numbering), not fixed token count; classify each segment against a defined clause taxonomy (see 4.a)
- Validation rules: Every extracted fact must carry a source_span traceable to original text
- Error handling: Low-confidence extractions flagged, never silently presented as certain
- Permissions: N/A (system process)
- Dependencies: FR-001
- Edge cases: Clauses split across page breaks; cross-references between sections ("as defined in Section 2.1")
- Acceptance criteria: ≥90% of target clause types correctly identified on the internal eval set (see NFR-009)

*4.a Minimum clause taxonomy for MVP:* parties, effective date, payment terms, termination conditions, confidentiality, liability/indemnification, dispute resolution/governing law.

**FR-003 — Plain-English Explanation**
- Purpose: Make legal clauses understandable
- User story: As a user, I want each clause explained in plain language
- Inputs: Extracted clause (FR-002 output)
- Outputs: Original text + simple explanation (+ detailed explanation in full version)
- Business logic: Explanation generation is a separate pass from extraction (no conflation, see architecture.md §5)
- Validation rules: Explanation must not introduce facts absent from the source clause
- Error handling: If generation fails, show original clause with an explicit "explanation unavailable" state, never a blank
- Permissions: Authenticated user
- Dependencies: FR-002
- Edge cases: Clauses with embedded cross-references need context from linked clauses to explain correctly
- Acceptance criteria: Every displayed explanation is paired with the original clause it explains, side by side

**FR-004 — Risk & Obligation Detection**
- Purpose: Surface risky or unusual clauses
- User story: As a user, I want to know which clauses are unusual before I sign
- Inputs: Extracted + classified clauses
- Outputs: Risk tier (🔴/🟡/🟢) + reasoning per clause
- Business logic: Risk assessment reasoning must be shown, never a bare tag
- Validation rules: Risk tier requires jurisdiction context where available (see FR-008)
- Error handling: Uncertain risk classification → default to 🟡 with "review recommended," never silently omitted
- Permissions: Authenticated user
- Dependencies: FR-002, FR-008 (jurisdiction, if selected)
- Edge cases: Jurisdiction not selected → risk assessment must state its assumptions explicitly
- Acceptance criteria: 100% of risk tags include a one-sentence reasoning string

**FR-005 — Grounded Q&A**
- Purpose: Answer user questions using only the uploaded document
- User story: As a user, I want to ask questions and get answers grounded in my document
- Inputs: User question (text), processed document
- Outputs: Answer + cited source clause(s)
- Business logic: RAG retrieval → generation with citation-or-refuse prompting (see architecture.md §6)
- Validation rules: Every generated claim must be checked against source via grounding verification (architecture.md §6.3) before display
- Error handling: Question unanswerable from document → explicit refusal, never extrapolation from general knowledge
- Permissions: Authenticated user, document owner only
- Dependencies: FR-002
- Edge cases: Ambiguous questions; questions about law generally rather than the document specifically (must be refused/redirected)
- Acceptance criteria: 0% of answers presented without a visible citation; refusal rate on out-of-document questions verified against eval set

**FR-006 — Authentication & Document Ownership**
- Purpose: Restrict access to a user's own documents
- User story: As a user, I only want my documents visible to me
- Inputs: Credentials / session token
- Outputs: Authenticated session
- Business logic: Standard session-based auth; documents scoped to owning user ID
- Validation rules: No cross-user document access under any circumstance
- Error handling: Unauthenticated access attempts → redirect to login, no partial data exposure
- Permissions: N/A (this is the permission system)
- Dependencies: None
- Edge cases: Session expiry mid-upload
- Acceptance criteria: Automated test confirms user A cannot retrieve user B's document via any endpoint

**FR-007 — Document Comparison**
- Purpose: Compare two documents clause-by-clause
- User story: As a user, I want to compare two contracts side by side
- Inputs: Two processed document IDs
- Outputs: Aligned comparison table (same/different/missing per clause type)
- Business logic: Semantic alignment by clause type + embedding similarity, not raw text diff
- Validation rules: Alignment confidence per matched pair; low-confidence matches flagged
- Error handling: Documents too structurally dissimilar → explicit "cannot meaningfully compare" rather than forced output
- Permissions: Authenticated user, owner of both documents
- Dependencies: FR-002 on both documents
- Edge cases: Documents of different types (e.g., NDA vs. lease) — should refuse or warn rather than force comparison
- Acceptance criteria: Comparison table renders only clause types present in at least one document; no fabricated rows

**FR-008 — Jurisdiction Context (full version)**
- Purpose: Adjust risk analysis to the relevant legal jurisdiction
- User story: As a user, I want risk flags that reflect my country's norms
- Inputs: User-selected jurisdiction (India/US/UK at launch)
- Outputs: Jurisdiction-aware risk reasoning
- Business logic: Jurisdiction selection modifies the prompt context for FR-004
- Validation rules: If no jurisdiction selected, system must state analysis is jurisdiction-agnostic
- Error handling: N/A
- Permissions: Authenticated user
- Dependencies: FR-004
- Edge cases: Document doesn't specify governing law but user selects a different jurisdiction — surface the mismatch
- Acceptance criteria: Risk reasoning text explicitly references the selected jurisdiction when one is chosen

**FR-009 — Exportable Checklist / Questions for Lawyer**
- Purpose: Give users actionable next steps
- User story: As a user, I want a checklist and questions I can bring to a lawyer
- Inputs: Processed document with risk tags
- Outputs: Exportable checklist (MD/PDF)
- Business logic: Derived from flagged risks + key dates; regenerable on demand
- Validation rules: Checklist items must trace back to a specific clause
- Error handling: No flagged risks → checklist explicitly states this rather than exporting empty
- Permissions: Authenticated user, document owner
- Dependencies: FR-004
- Edge cases: N/A
- Acceptance criteria: Every checklist item links back to a source clause

**FR-010 — Key-Date Tracking**
- Purpose: Highlight important deadlines in the contract
- User story: As a user, I want to see when my contract expires or renews
- Inputs: Parsed document text
- Outputs: List of dates/deadlines
- Business logic: LLM extracts dates; UI displays them. No active email reminders.
- Acceptance criteria: Dates are displayed at the top of the document view.

**FR-011 — Legal Glossary**
- Purpose: Define complex legal jargon automatically
- User story: As a user, I want legal terms defined so I don't have to Google them
- Inputs: Parsed document text
- Outputs: Definitions of complex terms found in the text
- Business logic: LLM identifies jargon and provides definitions.
- Acceptance criteria: Glossary terms are displayed with the clause.

**FR-012 — Standard-Clause Benchmarking**
- Purpose: Compare user's terms to market standard
- User story: As a user, I want to know what is "normal" for this type of clause
- Inputs: Parsed document text
- Outputs: Market benchmarking explanation
- Business logic: LLM provides a brief market comparison during risk assessment.
- Acceptance criteria: Benchmark text is displayed below the risk assessment.

**FR-013 — Multi-Language Explanations**
- Purpose: Explain legal text in the user's preferred language
- User story: As a user, I want explanations in my native language
- Inputs: Parsed document text, target language
- Outputs: Explanations translated to the target language
- Business logic: LLM generates the simple explanation in the chosen language.
- Acceptance criteria: Explanations are rendered in the selected language.

---

## 5. Non-Functional Requirements

- **NFR-001 (Performance):** Single-document analysis (≤20 pages) completes in ≤30s end-to-end.
- **NFR-002 (Security):** Documents encrypted at rest and in transit; no cross-user access (see FR-006).
- **NFR-003 (Scalability):** Architecture must support moving from single-instance to horizontally scaled processing without redesign (stateless FastAPI workers).
- **NFR-004 (Reliability):** Partial pipeline failure (e.g., risk-scoring fails) must not block delivery of successfully completed steps (e.g., extraction still shown).
- **NFR-005 (Accessibility):** WCAG 2.1 AA minimum for all core screens (see design.md §5).
- **NFR-006 (Responsive behavior):** Fully usable on mobile viewport (≥375px width) for upload, chat, and summary views at minimum.
- **NFR-007 (Browser compatibility):** Latest two versions of Chrome, Firefox, Safari, Edge.
- **NFR-008 (Maintainability):** LangGraph pipeline nodes must remain independently testable (see architecture.md §5).
- **NFR-009 (Observability):** Every extraction/Q&A pipeline run is logged with input doc ID, node-level outputs, and grounding-check results for debugging and eval.
- **NFR-010 (Privacy/Data protection):** Raw document content is not retained longer than necessary for the user's active session unless the user explicitly opts into persistent storage; extracted structured data may be retained per user's account.
- **NFR-011 (Data protection — sensitive content):** No document content is used for model training or shared with third parties beyond the LLM API call required to process it.

---

## 6. AI / GenAI Requirements

- **AI features:** Clause extraction, plain-English explanation, risk scoring, grounded Q&A, semantic document comparison.
- **Models/providers:** LLM via API (Claude or GPT class model) — provider abstracted behind a single interface, not hardcoded (see architecture.md §4).
- **Prompt responsibilities:** Extraction prompts are schema-bound (Pydantic); explanation prompts are separate from extraction prompts; Q&A prompts enforce citation-or-refuse (see architecture.md §6).
- **Context handling:** Only retrieved, relevant chunks are passed to generation — full-document dumping into context is disallowed for cost and grounding reasons.
- **RAG requirements:** Chunking by structural boundary (heading/section), not fixed token windows. Retrieval must be filterable by clause-type metadata.
- **Embeddings:** Generated per clause-level chunk at processing time; re-generated if the source document is re-processed.
- **Vector database requirements:** MongoDB Atlas Vector Search (see architecture.md §3 for rationale).
- **Agent behavior:** LangGraph pipeline with explicit, separately-testable nodes: `extract_entities → classify_clauses → risk_score → generate_explanations`. No single monolithic prompt performs multiple responsibilities.
- **Tool usage:** N/A for MVP (no external tool calls beyond the LLM API and internal retrieval); reserved for future agent expansion (e.g., web search for jurisdiction lookups).
- **Guardrails:** Citation-or-refuse prompting; explicit "no outside legal knowledge" instruction; low temperature (0–0.2) for extraction/Q&A; structured output schemas.
- **Hallucination mitigation:** Four-layer approach — retrieval quality, generation constraints, post-hoc grounding verification (source_span existence check), and process-level evaluation (see architecture.md §6 for full detail). This is a hard product requirement, not an optimization.
- **Citation requirements:** Every Q&A answer and every risk tag must display a traceable source clause. Answers without a valid citation must not be shown to the user (fail closed, not open).
- **Streaming behavior:** Chat responses stream token-by-token for perceived responsiveness; citation is attached/verified after the full response completes (verification cannot happen on partial output).
- **Token/cost considerations:** Chunk-level retrieval (not full-document context) is a cost control, not just a quality control. Cache extraction results per document version to avoid redundant LLM calls.
- **Fallback behavior:** If the primary LLM provider is unavailable, the system must fail visibly with a retry option — never silently fall back to a degraded, unlabeled response.

---

## 7. Out of Scope (MVP)

- Multi-jurisdiction support beyond India/US/UK
- Real-time collaborative document review (multiple users, same document)
- Browser extension
- Negotiation counter-clause generation
- OCR for scanned/handwritten documents
- Multi-language explanation output

---

## 8. Success Metrics

- % of Q&A answers with a valid, verified citation (target: 100%)
- Clause extraction accuracy against internal eval set (target: ≥90%)
- Time from upload to first usable summary (target: ≤30s for ≤20 pages)
- % of risk tags accompanied by reasoning (target: 100%)

---

## 9. Glossary

- **Clause-level chunk:** A retrieval unit corresponding to a single structural clause/section, not an arbitrary token window.
- **Grounding verification:** Post-generation check confirming a cited source_span exists in the retrieved source text.
- **Risk tier:** 🔴/🟡/🟢 classification of a clause's deviation from standard/expected terms.
- **Citation-or-refuse:** Prompting strategy requiring the model to cite a source for every claim or explicitly decline to answer.
