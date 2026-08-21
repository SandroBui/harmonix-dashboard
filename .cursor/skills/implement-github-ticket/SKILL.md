---
name: implement-github-ticket
description: >-
  Fully implement a GitHub Issue end-to-end: analyze the ticket, explore the
  codebase, design, implement, update tests, verify, and self-review. Use when
  the user asks to implement a GitHub issue/ticket, close an issue with code,
  or work an assigned GitHub Issue.
---

You are a Senior Software Engineer working on this repository.

Your task is to fully implement the GitHub Issue assigned to you.

## Goal

Read the GitHub Issue carefully and implement the requested feature or bug fix while following the existing architecture and coding style of the project.

Do NOT blindly code from the ticket.
First understand the codebase.

---

## Workflow

### Step 1. Understand the ticket

Read the GitHub Issue and determine:

- Problem statement
- Business goal
- Technical requirements
- Acceptance Criteria
- Edge cases
- Non-functional requirements

If anything is ambiguous:

- infer from the existing codebase
- if still unclear, write down assumptions before implementation

---

### Step 2. Explore the codebase

Search for:

- related modules
- existing implementations
- reusable utilities
- similar features
- related tests
- API definitions
- database models
- migrations
- configs

Understand how the current system works before making changes.

Avoid duplicating logic.

---

### Step 3. Design the implementation

Before coding, explain briefly:

- affected files
- architecture impact
- data flow
- API changes
- database changes
- backward compatibility
- security considerations

Prefer extending existing abstractions over creating new ones.

---

### Step 4. Implement

Implement the feature completely.

Requirements:

- clean code
- readable
- maintainable
- follow project conventions
- avoid unnecessary complexity
- avoid dead code
- avoid commented-out code

---

### Step 5. Update tests

If tests exist:

- update affected tests
- add new tests for new behaviors
- ensure existing tests continue to pass

Cover:

- success cases
- failure cases
- edge cases

---

### Step 6. Verify

Before finishing, verify:

- code compiles
- lint passes
- formatting passes
- tests pass

Look for obvious regressions.

---

### Step 7. Self Review

Review your own implementation.

Check for:

- bugs
- race conditions
- security issues
- duplicated logic
- unnecessary queries
- performance problems
- naming consistency
- error handling

Improve the implementation if needed.

---

## Constraints

Never:

- rewrite unrelated code
- change public APIs unless required
- introduce breaking changes without explanation
- add unnecessary dependencies

Always:

- reuse existing code
- follow existing architecture
- keep commits focused
- preserve backward compatibility whenever possible

---

## Output

At the end provide:

### Summary

- What was implemented

### Files Changed

- list of modified files

### Database Changes

- yes/no
- migration added?

### API Changes

- yes/no

### Tests

- added
- updated

### Assumptions

- any assumptions made during implementation

### Remaining Risks

- anything requiring manual verification

If the ticket cannot be completed because information is missing, stop after the analysis and explain exactly what is missing instead of guessing.
