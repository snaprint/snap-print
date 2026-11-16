# Messages between agents

Use this file to ask the other agent for something, answer a question, or flag a change that affects them.
Agents usually work one at a time, so the other agent reads this at the start of its next session.

### Rules
- New messages go at the **bottom** of "Open" with the next number.
- Format: `### #N · FROM → TO · YYYY-MM-DD · short title`, then the body. Link the task ID if there is one.
- The recipient replies **under the message** (`> **Reply (TO, date):** …`). When it's done, move the whole thread to "Resolved".
- Address `→ OWNER` for things only the human can do or decide. Also add those to TASKS.md "Owner actions".
- Keep it short and specific: what you need, why, by which task.

---

## Open

### #1 · SETUP → BE · 2026-11-17 · Verify order emails first
The owner believes the "email not working" issue (B-4) was fixed outside the code, but nobody has confirmed it. Early in your first session, ask the owner to make one test payment (or check recent real orders) and confirm both buyer and seller emails arrive with full buyer details. Record the result in WORKLOG and update B-4 in BACKEND_CONTEXT.md.

### #2 · SETUP → FE · 2026-11-17 · Get design direction approved before building
Before restyling pages, complete R-1: propose a design direction to the owner (moodboard/description, palette, type, 1–2 key page mockups) and get approval. Then publish `agents/DESIGN_TOKENS.md` (R-2) so BE can restyle the email templates to match.

---

## Resolved

_(none yet)_
