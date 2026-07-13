# Snap Print — Full Project Context & Handoff Document

**Read this alongside `ecommerce-site-plan.md`** (original spec/intended architecture). This document is the current, up-to-date state of the actual build — infrastructure, features, security measures, workflow, and known issues — as of this handoff. Treat completion claims from any agent as things to *verify*, not trust outright (see Lessons Learned).

---

## 1. Project Overview

**Snap Print** (`snaprint.in`) — an e-commerce storefront for 3D-printed toys, home decor, and custom engineering parts, made in India. Single-vendor, no-database, low/zero-cost infrastructure: static frontend + serverless functions + Google Sheets as a human-editable data layer + Razorpay for payments + Resend for email.

**Design philosophy:** zero/near-zero ongoing maintenance. Routine changes (prices, stock, new products, new hero images) should require editing a Google Sheet only — no code, no redeploy. Code changes are only needed for genuinely new features or new product photos.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vite (multi-page), vanilla HTML/CSS/JS |
| Hosting | Cloudflare Pages |
| Backend | Cloudflare Pages Functions (serverless) |
| Payments | Razorpay (Orders API + Checkout.js popup) |
| Data (public) | Google Sheets, published as CSV |
| Data (private) | Google Sheets, via Google Cloud service account |
| Email | Resend |
| Image hosting | GitHub repo (`public/images/`) |
| Idempotency store | Cloudflare KV |
| Domain/DNS | Cloudflare (migrated from GoDaddy) |
| Version control | GitHub, Git-connected deploy to Cloudflare Pages |

---

## 3. Live Infrastructure

| Component | Status | Detail |
|---|---|---|
| Domain | ✅ Active | `snaprint.in`, nameservers on Cloudflare |
| Production hosting | ✅ Live | Cloudflare Pages project `snap-print`, production branch `main`, deploys to `snaprint.in` + `snap-print.pages.dev` |
| Staging | ✅ Set up | `dev` branch → auto preview deploy at `dev.snap-print.pages.dev` (Cloudflare's built-in branch-alias feature, no separate project needed) |
| GitHub repo | ✅ | `github.com/snaprint/snap-print` |
| Deployment method | ✅ Git-push only | **Direct Upload (`wrangler pages deploy` / `npm run deploy`) must not be used** — caused real bugs previously by bypassing the build pipeline; Git push is the only sanctioned deploy path |
| Build | ✅ | Command: `npm run build` · Output dir: `dist` |
| Restore point | ✅ | Git tag `version-1` pushed to origin, marks last known-good state on `main` |

---

## 4. Security & Tamper-Proofing — full detail

This is the core design constraint of the whole project. **Any code change must not weaken these guarantees.**

### 4.1 Price integrity
- The frontend **never** sends price, subtotal, total, or weight to the server. Only `item_ids` + `quantities` + `shipping_method` (`"normal"`/`"speed"`) + buyer details.
- `functions/api/create-order.js` independently re-fetches current prices and weights from the **Products Sheet CSV** on every single order — never trusts, caches, or reuses a client-supplied value.
- **Live-tested via forged request:** a manually edited `fetch()` call injecting fake `price`/`amount` fields into the payload was sent directly to the endpoint (bypassing the UI). The server computed and returned the real total regardless — forged fields were fully ignored. Confirmed working.

### 4.2 Shipping integrity
- Same rule: only `shipping_method` string is client-supplied. `total_weight_g`, `weight_tier`, and the shipping ₹ amount are always computed server-side from the Products Sheet (`weight_g`) and Shipping Rates Sheet.
- Server validates `shipping_method` is exactly `"normal"` or `"speed"` — rejects/ignores anything else.

### 4.3 Order creation lock-in
- Server calls Razorpay **Orders API** with the computed total, receiving an `order_id` with the amount locked server-side on Razorpay's end.
- Frontend Checkout.js opens using only that `order_id` — never a raw amount.

### 4.4 Payment confirmation trust chain
- The frontend's post-payment `handler` callback is **cosmetic only** (drives the thank-you page UI) — it never triggers fulfillment, Sheet writes, or emails. A buyer closing the tab immediately after paying does not prevent order fulfillment, because fulfillment never depended on the frontend being alive.
- **Only `functions/api/webhook.js`**, receiving a server-to-server call directly from Razorpay, is authoritative.
- **Signature verification:** every incoming webhook's HMAC signature is verified using `RAZORPAY_WEBHOOK_SECRET` before any further processing. Invalid signature → HTTP 401, nothing downstream executes.
- **Event filtering:** only `payment.captured` triggers the Sheet write + emails. `payment.authorized` and `payment.failed` are acknowledged (200, so Razorpay doesn't retry) but produce no side effects.
- **Auto-capture** is enabled in Razorpay settings, so authorized payments settle to captured automatically without a manual step.

### 4.5 Idempotency
- Enforced via **Cloudflare KV** (binding name `ORDERS_KV`), checked before any Sheet write or email send. Payment ID is looked up in KV; if already processed, the event is acknowledged but not reprocessed.
- Historical note: an earlier implementation used an in-memory JS `Set`, which does **not** persist across separate Cloudflare Function invocations and would not have caught real duplicate webhook deliveries. Replaced with KV — this is the correct, current implementation.

### 4.6 Secrets management
- All secrets (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON` if in use) are stored **only** as Cloudflare Pages encrypted Environment Variables — never in committed code, never in `.env` (which is gitignored), never in frontend bundles.
- Only variables explicitly prefixed `VITE_` are exposed to frontend/client code (`VITE_PRODUCTS_CSV_URL`, `VITE_SHIPPING_RATES_CSV_URL`, `VITE_HERO_IMAGES_CSV_URL`, `VITE_RAZORPAY_KEY_ID`) — this is a Vite build-tool convention, not optional.
- `.gitignore` excludes: `node_modules/`, `dist/`, `.wrangler/`, `.env`, `.dev.vars`, and the user's local `razorpay_test_key/` folder.
- Test-mode and live-mode secrets (Key ID, Key Secret, Webhook Secret) are entirely separate per Razorpay's own mode separation — swapping to live mode requires updating all three together, not just the API keys.

### 4.7 Email authentication
- `snaprint.in` domain verified on Resend via SPF + DKIM DNS records (auto-configured through Cloudflare).
- DMARC currently set to `p=none` (monitor-only) — intentionally deferred tightening to `p=quarantine`/`p=reject`, optional/low-priority.

### 4.8 Data exposure boundaries
- Products, Shipping Rates, and Hero Images sheets are **intentionally public** (published-to-web CSV) — read-only by design (Google's "publish to web" grants no edit access via that link). Nothing sensitive (cost price, supplier info, margins) should ever be added to these sheets.
- Orders Sheet is **private**, accessed only via a Google Cloud service account with Editor permission — never published publicly.

### 4.9 Known accepted limitation
- No stock-locking/reservation mechanism — two simultaneous buyers could both successfully purchase the last unit of a limited-stock item, since stock isn't decremented automatically anywhere. Accepted as a current limitation at this scale, not yet solved.

---

## 5. Data Schemas

**Products Sheet** (public CSV): `id, name, category, price, weight_g, stock, made_to_order, image_urls, description, material, dimensions, active`

**Shipping Rates Sheet** (public CSV): `method, weight_tier, price` — 4 fixed rows (normal/under_500g/₹70, normal/500g_or_more/₹80, speed/under_500g/₹120, speed/500g_or_more/₹150)

**Hero Images Sheet** (public CSV, tab `gid=1823967526`): column B = image URL per row; carousel loops through however many rows exist, currently ~5

**Orders Sheet** (private, service account): written only by the webhook handler post-verification

**Image hosting convention:** `raw.githubusercontent.com/...` URLs only (never `github.com/.../blob/...`, which serves an HTML page, not the image file) — handled via a shared `resolveImageUrl()` helper. Known cosmetic debt: some filenames contain spaces/mixed case (works via `%20` encoding, but recommended cleanup to lowercase-hyphenated is still pending.

---

## 6. Environment Variables (names only)

| Name | Type | Scope | Purpose |
|---|---|---|---|
| `VITE_PRODUCTS_CSV_URL` | Plaintext | Frontend | Products Sheet CSV |
| `VITE_SHIPPING_RATES_CSV_URL` | Plaintext | Frontend | Shipping Rates Sheet CSV |
| `VITE_HERO_IMAGES_CSV_URL` | Plaintext | Frontend | Hero Images Sheet CSV |
| `VITE_RAZORPAY_KEY_ID` | Plaintext | Frontend | Public Razorpay key for Checkout.js |
| `RAZORPAY_KEY_SECRET` | Secret | Backend | Orders API authentication |
| `RAZORPAY_WEBHOOK_SECRET` | Secret | Backend | Webhook HMAC signature verification (test-mode value currently; separate from live-mode) |
| `RESEND_API_KEY` | Secret | Backend | Email sending |
| `SELLER_EMAIL` | Plaintext | Backend | `snaprint.orders@gmail.com` — internal order/quote notification inbox |

**Not yet set:** `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (deferred, bot protection not yet implemented).

**Preview (dev branch) environment:** must have the same variable set duplicated under Cloudflare's Preview environment section, or the `dev` deployment will silently fall back to broken/empty state — same class of bug hit once already on Production. A **separate test-mode webhook** should be registered pointing at `https://dev.snap-print.pages.dev/api/webhook` if webhook testing happens on `dev`.

---

## 7. Email Addresses — three distinct purposes

| Address | Role |
|---|---|
| `orders@snaprint.in` | `from` on all automated emails. Sending-only, no real inbox. |
| `queries@snaprint.in` | `reply-to` on all automated emails; also the public contact address shown on-site. Forwards to `snapprint799@gmail.com` via Cloudflare Email Routing. |
| `snaprint.orders@gmail.com` | `SELLER_EMAIL` — internal notification inbox for orders + quotes. Not shown publicly. |

Automated email triggers:
- **Order confirmation** (fires inside `webhook.js`, only after signature + capture + idempotency checks pass): two separate emails — full itemized details to seller, confirmation + delivery estimate to buyer.
- **Quote request** (fires inside `quote.js`): one email to seller with buyer contact + uploaded spec files.

---

## 8. Git Branching & Deployment Workflow

- **`main`** — production, auto-deploys to `snaprint.in`. Only updated via deliberate merge from `dev`, never worked on directly by an agent.
- **`dev`** — active development branch, auto-deploys to `dev.snap-print.pages.dev` (Cloudflare's automatic branch-alias preview, no separate project required). All agent work happens here.
- **`version-1`** — Git tag marking a known-good restore point on `main`, pushed to origin.

**Standard deploy cycle (either branch):**
```
git status
git add -A
git commit -m "..."
git push
```
Push alone triggers Cloudflare's build automatically — no manual deploy command needed, ever, on either branch.

**Merging tested `dev` work into production (deliberate, user-initiated only):**
```
git checkout main
git merge dev
git push
```

**Emergency rollback** (destructive — discards everything since the tag; only use if certain):
```
git checkout main
git reset --hard version-1
git push --force
```

---

## 9. Features — Implemented & Verified

- Full checkout flow end-to-end: cart → shipping method → Razorpay Checkout popup → payment → webhook → Sheet write → seller email → buyer email. Tested successfully in Razorpay test mode.
- Dynamic product catalog from Products CSV, `cache: 'no-store'` fetch (fixes confirmed stale-cache bug).
- Dynamic category tiles/filters (no hardcoded category list).
- `made_to_order` / `active` Sheet-driven visibility logic (user spot-checking ongoing).
- Tamper-proofing verified via live forged-request test (Section 4.1).
- Idempotency implemented via KV (Section 4.5) — not yet stress-tested with a deliberate duplicate webhook replay.

## 10. Features — In Progress / Just Specified

- Global search bar + category picker — moving from homepage-only into the persistent header, using URL query params (`?q=...&category=...`) for shareable filtered views.
- Scrolling hero image carousel from the Hero Images Sheet, looping, with static-image fallback on fetch failure.
- Hero canvas shape — square (1:1) → rectangular (16:9), `object-fit: cover`.
- Shop dropdown UI polish — two CSS fixes specified: dropdown arrow vertical shift on hover (needs fixed icon box + `transform-origin: center`), and "SHOP" label/arrow stacking instead of sitting inline (needs `display: inline-flex; align-items: center`).
- Contact email correction — replacing leftover `hello@snaprint.in` with `queries@snaprint.in` sitewide; footer confirmed as one location, unclear if shared component or duplicated per-page (needs a global search across files to confirm all instances caught).

## 11. Explicitly Not Done Yet

- **Turnstile bot protection** on checkout/quote forms — deferred, not urgent pre-launch.
- **Four policy pages** — Refund/Return, Shipping, Terms & Conditions, Privacy Policy. **High priority** — most likely reason Razorpay's website verification (required before real/live transactions) could get rejected.
- **Razorpay KYC + live website verification submission** — not yet submitted; will require live-mode Key ID/Secret/Webhook Secret swap once approved (24–48hr review window).
- **DMARC tightening** — optional, deliberately deferred.
- **Hero stock photo replacement** — being addressed via the carousel feature (Section 10).
- **Stock race condition** — accepted limitation (Section 4.9), not solved.
- **Image filename cleanup** (spaces/mixed case → lowercase-hyphenated) — cosmetic debt, not yet done.

---

## 12. Lessons Learned — real bugs already hit, read before repeating them

1. **`git commit --allow-empty` does not include file changes** — it only re-triggers a rebuild of whatever is already committed. Real code changes require `git add -A` → verify via `git status` → `git commit -m "..."` → `git push`. An agent's real fix once sat uncommitted on disk for several rounds of "why isn't this working" before this was caught.
2. **Vite only exposes `VITE_`-prefixed env vars to frontend code.** Getting this prefix wrong (or omitting it) causes silent empty-string values, not an error.
3. **Cloudflare's Git-connected build has no access to a local `.env` file** — it's gitignored by design. All variables the deployed site needs must be set directly in Cloudflare's dashboard (Production **and** Preview environments separately). This caused a real bug: the live site fell back to hardcoded sample data for a period because the build never had real CSV URLs.
4. **Cloudflare Pages Functions have no persistent memory between invocations** — in-memory idempotency checks don't work; use Cloudflare KV or another persistent store.
5. **Razorpay test mode and live mode are fully separate**, including webhooks and their secrets — a webhook registered in one mode never fires for the other.
6. **Browsers cache `fetch()` responses by default** — CSV fetches need `cache: 'no-store'` or a cache-busting param, or the same device sees stale data while new devices see it fine (a strong diagnostic signal for this exact bug).
7. **GitHub `blob` URLs are HTML pages, not raw files** — always use `raw.githubusercontent.com` for anything referenced as an image source.
8. **Verify claims by testing live behavior, not by reading an agent's own "done" summary.** Several confirmed-fixed issues in this project turned out to have real gaps (unpushed commits, wrong-mode webhook, non-persistent idempotency) only caught through direct testing — DevTools inspection, fresh end-to-end payments, dashboard logs.

---

## 13. Reliability Testing

A full adversarial test checklist exists separately (`reliability-stress-tests.md`) covering: price/shipping tampering via forged requests, webhook replay/signature forgery, idempotency/concurrency, stock edge cases, input edge cases, deployment/config drift, email delivery, and uptime. Section 1 (price tampering) has been run and passed live. Re-run Sections 1–4 (the money-critical ones) any time `create-order.js`, `webhook.js`, or Sheets-reading logic changes.

---

## 14. Recommended First Steps for Whoever Picks This Up Next

1. Read `ecommerce-site-plan.md` for original intended architecture.
2. Confirm current `git status`/`git log` on both `main` and `dev` match what's described here.
3. Confirm with the user which of Section 10's in-progress items are actually complete vs. still open.
4. If nearing real launch: prioritize Section 11's policy pages (Razorpay verification blocker) before anything cosmetic.
5. Never work directly on `main` — always `dev`, merge deliberately.
