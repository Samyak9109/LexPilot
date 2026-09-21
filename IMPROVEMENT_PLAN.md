# LexPilot evaluation-improvement plan

## Baseline

The supplied evaluation reports an overall score of **57/100**:

| Area | Score | Evidence in the repository |
| --- | ---: | --- |
| Code quality | 85 | Clear component/service separation and documented architecture. |
| Security | 85 | JWT auth and document ownership filters exist, but upload and secret handling need hardening. |
| Efficiency | 75 | Async document processing and vector search are present; the pipeline is currently sequential per clause. |
| Testing | 10 | No working test command or automated coverage existed. |
| Accessibility | 0 | Important controls lacked programmatic labels and keyboard semantics. |
| Problem-statement alignment | 50 | Several advertised requirements were partial or missing, including actual DOCX extraction and checklist export. |

## Changes completed in this pass

- Added a working Node test command and four regression tests for document-upload validation.
- Added shared upload validation: empty files, oversized uploads, and MIME/extension mismatches now receive explicit errors.
- Removed rejected and forwarded temporary upload files after use.
- Implemented DOCX text extraction in FastAPI using the standard DOCX XML format, and returns explicit errors for corrupt or image-only files.
- Improved accessibility with labelled authentication controls, keyboard-operable upload and clause controls, labelled comparison and chat controls, and accessible notification roles.
- Made Q&A citations link to their source clauses and made lawyer checklists downloadable as Markdown.
- Removed unverified security/compliance marketing claims from the UI.

## Next priorities

### 1. Raise testing from 10 to a release gate

1. Add FastAPI unit tests for DOCX/PDF parsing, segmentation, grounding verification, checklist citation filtering, and refusal behavior.
2. Refactor Express startup into an exportable `app` module, then add API tests for authentication, ownership isolation, upload cleanup, question proxying, and comparison refusal.
3. Add React Testing Library tests for upload errors, status polling, citation links, checklist download, and keyboard interaction.
4. Add Playwright smoke tests for the primary journeys: upload, view analysis, grounded Q&A, comparison, and checklist export.
5. Add CI that runs tests, frontend build/lint, Python lint/type checks, dependency audit, and a secret scan on every pull request.

**Exit criteria:** every PR runs reliably; user-A/user-B isolation is tested; the AI pipeline has an eval fixture set and coverage reporting.

### 2. Complete the PRD’s legal-safety requirements

1. Preserve real source spans during parsing; the current graph still assigns each extracted clause a placeholder `(0, len(segment))` span.
2. Treat every Q&A answer without a verified source quote and valid clause ID as a refusal. Validate that cited IDs came from retrieval, not merely that a quote appears somewhere in context.
3. Record retrieval scores and surface an explicit low-confidence state rather than assigning `1.0` confidence to every extracted clause.
4. Add the visible “not legal advice” boundary to upload, analysis, Q&A, and export views.
5. Add a labelled evaluation set (10–15 documents) covering the required clause taxonomy, empty/scanned documents, out-of-document questions, and comparison mismatches.

**Exit criteria:** zero uncited displayed answers in the eval set; every risk tag has a reason and jurisdiction assumption; claims can be traced to exact source text.

### 3. Harden the security boundary

1. Remove development fallback secrets and fail startup outside local development when `JWT_SECRET` or `INTERNAL_SECRET` are absent or weak.
2. Add Multer upload limits and server-side content signature checks; never rely on a client-provided MIME type alone.
3. Validate username/password shape, rate-limit login and upload endpoints, and configure CORS with the deployed frontend origin instead of allowing every origin.
4. Ensure FastAPI is private at the deployment layer and rotate the internal shared secret through environment-managed configuration.
5. Add dependency scanning and security headers (for example Helmet) after confirming the deployment topology.

**Exit criteria:** automated abuse/ownership tests pass and production cannot start with sample secrets or permissive CORS.

### 4. Improve efficiency and reliability

1. Batch or parallelize independent clause LLM operations with bounded concurrency; record per-stage latency and failures.
2. Store processing-stage status (`parsing`, `extracting`, `risk analysis`, `complete`, `partial failure`) so the UI can give useful progress and recovery actions.
3. Replace the unrestricted fallback retrieval with a deterministic, scored fallback and fetch the architecture-specified candidate count before reranking.
4. Persist comparison results and move semantic comparison to FastAPI, matching the documented API boundary.
5. Add safe retry controls for transient LLM/provider failures and avoid exposing internal exception messages to users.

**Exit criteria:** pipeline performance and failure rate are observable; partial results remain usable and retryable.

### 5. Finish accessibility and responsive validation

1. Convert the remaining inline-style layout to responsive CSS and test 320px, 768px, 1024px, and 1440px widths.
2. Run axe-core against each primary route and resolve WCAG 2.1 AA findings, including contrast and focus-visible states.
3. Add semantic landmark regions, visible focus styles, screen-reader status text for processing, and a mobile navigation treatment.
4. Test all user journeys with keyboard-only interaction.

**Exit criteria:** no critical axe findings and all critical journeys work without a mouse.

## Recommended delivery order

1. Land the completed ingestion/accessibility slice and its tests.
2. Add security configuration and ownership API tests.
3. Build the FastAPI eval harness and grounding/source-span fixes.
4. Deliver semantic comparison, robust processing states, and end-to-end tests.
5. Add CI and use its results as the project’s ongoing scorecard.
