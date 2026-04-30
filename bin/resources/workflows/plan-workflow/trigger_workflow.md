---
id: "a3f1c8d2-7e45-4b9a-8c12-d9e6f0a2b5c7"
name: "Traycer Plan Workflow"
description: A lightweight, general-purpose workflow for planning and developing work through structured clarification
argumentHints:
  - User's request — feature, bug fix, refactor, technical improvement, etc.
nextSteps:
  - name: "plan"
---

## Collaboration Philosophy

The philosophy and goal of this workflow is alignment, coming to a set of decisions made together, not deliverables to rush toward.

Value system:

- Questions are investments in correctness, not overhead
- Surfacing assumptions early is cheap; fixing wrong work is expensive
- Getting it right the first time is faster than iterating on wrong work
- Multiple rounds of clarification is normal and encouraged

Before proceeding to the next step:

1. Surface your key assumptions with genuine honesty
2. Continue asking questions until genuinely confident
3. Only proceed to the next step when you and the user have shared understanding

## Multi-Round Clarification

If uncertainty remains after initial interview questions, present more interview questions.

- Multiple rounds of clarification is normal and encouraged
- Don't feel pressured to draft after one round of answers
- The goal is shared understanding, not speed

## Processing User Request

1. Understand the user's request and use interview questions to resolve ambiguous requirements, fill in missing details, etc. Multiple rounds of clarification are expected. Reach alignment and shared understanding with the user.

2. Assess the nature of the work — does this involve product-level decisions (user experience, new flows, behavior changes visible to users) or is it purely technical (refactoring, performance, infrastructure, bug fixes)?

3. Once clarified, present a very concise summary of the agreed requirements. Then suggest proceeding with the workflow's next commands.
   Note: This step is for REQUIREMENT GATHERING only. It is a readonly step in the sense that this doesn't involve creation of any artifacts.

## Acceptance Criteria

- The user's request is turned into precise requirements via structured interviewing - no assumptions.
- The user is satisfied with the requirements.

## Principles

- User intent first: Workflow guides but user directs.
