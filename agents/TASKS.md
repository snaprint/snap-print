# Tasks

Problem details for each ID are in `BACKEND_CONTEXT.md` (B-x) and `FRONTEND_CONTEXT.md` (F-x).
**Status values:** `todo` · `in progress` · `blocked` (say on what) · `on preview` (pushed to dev, awaiting owner check) · `done` (owner verified / on main).
Update the row when status changes. New tasks: add a row with the next free ID in your own section.

---

## Owner actions (only the human can do these)

| ID | Action | Needed by | Status |
|---|---|---|---|
| O-1 | Confirm order emails work: one test payment, check buyer + seller inbox | B-4 | todo |
| O-2 | Confirm Cloudflare Pages builds `dev` and note the preview URL here (expected `https://dev.snap-print.pages.dev`) | everything | todo |
| O-3 | Check Preview env vars in Cloudflare (CSV URLs, Razorpay **test** keys, Resend, `RAZORPAY_WEBHOOK_SECRET`, `SELLER_ACCOUNTS`, Firebase `VITE_*`) | testing on preview | todo |
| O-4 | Bind a KV namespace as `ORDERS_KV` (Production + Preview) | B-5 | todo |
| O-5 | Create Cloudflare Turnstile site (hostnames `snaprint.in`, `www.snaprint.in`, `dev.snap-print.pages.dev`). Add `VITE_TURNSTILE_SITE_KEY` now; add `TURNSTILE_SECRET_KEY` **only after F-20 (widget) is live** in that environment, or the quote/cancel forms will return 403 | B-6 / F-20 | todo |
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
| 1 | B-4 | Verify order emails (O-1); webhook reads buyer/items from the Razorpay **order**, payment notes as fallback | O-1 (verification only) | todo |
| 2 | B-1 | Normalise shipping method once, use everywhere | — | todo |
| 3 | B-2 | Reject non-integer / <1 / >100 quantities (400); merge duplicate ids before stock check; contract + FE message (F-6) | — | todo |
| 4 | B-3 | Every Razorpay notes value ≤256 chars; never truncate JSON | — | todo |
| 5 | B-10 | Price > 0, case-insensitive categories, one blank-stock rule; `shared/` purchasability rule; FE message (F-7) | — | todo |
| 6 | B-9 | Return an error when the **seller** email fails (quote, cancel-order) | — | todo |
| 7 | B-5 | Mark payment processed only after emails succeed; works with `ORDERS_KV`, degrades safely without | O-4 to be fully effective | todo |
| 8 | B-6 | Turnstile check in quote + cancel-order, active only when `TURNSTILE_SECRET_KEY` is set | O-5 to switch on | todo |
| 8 | B-7 | `SELLER_TOKEN_SECRET` (optional), hashed passwords (plaintext still works), no username logs | O-7 to switch on | todo |
| 9 | B-11 | Sitemap: add faq/contact | — | todo |
| 9 | B-12 | De-duplicate helpers into one shared module | — | todo |
| 9 | B-13 | Minor items (escaping, `SELLER_EMAIL` default, tracking-link scheme) | delivery copy: owner decision (F-11) | todo |
| 10 | B-8 | Quote upload memory: owner chooses between options | owner decision | todo |
| — | B-15 | `shared/` module for FE + BE (CSV, bulk pricing, `isPurchasable`) | done as part of B-10/B-12 | todo |
| — | B-19 | `npm run dev:full` fails (compat date newer than local workerd); fix the script (package.json) | owner OK to edit package.json | todo |

**Later (not this phase)**

| ID | Task | Depends on | Status |
|---|---|---|---|
| B-14 | New `POST /api/track-order` | — | todo |
| B-16 | Webhook writes the order to Firestore (server-authored record) | O-6 | todo |
| B-17 | Commit `firestore.rules` (orders read-only for clients) | B-16 | todo |
| B-18 | Restyle all email templates to the new design | R-2 | todo |

---

## Frontend (FE)

**Redesign track**

| ID | Task | Depends on | Status |
|---|---|---|---|
| R-1 | Propose design direction to owner (palette, type, layout, key mockups) | — | todo |
| R-2 | Publish `agents/DESIGN_TOKENS.md` (colours, fonts, logo URL, button style) for BE emails | O-9 | todo |
| R-3 | De-duplicate navbar/footer (single source, e.g. Vite HTML partials or JS-injected) | O-9 | todo |
| R-4 | Rebuild design system (`index.css` tokens, components) | O-9 | todo |
| R-5 | Redesign pages: home/catalog → product → cart → checkout → account → remaining pages | R-4 | todo |

**Fixes** (fold into the redesign where natural, but each must be done)

| ID | Task | Depends on | Status |
|---|---|---|---|
| F-2 | Remove "dev mode" fake success in checkout + quote | — | todo |
| F-5 | Track-order mobile menu double toggle | — | todo |
| F-3 | Await post-payment writes; later remove the client order write | B-16 for removal | todo |
| F-4 | Firestore helpers must surface errors | — | todo |
| F-1 | Track order + account statuses via `/api/track-order`; remove `VITE_ORDER_TRACKING_CSV_URL` | B-14 | todo |
| F-6 | Quantity caps in UI | B-2 | todo |
| F-7 | Use shared `isPurchasable` everywhere | B-15 | todo |
| F-8 | Cart refreshes price/name/image; flags inactive items | — | todo |
| F-9 | Render shipping options from the sheet | — | todo |
| F-10 | Fix PIN → state auto-fill | — | todo |
| F-11 | Single delivery-time copy | owner decision | todo |
| F-12 | Escape all interpolated HTML (shared `escapeHtml`) | — | todo |
| F-13 | Shuffle catalog once per load | — | todo |
| F-14 | Favicon, footer, nav, robots.txt consistency | R-3 | todo |
| F-15 | Use shared product cache; reduce CSV fetches | — | todo |
| F-16 | Remove dead / duplicated code | — | todo |
| F-17 | Move raw images out of `public/` | — | todo |
| F-18 | Seller dashboard: check token expiry client-side | — | todo |
| F-19 | Repo hygiene (`.gitignore`, `.env.example`) | — | todo |
| F-20 | Turnstile widget on quote + cancel forms | B-6, O-5 | todo |
