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
| O-5 | Create Cloudflare Turnstile site; add `TURNSTILE_SITE_KEY` / `VITE_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` | B-6 / F-20 | todo |
| O-6 | Create Firebase service account; add `FIREBASE_SERVICE_ACCOUNT_JSON` to Pages env | B-16 | todo |
| O-7 | Add a separate `SELLER_TOKEN_SECRET` env var | B-7 | todo |
| O-8 | After B-14 + F-1 are live: **unpublish** the order-tracking sheet from "Publish to web" and give BE a private access method | F-1 | todo |
| O-9 | Approve design direction (R-1) | R-2+ | todo |
| O-10 | Deploy Firestore rules from `firestore.rules` once BE commits it | B-17 | todo |

---

## Backend (BE)

**Phase 1: correctness & money (do first)**

| ID | Task | Depends on | Status |
|---|---|---|---|
| B-4 | Verify order emails; harden webhook to read notes from the order, not the payment | O-1 | todo |
| B-1 | Normalise shipping method (free-shipping bypass) | — | todo |
| B-2 | Reject invalid / >100 / duplicate quantities with clear 400s (update contract) | — | todo |
| B-3 | Shrink Razorpay notes to ≤256 chars/value | — | todo |
| B-10 | Price/stock/engineering edge cases in create-order | B-15 | todo |
| B-15 | Create `shared/` module: CSV parser, bulk pricing, `isPurchasable`; use it in all functions and expose it to FE | — | todo |

**Phase 2: privacy, durability, abuse**

| ID | Task | Depends on | Status |
|---|---|---|---|
| B-14 | New `POST /api/track-order` (server-side lookup; returns only the matching row's status + link) | — | todo |
| B-16 | Webhook writes the order to Firestore `buyers/{uid}/orders/{orderId}` (server-authored record) | O-6 | todo |
| B-17 | Commit `firestore.rules` (orders read-only for clients) | B-16 | todo |
| B-5 | Durable order record + mark processed only after emails succeed | O-4 | todo |
| B-6 | Verify Turnstile in quote + cancel-order; document rate-limit rules for owner | O-5 | todo |
| B-7 | Seller login hardening (own secret, hashed passwords, no username logs) | O-7 | todo |
| B-9 | Return error when seller email fails in quote/cancel | — | todo |

**Phase 3: cleanup & redesign support**

| ID | Task | Depends on | Status |
|---|---|---|---|
| B-8 | Quote upload memory (lower limit or R2) | owner decision | todo |
| B-11 | Sitemap: add faq/contact + any new FE pages | — | todo |
| B-12 | De-duplicate helpers into `shared/` / `functions/_lib/` | B-15 | todo |
| B-13 | Minor items (escaping, `SELLER_EMAIL` defaults, delivery copy in emails) | R-2 for copy | todo |
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
