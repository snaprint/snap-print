# Snap Print — Agent Rules

Two AI agents work on this repo, usually **one at a time**:

- **BACKEND (BE):** server code, payments, email.
- **FRONTEND (FE):** the website redesign and all client-side fixes.

Your role is stated in your first message. If it isn't, ask the owner before doing anything.
The owner (a human) verifies every change on the preview site before it goes live.

## 1. Start of every session — read these, in order

1. `agents/WORKLOG.md`: the last 3–5 entries. What changed since you last worked?
2. `agents/MESSAGES.md`: open messages addressed to you. Answer or act on them.
3. `agents/TASKS.md`: pick your next unblocked task.
4. Your context file: `BACKEND_CONTEXT.md` or `FRONTEND_CONTEXT.md`. Read the other one's "Known problems" section too.
5. `agents/API_CONTRACT.md`: before touching anything under `/api`.

Then set the **Active agent** line at the top of `agents/WORKLOG.md` to your role. If it already names the other agent, stop and ask the owner; the other agent may still be working.

## 2. Ownership — only edit what you own

| Path | Owner | The other agent… |
|---|---|---|
| `functions/`, `shared/`, email HTML templates | BE | reads only; asks via `MESSAGES.md` |
| `src/`, `public/`, `vite.config.js` | FE | reads only; asks via `MESSAGES.md` |
| `agents/API_CONTRACT.md` | BE writes the spec | FE writes only in its "Requests" section |
| `BACKEND_CONTEXT.md` / `FRONTEND_CONTEXT.md` | BE / FE respectively | reads only |
| `agents/TASKS.md`, `WORKLOG.md`, `MESSAGES.md` | both | follow the formats in each file |
| `package.json`, `.env.example`, `.gitignore`, `CLAUDE.md` | both | only with a WORKLOG note saying what changed |

`shared/` holds logic both sides must agree on (bulk pricing, purchasability rules). FE imports it from `src/js/`; FE must not edit it.

## 3. Contract-first for anything crossing the boundary

- BE adds or changes an endpoint in `API_CONTRACT.md` **before** implementing it, with status `planned`.
- FE may build against a `planned` endpoint with mocked responses, but must not ship UI that depends on it until the status is `live on preview`.
- A breaking change to a `live` endpoint requires a message to FE and a note in the contract's changelog.

## 4. Git & publishing

- **Branches:** `dev` = preview, `main` = production (snaprint.in). Cloudflare Pages builds both automatically on push.
- Work **only on `dev`**:
  ```bash
  git checkout dev && git pull --ff-only origin dev
  ```
- Commit small, focused changes. Prefix the message with `[BE]` or `[FE]` and include the task ID, e.g. `[BE] B-1: normalise shipping method`.
- Before every push: `npm run build` must succeed. For BE changes, also smoke-test with `npm run dev:full` when it's practical.
- **Publish to preview:** `git push origin dev`. This is pre-approved by the owner; do it at the end of each completed task.
- **Never push, merge or force-push to `main`.** Promotion to production happens only when the owner explicitly says so in the current session (e.g. "promote to main"). Then:
  ```bash
  git checkout main && git pull --ff-only origin main && git merge --ff-only dev && npm run build && git push origin main && git checkout dev
  ```
- Never force-push `dev` either, and never rewrite pushed history.
- **Redesign exception (owner, 2026-11-17):** FE does the redesign (R-2…R-6) on the `redesign` branch (preview `https://redesign.snap-print.pages.dev`) and may push it freely. Merge `dev` into `redesign` regularly (`git merge dev`, never rebase). `redesign` is merged into `dev` only after the owner signs off the whole redesign.
- Never commit secrets (`.env`, `.dev.vars`, keys). Server env vars are set by the owner in the Cloudflare dashboard. If you need one, add it to `agents/TASKS.md` → "Owner actions".

### Preview caveats

The preview deployment uses Cloudflare's **Preview** environment variables, which may differ from Production. It shares the same Firebase project, Google Sheets and Resend account, so emails sent from preview are real emails. The Razorpay webhook points at production, so payments made on preview won't trigger confirmation emails unless the owner configures a test-mode webhook for the preview URL.

## 5. End of every session

1. Commit and push to `dev` (if the build passes).
2. Update `agents/TASKS.md` statuses.
3. Append a `agents/WORKLOG.md` entry, including **"How to verify on preview"**: concrete steps for the owner to check.
4. Write any requests for the other agent in `agents/MESSAGES.md`.
5. Reset the **Active agent** line to `none`. Commit and push these coordination edits too.
6. In your final reply to the owner, summarise what changed, what to check on preview, and anything they must do by hand.

## 6. Ground rules

- Fix problems by their IDs (`B-x`, `F-x`); new problems you find get a new ID in your context file and a row in `TASKS.md`.
- Don't silently change behaviour the other side relies on (prices, quantities, field names, error formats).
- If a task needs an owner decision (design direction, deleting data, changing policies or prices), ask instead of guessing.
- Keep your context file accurate. When you fix or change something, update it in the same commit.
