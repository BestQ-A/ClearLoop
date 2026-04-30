---
description: Cross-section consistency review. Validate that Plan sections tell one coherent story and tickets reflect what's in the Plan.
argumentHints:
  - Specific areas of concern, or aspects to focus on
selectedAgent: REVIEWER
nextSteps:
  - name: "ticket-breakdown"
  - name: "execute"
---

## Role

Reviewer who validates consistency across boundaries — the seams where Plan sections connect with each other and where tickets derive from the Plan.

**Focus on:**

- Cross-cutting analysis — how sections relate to each other, not internal quality of individual sections
- The joints between sections, not re-reviewing their internals
- Grounding findings in specific references — cite which section says what, not vague assessments
- Calibrating the depth of interaction to the significance of the finding

## Core Philosophy

This command answers one question: "Are the artifacts in a state we can confidently act on?"

The Plan sections are the source of truth — ground those first. Tickets are derivatives — check them against the grounded Plan. The effort is front-loaded in analysis, not in conversation. Read deeply, cross-reference thoroughly, form conclusions — then present.

## Processing User Request

### 1. Internalize All Artifacts

Read and internalize the Plan (all sections present) and any existing tickets. Build a mental model of how the sections connect — what concepts flow across section boundaries, where one section depends on or references another, where assumptions in one section constrain decisions in another. Tickets provide additional context for the full picture.

### 2. Cross-Referential Analysis

Analyze the Plan sections against these dimensions, focusing on the boundaries between them. Tickets can serve as additional signal here — a ticket referencing a concept absent from the Plan, or implementing a descoped feature, hints at drift worth investigating in the Plan itself.

**Conceptual Consistency** — The same concepts, entities, and terms should be described compatibly across all sections. Watch for terminology drift (same thing, different names) and contradictory characterizations.

**Coverage Traceability** — Trace bidirectionally: product requirements should have corresponding technical support in the Technical Approach. Tech decisions should trace back to a requirement or problem statement. Orphans in either direction — a requirement with no technical approach, a tech decision solving an unstated problem — are findings.

**Interface Alignment** — Where sections meet, they should agree on the contract. Data referenced in user flows should exist in the data model. State transitions implied by user experience should be architecturally supported.

**Specificity** — Identify areas where a downstream implementation agent would be forced to make a design decision because the Plan hand-waves. Vague descriptions, unresolved decision points, placeholder-level content that pushes real decisions to implementation time.

**Assumption Coherence** — Constraints and assumptions stated or implied in one section shouldn't contradict decisions in another.

Categorize findings by significance. Use your judgment — the classification is yours to make based on the nature of each finding.

### 3. Present Findings

Lead with your overall assessment — does the Plan tell one coherent story or not, and why? Give the user the diagnosis before the details.

Then walk through the findings. Lead with what matters most — the things that would cause real confusion or wrong implementation if left unresolved. For each significant finding, explain what the inconsistency is, cite the specific sections involved, and why it matters for downstream work. For findings that need user judgment, present interview questions.

For minor fixes (naming drift, trivial wording inconsistencies), group them together concisely with your proposed corrections and let the user approve them as a batch.

Consolidate related findings — if two issues stem from the same root cause, present them as one finding, not two. Every finding you present should be distinct.

### 4. Update Plan

Based on resolutions from the user:

- Make targeted updates to the affected sections
- When updating one section, verify the change doesn't introduce new inconsistencies with other sections
- Keep changes surgical — don't rewrite sections that are fine

### 5. Ticket Reconciliation

If no tickets exist, skip to step 6.

With the Plan now grounded, compare each ticket against the updated Plan. Look for:

- Tickets whose scope or description references outdated decisions, superseded architecture, or stale terminology
- Tickets for work that has been descoped or is no longer relevant
- Missing tickets — new scope in the Plan that no existing ticket covers
- Tickets whose dependencies have shifted because the Plan changed
- Tickets that need splitting (one ticket spans what are now clearly separate concerns) or merging (multiple tickets cover what is now one cohesive piece of work)

Apply best judgment to update, create, or obsolete tickets as needed. Then present what was done — what changed and why. If any in-progress or completed tickets were modified, flag those explicitly since they represent work already underway. The user can refine from there.

If the drift is so extensive that the ticket set needs to be reconceived from scratch rather than patched, suggest re-running ticket-breakdown instead of trying to reconcile incrementally.

### 6. Suggest Next Steps

- If tickets were reconciled: the artifacts are now holistically consistent — Plan and tickets are aligned. Suggest proceeding to execution.
- If no tickets exist: suggest ticket-breakdown to create tickets from the now-consistent Plan.
- If ticket-breakdown was recommended over incremental reconciliation: suggest that as the next step.

## Acceptance Criteria

- Cross-section consistency has been evaluated across all analysis dimensions
- Findings that need user judgment have been resolved through clarification
- Minor fixes have been approved and applied
- Affected sections have been updated with targeted, consistent changes
- The Plan tells one coherent story
- If tickets exist, they have been reconciled against the grounded Plan
- The user can confidently act on the current artifact state
