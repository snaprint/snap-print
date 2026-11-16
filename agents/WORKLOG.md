# Work Log

**Active agent:** none
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

## 2026-11-17 · BACKEND
**Tasks:** B-4, B-1, B-2, B-3, B-10, B-9, B-5, B-6, B-7, B-11, B-12, B-13 (all on preview); B-15 core done inside B-10; B-8 waiting for owner (MESSAGES #9); new B-19 logged.
**Changed:**
- B-4 webhook reads buyer/items from the Razorpay **order** (`GET /v1/orders/{id}`); payment notes / payment.email are fallbacks. Owner had **not yet checked** whether emails arrive (O-1 still open).
- B-1 shipping method normalised once (`" AIR "` no longer gives free shipping); blank `shipping_cost` → 500 instead of free.
- B-2 quantities must be whole numbers 1–100 (400 otherwise); duplicate ids merged before stock/cap checks.
- B-3 Razorpay notes: every value ≤256 chars; items as compact `id:qty:price` chunks `items_1..3` (no JSON, never cut mid-item); buyer fields >256 → 400; huge carts → 400 "split the order". Webhook still reads old `items_detail` orders.
- B-10 `shared/products.js`: one purchasability rule (price > 0, case-insensitive category/yes-no, **blank stock = out of stock** for stock-tracked items), used by create-order. Rule written in BACKEND_CONTEXT §4.1.
- B-9 quote/cancel-order return 502 if the seller email fails (quote: 503 if email not configured).
- B-5 payment marked `done` in KV only after emails succeed; failures answer 5xx so Razorpay retries; 4 s budget → 503 + finish in background; works without KV (memory + Resend idempotency).
- B-6 Turnstile verification in quote + cancel-order, **off until `TURNSTILE_SECRET_KEY` is set**.
- B-7 optional `SELLER_TOKEN_SECRET`, PBKDF2 `passwordHash` accounts (plaintext still works), no usernames logged on failed login.
- B-11 sitemap + faq/contact. B-12 helpers moved to `functions/_lib/` (http, email, csv, seller-auth, turnstile). B-13 escaping, http(s)-only tracking links, one `SELLER_EMAIL` fallback (`snaprint.orders@gmail.com`; quote used `queries@snaprint.in`), plain-text subjects.
**Contract changes:** create-order (new 400s: quantity, field length, too many products, "currently unavailable"); quote + cancel-order (502/503, optional `turnstileToken`, 403 when enforced); send-shipment (400 for non-web tracking link). All in API_CONTRACT changelog. FE messages #3–#7.
**Tested locally:** Node harness with mocked fetch: about 150 checks across all tasks. Real bundle via `wrangler pages dev` (with a deliberately invalid Resend key, so no emails): 22 end-to-end checks incl. a real Razorpay **test** order with the new notes and the webhook fetching it back. **Not testable locally:** real email delivery, Razorpay retry behaviour, Cloudflare Free-plan CPU limit for password hashing, KV eventual consistency across locations.
**Pushed to dev:** yes, one commit per task (6c8e3ca … 10fad60) + this entry.
**How to verify on preview** (`https://dev.snap-print.pages.dev`, assuming O-2; commands for Git Bash):
1. Open `/sitemap.xml` → contains `/faq.html` and `/contact.html`.
2. Pick a product id from the sitemap (e.g. `SCULP-001`), then:
   `curl -s -X POST https://dev.snap-print.pages.dev/api/create-order -H "Content-Type: application/json" -d '{"items":[{"id":"SCULP-001","quantity":150}],"shippingMethod":"surface","buyer":{"email":"you@example.com","fullName":"Test","phone":"9876543210","pincode":"411001"}}'`
   → 400 "…must be a whole number from 1 to 100". Change quantity to `1` → 200 with `order_id`. Change `"surface"` to `" SURFACE "` → same `amount` as `"surface"` (not cheaper). Uses Razorpay test keys on preview (O-3).
3. Razorpay dashboard (Test mode) → Orders → open that order → Notes show `items_1` like `SCULP-001:1:<price>` and every value is short.
4. Emails (B-4/B-5): after O-12, do one test payment on preview checkout (card 4111 1111 1111 1111, any future date/CVV). Check: buyer email arrives; seller email arrives with name, phone, full address; Razorpay → Webhooks → the delivery shows **200**. That also closes O-1.
5. Quote form on preview: submit a small `.stl` → success, seller inbox gets it with attachment (no Turnstile needed yet).
6. Seller dashboard on preview: log in with your existing credentials (still works); send a shipment email to yourself with tracking link `www.dtdc.in/track` → email link is `https://www.dtdc.in/track`; try `javascript:alert(1)` → error message shown.
**Needs from other agent / owner:** FE: MESSAGES #3–#7 (F-6, F-7, maxlengths, 502 handling, F-20). Owner: MESSAGES #8 + #9, TASKS O-1, O-4, O-5, O-7, O-11, O-12, O-13, O-14.
**Next:** B-8 once the owner picks A/B; delivery copy once #8 is answered; B-19 if allowed to edit package.json; then Phase 2 features (B-14, B-16, B-17).

## 2026-11-17 · BACKEND (follow-up)
**Tasks:** O-1, O-12 done; B-4 email delivery verified on preview.
**Changed:** docs only. Owner added Razorpay Test-mode webhook → `dev.snap-print.pages.dev/api/webhook` and updated the Preview Resend key; test-order emails now arrive. Corrected BACKEND_CONTEXT: the **Live** webhook is `https://snap-print.pages.dev/api/webhook` (enabled), not snaprint.in. Two empty commits were pushed to trigger preview rebuilds after env var changes.
**Contract changes:** none
**Pushed to dev:** yes
**How to verify on preview:** place a test order on preview → buyer + seller emails arrive.
**Needs from other agent / owner:** unchanged (MESSAGES #8, #9; O-4, O-5, O-7, O-11, O-14).
**Next:** unchanged.

