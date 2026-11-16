# Snap Print — Backend Context

> Context file for anyone (human or AI agent) changing server-side code.
> Covers `functions/` (Cloudflare Pages Functions), external services, env vars, data flow, and known problems.
> Companion file: [FRONTEND_CONTEXT.md](FRONTEND_CONTEXT.md).
> Snapshot of `main` @ `ca8c395` (Nov 2026).

---

## 1. Stack at a glance

| Concern | Technology |
|---|---|
| Hosting | Cloudflare Pages (static `dist/` + Pages Functions in `functions/`) |
| Runtime | Cloudflare Workers (V8 isolates, Web APIs only — `fetch`, `crypto.subtle`, `btoa`, no Node APIs) |
| Payments | Razorpay Orders API + `payment.captured` webhook |
| Email | Resend (`https://api.resend.com/emails`), sender `orders@snaprint.in` |
| Product / pricing data | Google Sheets published as CSV (read-only, public URLs) |
| Buyer accounts / orders | Firebase Auth + Firestore — **client-side only**; no function touches Firebase |
| Seller (admin) auth | Custom HMAC-signed token, credentials from `SELLER_ACCOUNTS` env var |
| Idempotency store | Cloudflare KV binding `ORDERS_KV` (optional — falls back to in-memory `Set`) |
| Database | **None.** There is no server-side order store. |

There is no `wrangler.toml`; bindings (KV) and env vars are configured in the Cloudflare Pages dashboard.

---

## 2. File map

```
functions/
├── sitemap.xml.js          GET  /sitemap.xml          dynamic sitemap (static pages + active products)
└── api/
    ├── _middleware.js      ALL  /api/*                CORS + security headers
    ├── create-order.js     POST /api/create-order     server-side price calc → Razorpay order
    ├── webhook.js          POST /api/webhook          Razorpay webhook → confirmation emails
    ├── quote.js            POST /api/quote            custom-part quote (multipart, STL/STEP upload) → emails
    ├── cancel-order.js     POST /api/cancel-order     cancellation request (JSON + base64 screenshot) → emails
    ├── seller-login.js     POST /api/seller-login     seller credential check → signed token
    └── send-shipment.js    POST /api/send-shipment    (token-auth) "order shipped" email to buyer
```

Pages Functions routing is file-based: `functions/api/foo.js` exporting `onRequestPost` = `POST /api/foo`.
Each file currently re-implements its own helpers (`jsonError`, `escapeHtml`, `sleep`, `sendEmailWithRetry`, CSV parser, HMAC helpers) — see problem **B-12**.

---

## 3. Endpoints

### 3.1 `_middleware.js` — all `/api/*`
- `OPTIONS` → 204 with CORS headers.
- Otherwise runs the handler, then sets `Access-Control-Allow-Origin` (allow-list: `snaprint.in`, `www.snaprint.in`, `dev.snap-print.pages.dev`, `localhost:3000`, `localhost:8788`; unknown origins get `https://snaprint.in`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
- Header comment claims "rate limiting" — **none is implemented**.

### 3.2 `POST /api/create-order`
Request:
```json
{ "items": [{ "id": "TOY-001", "quantity": 2 }],
  "shippingMethod": "surface",
  "buyer": { "uid", "email", "fullName", "phone", "address", "apartment", "city", "state", "pincode" } }
```
Flow:
1. Validates presence of items / shippingMethod / buyer.email, fullName, phone, pincode.
2. Fetches Products CSV + Shipping CSV (`PRODUCTS_CSV_URL` / `SHIPPING_RATES_CSV_URL`, falls back to the `VITE_` names).
3. Shipping method must exist in the sheet's `method` column (case-insensitive check).
4. Per item: must be `active=yes`, not `category=engineering`; quantity clamped to `[1,100]`; bulk price via `parseBulkPricing`/`getBulkPrice` (copied from `src/js/utils.js`); stock checked unless `made_to_order=yes` **or** product has bulk pricing.
5. Shipping: if `subtotal >= item_total` (sheet column) → free, else `shipping_cost`.
6. Creates Razorpay order (`amount` in paise, `currency: INR`, `receipt: order_<ts>`) with buyer + order details stuffed into `notes` (14 keys: `buyer_*`, `shipping_method`, `shipping_cost`, `subtotal`, `item_count`, `items_summary`, `items_detail` = JSON `[{n,q,p}]`).
7. Returns `{ order_id, amount, currency, key_id }`.

The server total is authoritative — the client never sends prices.

### 3.3 `POST /api/webhook` (Razorpay)
1. Reads raw body, verifies `X-Razorpay-Signature` = HMAC-SHA256(body, `RAZORPAY_WEBHOOK_SECRET`) with constant-time compare.
2. `payment.authorized` / `payment.failed` / anything else → 200, ignored. Only `payment.captured` is processed.
3. Idempotency: `ORDERS_KV` key `payment:<id>` (30-day TTL) — or in-memory `Set` if KV not bound. Marked processed **before** doing any work.
4. Builds `orderData` entirely from `payment.notes`.
5. Responds 200 immediately; `context.waitUntil()` sends buyer email, waits 500 ms, sends seller email. Both use Resend `Idempotency-Key` (`order-confirmed/<paymentId>-buyer`, `order-received/<paymentId>-seller`).
6. Header comment says "Logs order to Google Sheets" — **not implemented** (no Sheets code exists).

### 3.4 `POST /api/quote` (multipart/form-data)
Fields `name, email, phone, material, notes, file`. File must be `.stl/.step/.stp`, ≤ 25 MB. Converts file to base64 (chunked) and emails it to `SELLER_EMAIL` (default `queries@snaprint.in`) as an attachment, then sends a confirmation to the submitter. If `RESEND_API_KEY` is missing it just logs and still returns success. Email failures are logged, response is still `success: true`.

### 3.5 `POST /api/cancel-order` (JSON)
`{ orderId, name, email, phone, reason, screenshot: { data(base64), filename, contentType } }`. Screenshot required, ≤ 5 MB, png/jpeg/webp. Emails seller (with attachment, `reply_to` = buyer) and buyer (confirmation). Unauthenticated, no check that the order exists. Returns success even if both emails fail. Default seller email here is `snaprint.orders@gmail.com` (differs from quote.js).

### 3.6 `POST /api/seller-login`
`{ username, password }` checked against `SELLER_ACCOUNTS` (JSON array `[{username,password}]`, plaintext) with constant-time compare over every account. On success returns `{ success, token, username }`.
Token format: `base64(JSON{sub, exp, iat}) + "." + hex(HMAC-SHA256(payloadB64, RAZORPAY_WEBHOOK_SECRET))`, 4-hour expiry. Stored by the client in `sessionStorage`.

### 3.7 `POST /api/send-shipment`
`{ token, buyerName, buyerEmail, orderId?, shipmentPartner, trackingLink?, items?: [{name, quantity}] }`. Verifies token (inlined copy of `verifySessionToken`), then emails the buyer a "shipped" notice with a link to `https://snaprint.in/track-order.html` and the optional carrier link. Token travels in the JSON body, not an `Authorization` header.

### 3.8 `GET /sitemap.xml`
Static page list + `product.html?id=<id>` for every active, non-engineering product (CSV fetched with `cf.cacheTtl: 300`). Response cached 1 h. Falls back to static pages on error.

---

## 4. External data contracts

### Products sheet (CSV) — columns used server-side
`id, name, category, price, actual_price (or legacy compare_price), stock, made_to_order (yes/no), bulk_pricing, active (yes/no)`.
Frontend additionally uses `image_urls` (comma-separated), `description`, `material`, `dimensions`, `weight_g`, `instagram_url`.

`bulk_pricing` format: `"1-2:499|3-5:449|6-10:399|11+:349"` (pipe-separated `range:price`; ranges `a-b`, `n`, or `n+`). If quantity exceeds all tiers, the last tier applies.

### Shipping rates sheet (CSV)
`method, item_total, shipping_cost, field_content` — e.g. `surface,499,100,Ship Rocket Surface`. `item_total` is the free-shipping threshold.

### Other sheets (frontend only, listed here for completeness)
Hero images (column B = image URL), Order tracking (`order_id, customer_name, customer_email, mobile, order_status, tracking_link`). The order tracking sheet is a public CSV — see FRONTEND problem **F-1**.

### Razorpay
- Order created server-side; payment completed in Razorpay Checkout on the client; client handler does **not** verify `razorpay_signature` — confirmation relies solely on the webhook.
- Webhook URL: `https://snaprint.in/api/webhook`, event `payment.captured`. Live mode and test mode have **separate** webhook configs and secrets.

### Resend
Free tier: 2 req/s, 3,000 emails/month. Every function spaces calls 500 ms apart and retries only on 429 (honours `retry-after`, else 500 ms × 2^n). Non-429 errors throw immediately. Sender domain `snaprint.in` must be verified in Resend.

---

## 5. Environment variables

| Var | Used by | Notes |
|---|---|---|
| `PRODUCTS_CSV_URL` / `VITE_PRODUCTS_CSV_URL` | create-order, sitemap | server prefers non-VITE name |
| `SHIPPING_RATES_CSV_URL` / `VITE_SHIPPING_RATES_CSV_URL` | create-order | |
| `RAZORPAY_KEY_ID` / `VITE_RAZORPAY_KEY_ID` | create-order | returned to client as `key_id` |
| `RAZORPAY_KEY_SECRET` | create-order | |
| `RAZORPAY_WEBHOOK_SECRET` | webhook, seller-login, send-shipment | **also the seller-token signing key** |
| `RESEND_API_KEY` | webhook, quote, cancel-order, send-shipment | |
| `SELLER_EMAIL` | webhook, quote, cancel-order | defaults differ per file |
| `SELLER_ACCOUNTS` | seller-login | JSON array, plaintext passwords |
| `ORDERS_KV` (KV binding) | webhook | optional; strongly recommended |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | — | in `.env`/`.env.example` but **unused** |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SPREADSHEET_ID` | — | in `.env.example` but **unused** |

Local dev: `.dev.vars` (read by `wrangler pages dev`). The current `.dev.vars` has **no `RAZORPAY_WEBHOOK_SECRET`**, so locally `/api/seller-login` returns 500 and `/api/webhook` rejects everything.
`.env.example` is also missing `VITE_HERO_IMAGES_CSV_URL` and `VITE_ORDER_TRACKING_CSV_URL`, which the frontend reads.

---

## 6. Dev / deploy

```bash
npm run dev        # Vite only on :3000 — /api/* does NOT exist here
npm run dev:full   # vite build + wrangler pages dev dist/ on :8788 (functions + .dev.vars)
npm run deploy     # vite build + wrangler pages deploy dist/
```
Logs: `npx wrangler pages deployment tail` (all functions log with `console.*` only — there is no other observability).
No tests, no linter, no CI config in the repo.

---

## 7. Order lifecycle (end to end)

```
Browser checkout ──POST /api/create-order──► Razorpay order (notes = buyer + items)
     │
     ▼ Razorpay Checkout modal (client)
     ├─ handler(): client writes Firestore buyers/{uid}/orders/{orderId} (fire-and-forget), redirects to thank-you
     │
Razorpay ──POST /api/webhook (payment.captured)──► KV idempotency ──► Resend: buyer + seller emails
     │
Seller (manually) adds row to Order-tracking sheet; uses /seller-dashboard → /api/send-shipment
```
The only durable records of an order are: Razorpay dashboard, the two emails, and the buyer's own (client-written) Firestore doc.

---

## 8. Known problems (backend)

Severity: 🔴 high · 🟠 medium · 🟡 low. Each has a concrete location and a suggested fix.

### 🔴 B-1 Free-shipping bypass via shipping-method casing
[create-order.js:183](functions/api/create-order.js#L183) validates `shippingMethod.trim().toLowerCase()`, but [create-order.js:238](functions/api/create-order.js#L238) looks up the rate row with the **raw** `shippingMethod`. Sending `"AIR"` or `" air"` passes validation, finds no row, and `shippingCost` becomes `0`.
**Fix:** normalise once (`const method = shippingMethod.trim().toLowerCase()`) and use it everywhere, including the notes.

### 🔴 B-2 Silent quantity clamp, unvalidated quantities, duplicate line items
[create-order.js:204](functions/api/create-order.js#L204) clamps to 100 without telling the client. The UI allows any quantity (see F-6), so a buyer who chose 150 is charged for 100 while their Firestore record and cart say 150. `Number("abc")` → `NaN` survives the clamp; fractional quantities (`1.5`) are accepted. Two cart lines with the same `id` each pass the stock check independently.
**Fix:** reject (400) non-integer, `<1` or `>max` quantities instead of clamping; merge duplicate ids before the stock check.

### 🔴 B-3 Razorpay `notes` values exceed Razorpay's per-value limit
[create-order.js:286](functions/api/create-order.js#L286) and [:290](functions/api/create-order.js#L290) slice `items_summary` / `items_detail` to 512 chars. Razorpay documents notes as max 15 keys × **256 chars** each, so larger carts can make order creation fail ("Failed to create payment order"). Even under the limit, slicing JSON mid-string yields invalid JSON, so the webhook silently falls back to the plain summary. `buyer_address` is also unbounded.
**Fix:** keep notes small (ids + quantities only) and recompute details in the webhook, or persist the order server-side (KV/D1) keyed by `order_id` at creation time.

### 🔴 B-4 Order emails depend on `payment.notes` being populated
> **Status: unverified.** The owner believes the "email not working" issue (commit `b1de42d`) was resolved outside the code. Test one live/test payment end-to-end before changing this; the code risk below still applies.

The webhook reads every buyer field from `payment.entity.notes` ([webhook.js:98](functions/api/webhook.js#L98)). The notes were set on the **order**, while the client opens Checkout with `notes: {}` ([checkout.js:738](src/js/checkout.js#L738)). If the payment entity doesn't carry the order's notes, `buyerEmail` is `''`, the buyer email fails at Resend ([webhook.js:243](functions/api/webhook.js#L243)) and the seller email has blank buyer details. Errors only go to `console.error`.
**To verify:** open a recent live payment in the Razorpay dashboard and check whether its notes match the order's.
**Fix:** in the webhook, read notes from the order (subscribe to `order.paid`, whose payload includes the order entity, or `GET /v1/orders/{order_id}`), or pass the same notes in the Checkout options.

**Other things to check for missing emails (commit `b1de42d`):**
1. A webhook is configured in **Live mode** (separate from Test mode) for `payment.captured` → `https://snaprint.in/api/webhook`, and its secret equals the Production `RAZORPAY_WEBHOOK_SECRET`.
2. Payments are actually **captured** (Razorpay → Settings → Payment capture = automatic). Payments that are only authorized fire `payment.authorized`, which is ignored.
3. `RESEND_API_KEY` and `RAZORPAY_WEBHOOK_SECRET` are set for the **Production** environment in Pages (not only Preview).
4. `snaprint.in` is verified in Resend (SPF/DKIM). Unverified domain → 403 from Resend.
5. Run `wrangler pages deployment tail` during a test payment and look for `Resend API error (...)`.

### 🟠 B-5 No durable order record; emails lost on failure
The webhook marks the payment processed **before** sending ([webhook.js:107](functions/api/webhook.js#L107)), so a Resend failure means the emails are never retried and Razorpay retries are swallowed as duplicates. Google Sheets logging is advertised ([webhook.js:11](functions/api/webhook.js#L11)) but not implemented. If `ORDERS_KV` isn't bound, idempotency is per-isolate only, so duplicates are possible (Resend idempotency keys partly cover this for 24 h).
**Fix:** write the order to KV/D1 (or Sheets via service account) first; mark processed only after the emails succeed, or keep a `pending` state and retry.

### 🟠 B-6 Public endpoints are open email relays (no rate limit / bot check)
`/api/cancel-order` and `/api/quote` send mail from `orders@snaprint.in` to **any** address supplied in the request, with attacker-controlled name/reason text, unauthenticated and unlimited. This can burn the 3,000/month Resend quota and damage domain reputation. Turnstile keys exist in `.env` but are never verified. The middleware's "rate limiting" comment ([_middleware.js:7](functions/api/_middleware.js#L7)) is not implemented.
**Fix:** verify a Turnstile token in both endpoints; add Cloudflare rate-limiting rules for `/api/*` (WAF → Rate limiting).

### 🟠 B-7 Seller login hardening
- No brute-force protection on `/api/seller-login`.
- Passwords stored in plaintext in `SELLER_ACCOUNTS`.
- Token signing key = `RAZORPAY_WEBHOOK_SECRET` — rotating the webhook secret logs out all sellers; leaking one leaks both.
- Failed attempts log the submitted username, which often contains a mistyped password.
**Fix:** dedicated `SELLER_TOKEN_SECRET`; store salted hashes (PBKDF2 via `crypto.subtle`); rate-limit the route; stop logging usernames on failure.

### 🟠 B-8 Quote upload memory pressure
A 25 MB upload is held as `ArrayBuffer` + a binary JS string (UTF-16, about 50 MB) + a base64 string (about 33 MB) + the JSON body for Resend, which is close to the Workers 128 MB memory limit. Large uploads may crash the isolate (500).
**Fix:** lower the limit (e.g. 10 MB), or upload to R2 and email a signed link instead of attaching.

### 🟡 B-9 Success returned when emails fail
`quote.js` and `cancel-order.js` catch email errors and still return `success: true`, so the user believes the request was received. Return 502 if the **seller** email fails.

### 🟡 B-10 Data-handling edge cases in create-order
- `category === 'engineering'` is case-sensitive ([create-order.js:199](functions/api/create-order.js#L199)); sitemap and frontend lowercase it.
- Blank `price` cell → `Number('') = 0` → item is free. Validate `price > 0`.
- Blank `stock` with `made_to_order != yes` → treated as 0 → "out of stock", but the product page shows it as buyable (see F-7).
- Bulk-priced products skip the stock check entirely ([create-order.js:211](functions/api/create-order.js#L211)), intentionally but undocumented in the UI.

### 🟡 B-11 Sitemap is stale
`STATIC_PAGES` ([sitemap.xml.js:15](functions/sitemap.xml.js#L15)) is missing `/faq.html` and `/contact.html`.

### 🟡 B-12 Duplicated helpers, based on an incorrect assumption
Comments in create-order, seller-login, send-shipment and sitemap say Pages Functions "can't import" other files. They can: Pages bundles functions with esbuild, so relative imports work. The duplicated CSV parser, bulk-pricing logic, HMAC/token code and `sendEmailWithRetry` (4 copies) can live in one shared module, e.g. `functions/_lib/*.js` (no handler exports) or a top-level `lib/`. The bulk-pricing logic is also duplicated with `src/js/utils.js`, and the two copies must stay identical or prices diverge.

### 🟡 B-13 Minor
- Webhook email interpolates `orderId`/`paymentId` without `escapeHtml` (trusted Razorpay data after signature check; low risk).
- `send-shipment` puts `trackingLink` into an `href` without scheme validation (`javascript:` possible; seller-only input).
- `SELLER_EMAIL` defaults differ: `snaprint.orders@gmail.com` (webhook, cancel) vs `queries@snaprint.in` (quote).
- Delivery estimates in the confirmation email (Air 3–5, Surface 5–10 days) disagree with `shipping-policy.html` (Air 2–3, Surface 5–7).

## 9. Planned work (new IDs, not existing bugs)

- **B-14** `POST /api/track-order`: server-side tracking lookup (fixes FE F-1). Draft spec in `agents/API_CONTRACT.md`.
- **B-15** `shared/` module for logic both sides use (CSV parsing, bulk pricing, `isPurchasable`).
- **B-16** Webhook writes the order to Firestore with a service account, so the order record is server-authored.
- **B-17** `firestore.rules` committed to the repo (orders read-only for clients).
- **B-18** Restyle email templates to match the redesign (`agents/DESIGN_TOKENS.md`).

Coordination: see `CLAUDE.md` and `agents/`.
