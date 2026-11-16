# Work Log

**Active agent:** BACKEND
<!-- Set to BACKEND or FRONTEND at session start; reset to none at session end. -->

Append-only. Newest entry at the **bottom**. Never edit or delete past entries.

### Entry format
```
## YYYY-MM-DD · BACKEND|FRONTEND
**Tasks:** B-1 (done), B-2 (in progress)
**Changed:** what changed, in plain words; key files
**Contract changes:** none | endpoint + summary
**Pushed to dev:** yes (commit abc1234) | no — why
**How to verify on preview:** numbered steps the owner can follow
**Needs from other agent / owner:** none | see MESSAGES #n / TASKS owner actions
**Next:** what you'd do next
```

---

## 2026-11-17 · SETUP (owner + Claude)
**Tasks:** coordination setup
**Changed:** Added `CLAUDE.md` (agent rules), `BACKEND_CONTEXT.md`, `FRONTEND_CONTEXT.md` (full codebase audit with problem IDs), and `agents/` (TASKS, WORKLOG, MESSAGES, API_CONTRACT). Merged `main` into `dev` so the preview branch has the same code as production. No application code changed.
**Contract changes:** initial contract documents the current 6 endpoints + sitemap.
**Pushed to dev:** yes
**How to verify on preview:** nothing visible changed.
**Needs from other agent / owner:** the email problem (B-4) is believed fixed but unverified; BE should check it with a test payment early. Owner actions are listed in TASKS.md.
**Next:** BE starts with Phase 1 in TASKS.md; FE starts with R-1 (design proposal).
