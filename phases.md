# phases.md — LexPilot Development Roadmap, Phases, Milestones & Acceptance Criteria

**Status:** Governs sequencing and "when is this done" decisions. Subordinate to `PRD.md`, `architecture.md`, and `design.md` — if a phase's scope conflicts with those documents, they win; update this file to match, not the other way around.

---

## Phase 0 — Project Setup

**Scope:**
- Repo structure: separate `frontend/`, `backend-express/`, `backend-fastapi/`
- MongoDB Atlas cluster provisioned, vector search index created (architecture.md §3)
- Env/secrets scaffolding per environment (architecture.md §12)
- Internal service-auth secret configured between Express and FastAPI (architecture.md §4)

**Milestone:** Empty end-to-end request round-trip works — frontend → Express → FastAPI → Mongo → back, with no real AI logic yet.

**Acceptance criteria:**
- [ ] A test document upload creates a `documents` record with `status: pending`
- [ ] Express successfully calls FastAPI `/internal/process` with the shared secret and receives a stub response
- [ ] No AI/LLM calls exist yet in this phase — pure plumbing

---

## Phase 1 — Core Pipeline (MVP foundation)

**Implements:** FR-001, FR-002, FR-003, FR-006, NFR-001, NFR-009

**Scope:**
- Document upload + validation (FR-001)
- Parsing (PyMuPDF/pdfplumber) + structure-aware chunking (architecture.md ED-003)
- `extract_entities` + `classify_clauses` LangGraph nodes (architecture.md §5), schema-bound output
- `generate_explanations` node, run as a separate pass (architecture.md ED-004)
- Auth + document ownership scoping (FR-006)
- Basic dashboard UI: upload, clause cards with original + simple explanation (design.md §3)

**Explicitly out of this phase:** risk scoring, Q&A, comparison, jurisdiction context, checklist export.

**Milestone:** A user can upload a document and see plain-English explanations of its key clauses.

**Acceptance criteria:**
- [ ] Clause extraction covers the MVP taxonomy (PRD.md §4.a) — 7 clause types
- [ ] Every extracted clause carries a `source_span` (architecture.md §5 node contract)
- [ ] Extraction accuracy verified against the labeled eval set — ≥90% (PRD.md §8, architecture.md §11)
- [ ] Single-document processing completes in ≤30s for ≤20 pages (NFR-001)
- [ ] User A cannot access user B's document (FR-006 acceptance test passes)
- [ ] Every pipeline run is logged with node-level output for debugging (NFR-009)

---

## Phase 2 — Differentiators (Risk + Grounded Q&A)

**Implements:** FR-004, FR-005, architecture.md §6 (full hallucination mitigation stack)

**Scope:**
- `risk_score` LangGraph node — risk tier + reasoning per clause
- Chat panel + RAG retrieval pipeline (structure-aware retrieval, re-ranking — architecture.md §6.1)
- Citation-or-refuse prompting (architecture.md §6.2)
- Post-hoc grounding verification — mandatory before this phase is considered complete (architecture.md §6.3)
- Risk badge UI + citation chip UI (design.md §3)

**Milestone:** A user can see risk flags with reasoning and ask grounded questions with visible citations.

**Acceptance criteria:**
- [ ] 100% of risk tags include a reasoning string (FR-004 acceptance criteria)
- [ ] 100% of displayed Q&A answers have a passed grounding check; failed-grounding answers are never shown unlabeled (architecture.md §6.3 — this is a hard gate, not a target)
- [ ] Out-of-document questions are refused, not extrapolated — verified against eval set (FR-005)
- [ ] Low-confidence extractions/answers are visually distinguished per design.md §2

**This phase cannot be marked complete without the grounding-verification gate passing on the eval set — do not proceed to Phase 3 with this unresolved.**

---

## Phase 3 — Polish (Compare + Actionable Output)

**Implements:** FR-007, FR-009, design.md §3 (Compare View, Checklist)

**Scope:**
- Semantic clause alignment for document comparison (FR-007)
- Compare view UI, including "cannot meaningfully compare" failure path
- Checklist/questions-for-lawyer generation and export (FR-009)
- Mobile responsive pass across all MVP screens (NFR-006, design.md §6)
- Accessibility pass (NFR-005, design.md §5)

**Milestone:** A user can compare two documents and export an actionable checklist.

**Acceptance criteria:**
- [ ] Comparison table only shows clause types actually present in at least one document — no fabricated rows (FR-007)
- [ ] Structurally dissimilar document pairs are explicitly refused rather than force-compared
- [ ] Every checklist item links to a source clause (FR-009)
- [ ] Empty-risk documents produce an explicit "no significant risks flagged" checklist, not an empty export
- [ ] WCAG 2.1 AA pass on all MVP screens

---

## Phase 4 — Full Version Features (post-MVP roadmap)

**Implements:** FR-008 (jurisdiction), PRD.md §7 roadmap items

**Scope (in priority order per prior product discussion):**
1. Jurisdiction selector + jurisdiction-aware risk reasoning (FR-008)
2. Key-date tracking/reminders
3. Glossary-on-hover for legal terms
4. Standard-clause benchmarking ("most NDAs cap this at 2 years; yours says 5")
5. Redline/version-compare for same-document drafts
6. Multi-language plain-English output
7. Cognee-backed document memory/history
8. (Stretch) Browser extension, negotiation counter-clause suggestions, shareable read-only summary links

**Acceptance criteria (per item, apply generally):**
- [ ] Each new feature ships with its own FR-ID added to PRD.md before implementation begins — do not build undocumented scope
- [ ] Each feature that touches the AI pipeline re-runs the eval set before merge (architecture.md §11)

---

## Cross-Phase Rules for Implementing Agents

- Do not begin Phase N+1 work if Phase N's acceptance criteria are unchecked, unless explicitly instructed to work out of order.
- Any new feature not already listed in `PRD.md` §4/§7 requires a PRD update (new FR-ID) before implementation — do not silently expand scope.
- Any change to chunking strategy, prompt structure, or pipeline node responsibilities requires updating `architecture.md` (§5, §6, or the decisions log §9) in the same change — architecture decisions and code must not drift apart.
- If a requirement in this file conflicts with `PRD.md` or `architecture.md`, treat those as correct and update this file.
