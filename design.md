# design.md — LexPilot UI/UX Design System & Interaction Guidelines

**Status:** Governs visual and interaction decisions. Must satisfy `PRD.md` user journeys (§3) and functional requirements (§4). Subordinate to `PRD.md` and `architecture.md` in case of conflict.

---

## 1. Design Principles

- **Trust through transparency, not decoration.** Every AI-generated claim visibly pairs with its source. This is the core design principle — no screen should present an AI output without a way to verify it against the original text.
- **Plain language over legal aesthetics.** Do not mimic law-firm visual tropes (serif fonts, gavels, scales of justice). This is a comprehension tool for non-lawyers, not a law-firm brand exercise.
- **Calm, not alarming.** Risk flags inform, they don't panic. Red should mean "look closer," never "danger."
- **Never let the interface imply legal advice.** No button says "Is this safe to sign?" — phrasing throughout stays in "informational" register (implements PRD.md §6 guardrail, NFR-010 spirit).

---

## 2. Visual Design System

**Color — Risk tiers (fixed semantic mapping, do not reuse for other purposes):**
- 🔴 Red (`risk-high`) — unusual/one-sided clause, review closely
- 🟡 Yellow (`risk-medium`) — worth reviewing, non-standard but not necessarily unfair
- 🟢 Green (`risk-low`) — standard boilerplate

**Color — System states:**
- Neutral grays for structure/chrome
- One accent color for primary actions (upload, ask, compare) — kept separate from the risk-tier palette so actions are never confused with risk signaling

**Typography:**
- Sans-serif throughout (readability for non-legal-professional users is the priority over formality)
- Original clause text may use a monospace or distinctly bordered treatment to visually separate "quoted source" from "AI-generated explanation" at a glance — this distinction is load-bearing for trust, not a stylistic flourish

**Confidence/uncertainty treatment:**
- Low-confidence extractions or flagged-as-uncertain content use a visibly muted/dashed treatment (implements architecture.md §6.3) — never presented with the same visual confidence as verified content

---

## 3. Core UI Components

**Document Upload**
- Drag-and-drop + file picker, accepted formats and size limit stated inline (not just on error)
- Immediate inline validation feedback (implements FR-001)

**Document Dashboard**
- Two-pane layout: extracted/explained clauses (left/main), chat panel (right/collapsible on mobile)
- Each clause card: original text (source-styled) + simple explanation + risk tier badge + reasoning, always co-located — never split across separate screens

**Chat Panel**
- Each AI answer renders with a visible, clickable citation chip linking to the exact source clause card (scroll-to or highlight)
- Answers with no valid citation are never rendered as plain confident text (implements FR-005 fail-closed rule) — if the system must show an uncited response, it is visually distinct and labeled as such

**Risk Badge**
- Color + short label + reasoning on hover/tap — never color alone (accessibility, see §5)

**Compare View**
- Split-view or aligned table, one row per clause type, columns per document
- Unmatched/missing clauses explicitly shown as "not present," not left blank
- Low-confidence alignments visually flagged (implements architecture.md §6.3 confidence signaling)

**Checklist/Export**
- Structured list, each item links back to its source clause card
- Explicit "no significant risks flagged" state when applicable (implements FR-009 edge case)

---

## 4. Interaction Patterns (all states per PRD.md §3 journeys)

- **Loading:** Skeleton/progress states per pipeline stage where feasible (e.g., "extracting clauses…" → "assessing risk…"), not a single opaque spinner — reflects the multi-node pipeline (architecture.md §5) and sets accurate wait-time expectations
- **Empty:** Always paired with a clear next action, never a bare blank screen
- **Error:** Specific, actionable messaging tied to the actual failure (validation vs. parsing vs. provider outage) — never a generic "something went wrong"
- **Partial failure:** If one pipeline node fails (architecture.md §8), the UI shows completed sections normally and marks the failed section individually with a retry action — never blocks the whole page
- **Success:** Explicit confirmation state before advancing (e.g., "document ready" before dropping user into dashboard)

---

## 5. Accessibility Guidelines (implements NFR-005)

- WCAG 2.1 AA minimum
- Risk tiers communicated via color + icon + text label — never color alone
- All interactive elements keyboard-navigable; chat input and citation links fully operable without a mouse
- Sufficient contrast ratios for risk-tier colors against background
- Screen-reader labels for citation chips describe the destination ("View source: Termination clause, Section 4")

---

## 6. Responsive Behavior (implements NFR-006)

- Mobile (≥375px): chat panel collapses behind a toggle; clause cards stack single-column; upload remains primary above-the-fold action
- Compare view on mobile: tabbed per-document view instead of side-by-side table (side-by-side is desktop-only layout)

---

## 7. Content & Voice Guidelines

- Plain-English explanations target a general-reader comprehension level, not simplified-to-the-point-of-inaccurate
- Never use imperative advice language ("you should," "do this") — use descriptive framing ("this clause generally means…", "this is worth discussing with a lawyer if…")
- Disclaimer is not confined to a footer — it's reinforced contextually wherever risk/checklist content appears (implements PRD.md §15 product-wide disclaimer requirement)

---

## 8. Screen Inventory (MVP scope, maps to PRD.md §3 journeys)

1. Login/Auth
2. Upload / Empty dashboard
3. Document Dashboard (clauses + chat) — Journey A, B
4. Compare View — Journey C
5. Checklist/Export view — Journey D
6. Document history/list (multi-document management)

Screens beyond this list (e.g., jurisdiction settings, glossary overlay) belong to the full-version feature set per PRD.md §7 and phases.md, not MVP.
