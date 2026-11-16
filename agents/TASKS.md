# Tasks

Problem details for each ID are in `BACKEND_CONTEXT.md` (B-x) and `FRONTEND_CONTEXT.md` (F-x).
**Status values:** `todo` · `in progress` · `blocked` (say on what) · `on preview` (pushed to dev, awaiting owner check) · `done` (owner verified / on main).
Update the row when status changes. New tasks: add a row with the next free ID in your own section.

---

## Owner actions (only the human can do these)

| ID | Action | Needed by | Status |
|---|---|---|---|
| O-1 | Confirm order emails work: one test payment, check buyer + seller inbox | B-4 | done (preview, 2026-11-17) |
| O-2 | Confirm Cloudflare Pages builds `dev` and note the preview URL here (expected `https://dev.snap-print.pages.dev`) | everything | todo |
| O-3 | Check Preview env vars in Cloudflare (CSV URLs, Razorpay **test** keys, Resend, `RAZORPAY_WEBHOOK_SECRET`, `SELLER_ACCOUNTS`, Firebase `VITE_*`) | testing on preview | todo |
| O-4 | Bind a KV namespace as `ORDERS_KV` (Production + Preview) | B-5 | todo |
| O-5 | Create Cloudflare Turnstile site (hostnames `snaprint.in`, `www.snaprint.in`, `dev.snap-print.pages.dev`). Add `VITE_TURNSTILE_SITE_KEY` now; add `TURNSTILE_SECRET_KEY` **only after F-20 (widget) is live** in that environment, or the quote/cancel forms will return 403 | B-6 / F-20 | todo |
| O-12 | Razorpay **Test mode** → Webhooks: add `https://dev.snap-print.pages.dev/api/webhook`, event `payment.captured`, secret = Preview `RAZORPAY_WEBHOOK_SECRET`; so test payments on preview send emails | verifying B-3/B-4/B-5 | done |
| O-13 | Decide delivery-time wording (MESSAGES #8) and quote upload option A/B (MESSAGES #9) | B-13, B-8 | done (A; policy wording) |
| O-14 | Allow BE to edit `package.json` to fix `npm run dev:full` (B-19), or fix it yourself (add `--compatibility-date 2026-08-01`) | B-19 | done (approved) |
| O-11 | Add a WAF rate-limiting rule for `POST /api/quote`, `/api/cancel-order`, `/api/seller-login` (exact settings in `BACKEND_CONTEXT.md` → B-6) | B-6 / B-7 | todo |
| O-6 | Create Firebase service account; add `FIREBASE_SERVICE_ACCOUNT_JSON` to Pages env | B-16 | todo |
| O-7 | Add `SELLER_TOKEN_SECRET` (random 32+ chars) to Production + Preview; replace plaintext passwords in `SELLER_ACCOUNTS` with `passwordHash` values (command in `BACKEND_CONTEXT.md` → B-7) | B-7 | todo |
| O-8 | After B-14 + F-1 are live: **unpublish** the order-tracking sheet from "Publish to web" and give BE a private access method | F-1 | todo |
| O-9 | Approve design direction (R-1) | R-2+ | todo |
| O-10 | Deploy Firestore rules from `firestore.rules` once BE commits it | B-17 | todo |

---

## Backend (BE)

**Current phase: fix existing problems B-1…B-13, in this order** (owner instruction, 2026-11-17).
No new features this phase: B-14, B-16, B-17, B-18 wait. A shared module is created only where a fix needs it (B-10, B-12); that covers the core of B-15.

| # | ID | Task | Depends on | Status |
|---|---|---|---|---|
| 1 | B-4 | Verify order emails (O-1); webhook reads buyer/items from the Razorpay **order**, payment notes as fallback | O-1 (verification only) | on preview (emails verified on preview) |
| 2 | B-1 | Normalise shipping method once, use everywhere | — | on preview |
| 3 | B-2 | Reject non-integer / <1 / >100 quantities (400); merge duplicate ids before stock check; contract + FE message (F-6) | — | on preview |
| 4 | B-3 | Every Razorpay notes value ≤256 chars; never truncate JSON | — | on preview |
| 5 | B-10 | Price > 0, case-insensitive categories, one blank-stock rule; `shared/` purchasability rule; FE message (F-7) | — | on preview |
| 6 | B-9 | Return an error when the **seller** email fails (quote, cancel-order) | — | on preview |
| 7 | B-5 | Mark payment processed only after emails succeed; works with `ORDERS_KV`, degrades safely without | O-4 to be fully effective | on preview (full effect needs O-4) |
| 8 | B-6 | Turnstile check in quote + cancel-order, active only when `TURNSTILE_SECRET_KEY` is set | O-5 to switch on | on preview (off until O-5) |
| 8 | B-7 | `SELLER_TOKEN_SECRET` (optional), hashed passwords (plaintext still works), no username logs | O-7 to switch on | on preview (switch on via O-7) |
| 9 | B-11 | Sitemap: add faq/contact | — | on preview |
| 9 | B-12 | De-duplicate helpers into one shared module | — | on preview |
| 9 | B-13 | Minor items (escaping, `SELLER_EMAIL` default, tracking-link scheme) | delivery copy: owner decision (F-11) | on preview |
| 10 | B-8 | Quote upload memory: owner chooses between options | owner decision | on preview |
| — | B-15 | `shared/` module for FE + BE (CSV, bulk pricing, `isPurchasable`) | done as part of B-10/B-12 | on preview (core in shared/products.js) |
| — | B-19 | `npm run dev:full` fails (compat date newer than local workerd); fix the script (package.json) | owner OK to edit package.json | on preview |

**Later (not this phase)**

| ID | Task | Depends on | Status |
|---|---|---|---|
| B-14 | New `POST /api/track-order` | — | todo |
| B-16 | Webhook writes the order to Firestore (server-authored record) | O-6 | todo |
| B-17 | Commit `firestore.rules` (orders read-only for clients) | B-16 | todo |
| B-18 | Restyle all email templates to the new design | R-2 | todo |

---

## Frontend (FE)

**Current session order (owner instruction, 2026-11-17):** Part 1 = fixes that don't depend on the redesign, in the order below (one commit each). Part 2 = R-1 proposal, then **stop** for owner approval (O-9). R-2…R-5 wait for O-9.
Skipped this session: F-1 (needs B-14, still `planned`), F-3 second half (needs B-16), F-14 (do with R-3).

**Fixes**

| # | ID | Task | Depends on | Status |
|---|---|---|---|---|
| 1 | F-2 | Remove "dev mode" fake success in checkout + quote; non-2xx shows server `message`, keeps input (MESSAGES #6) | — | on preview |
| 2 | F-5 | Track-order mobile menu double toggle | — | on preview |
| 3 | F-4 | Firestore helpers must surface errors | — | on preview |
| 4 | F-3a | Await post-payment writes; store the charged (bulk) price | — | on preview |
| 5 | F-7 + F-6 | Use `shared/products.js` everywhere; quantity caps (MESSAGES #3, #5) | B-2, B-10 | todo |
| 6 | (#4) | Checkout `maxlength`s; show server 400 message (MESSAGES #4) | B-3 | todo |
| 7 | (#10) | Quote upload limit 25 → 10 MB (MESSAGES #10) | B-8 | todo |
| 8 | F-11 | Single delivery-time copy (MESSAGES #11) | owner decision (done) | todo |
| 9 | F-12 | Escape all interpolated HTML (shared `escapeHtml`) | — | todo |
| 10 | F-8 | Cart refreshes price/name/image; flags unavailable items | — | todo |
| 10 | F-13 | Shuffle catalog once per load | — | todo |
| 10 | F-15 | Use shared product cache; reduce CSV fetches | — | todo |
| 10 | F-10 | Fix PIN → state auto-fill | — | todo |
| 10 | F-9 | Render shipping options from the sheet | — | todo |
| 10 | F-18 | Seller dashboard: check token expiry client-side | — | todo |
| 11 | F-16 | Remove dead / duplicated code | — | todo |
| 11 | F-17 | Move raw images out of `public/` | — | todo |
| 11 | F-19 | Repo hygiene (`.gitignore`, `.env.example`) | — | todo |
| 12 | F-20 | Turnstile widget on quote + cancel forms (only when `VITE_TURNSTILE_SITE_KEY` is set) | B-6, O-5 | todo |
| — | F-21 | Local builds ignored `.env` (Vite `envDir`); found 2026-11-17 | — | on preview |
| — | F-3b | Remove the client order write | B-16 | blocked (B-16) |
| — | F-1 | Track order + account statuses via `/api/track-order`; remove `VITE_ORDER_TRACKING_CSV_URL` | B-14 | blocked (B-14 planned) |
| — | F-14 | Favicon, footer, nav, robots.txt consistency | R-3 | todo (with R-3) |

**Redesign track**

| ID | Task | Depends on | Status |
|---|---|---|---|
| R-1 | Propose design direction to owner (palette, type, layout, key mockups in `agents/design/`) | Part 1 | todo |
| R-2 | Publish `agents/DESIGN_TOKENS.md` (colours, fonts, logo URL, button style) for BE emails | O-9 | todo |
| R-3 | De-duplicate navbar/footer (single source, e.g. Vite HTML partials or JS-injected) | O-9 | todo |
| R-4 | Rebuild design system (`index.css` tokens, components) | O-9 | todo |
| R-5 | Redesign pages: home/catalog → product → cart → checkout → account → remaining pages | R-4 | todo |
