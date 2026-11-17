# Work Log

**Active agent:** FRONTEND
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

## 2026-11-17 · BACKEND (owner decisions applied)
**Tasks:** B-8 (on preview), B-13 delivery copy (on preview), B-19 (on preview). Owner approved the BE recommendations.
**Changed:**
- B-8: `/api/quote` file limit 25 MB → **10 MB** (option A). Over → 400 with a message pointing to queries@snaprint.in.
- B-13: order emails say Air 3–5 / Surface 6–9 business days *including 1–2 days of production* (matches shipping policy). Note: this code change was accidentally committed inside the B-8 commit `51e4ea1`; documented in `0798cce`.
- B-19: `package.json` → `dev:full` now passes `--compatibility-date 2026-08-01` (only that script changed). Verified `npm run dev:full` starts and serves the site.
**Contract changes:** quote max file size 10 MB (changelog). FE messages #10 (upload limit) and #11 (delivery wording, F-11). Owner threads #8/#9 resolved.
**Pushed to dev:** yes (51e4ea1, 0798cce, 7306362 + this entry)
**How to verify on preview:**
1. Quote form: upload an `.stl` over 10 MB → error "File too large. Maximum size is 10 MB…" (the page itself may still say 25 MB until FE does #10). A small file still succeeds.
2. Place a test order with Surface shipping → confirmation email shows "6–9 business days (including 1–2 days of production)"; Air shows 3–5.
**Needs from other agent / owner:** FE: #3–#7, #10, #11. Owner: O-4, O-5, O-7, O-11 (and Production `RESEND_API_KEY` check before promoting).
**Next:** Phase 2 (B-14 track-order, B-16/B-17 Firestore) when the owner says go.

## 2026-11-17 · FRONTEND
**Tasks:** F-2, F-5, F-4, F-3a, F-7+F-6, MESSAGES #4, #10, F-11, F-12, F-15, F-13, F-8, F-10, F-9, F-18, F-16, F-17, F-19, F-20 (all on preview); new F-21 (found + fixed); R-1 proposal delivered, waiting for owner (O-9). Skipped as instructed: F-1 (B-14 planned), F-3b (B-16), F-14 (with R-3).
**Changed:**
- F-2: no more fake "dev mode" success; checkout/quote/cancel show the server `message`, keep input; `src/js/helpers.js` (`apiFetch`, `readApiError`).
- F-5: track-order mobile menu opens (duplicate handler removed).
- F-4: Firestore helpers throw (also prevents a failed read from wiping saved addresses); account page shows real errors, 15 s timeout on saves, offline order reads no longer look like "No orders yet".
- F-3a: post-payment writes awaited (max 4 s); order doc stores bulk unit price and the charged total.
- F-7/F-6: UI uses `shared/products.js` (copies deleted from utils.js); blank stock = Sold Out, price blank/0 = Currently unavailable; quantity capped at stock/100 incl. combined cart quantity.
- #4 maxlengths; #10 quote limit 10 MB; F-11 one delivery wording (`DELIVERY_*` in utils.js).
- F-12 shared `escapeHtml`, toast uses textContent; F-15 one product download per page; F-13 shuffle once; F-8 cart refreshes lines and blocks checkout for unavailable items; F-10 PIN prefix table, never overwrites a chosen state; F-9 shipping options from the sheet; F-18 seller token expiry.
- F-16 dead code removed; `auth-gate.js` + `states.js` shared. F-17 raw image folders dropped from `dist/` by a Vite plugin (not moved; see #13). F-20 Turnstile widget, only when `VITE_TURNSTILE_SITE_KEY` is set.
- F-21: `vite.config.js` `envDir` so local builds read `.env` (they silently used sample data before).
- **Shared files (CLAUDE.md §2):** `.env.example`: added `VITE_HERO_IMAGES_CSV_URL`, `VITE_ORDER_TRACKING_CSV_URL`, renamed `TURNSTILE_SITE_KEY` → `VITE_TURNSTILE_SITE_KEY`. `.gitignore`: comment explaining the `policy_pages/` rule (rule kept; it hides two local drafts). `package.json`, `CLAUDE.md` unchanged.
- R-1: `agents/design/` (README + 3 mockups, not deployed).
**Contract changes:** none. No requests to BE's contract.
**Tested locally** (`wrangler pages dev` with the real functions and an **invalid Resend key**, so no emails were sent; headless Edge via puppeteer, scripts kept in my scratchpad): ~90 browser checks, all passing at the end: quote/cancel error paths and network failure; mobile menu; product/catalog/cart caps and states with injected sheet rows (blank stock, blank price, "Engineering"); XSS strings in sheet values; one CSV download per page; shuffle; cart refresh; checkout with a **fake offline sign-in** (no real Firebase account touched): shipping options, PIN fill, maxlength, create-order 400 + network error; account page with Firestore unreachable; seller token expiry; Turnstile with Cloudflare test keys (pass → accepted, fail → 403 shown); sign-in gate on both pages. 52 PIN codes unit-tested. **Not tested:** a real Razorpay payment (the F-3a post-payment save), real Firebase writes, real email delivery, iOS Safari.
**Pushed to dev:** yes, one commit per task (a55200d … a43cdee) + this entry. Preview checked: new code is live.
**How to verify on preview** (https://dev.snap-print.pages.dev, phone and desktop):
1. **Phone:** open /track-order → tap ☰ → the menu opens and stays open (F-5).
2. Open a wall-art product (e.g. "buds_on_tree") → press + until it stops at **10** with "Max 10 per order"; Add to cart; press Add to cart again → "already has the maximum of 10" (F-6). A HueForge item with stock 1 → + is disabled.
3. /cart → + is disabled for that line; "Proceed to Checkout" works. In the sheet, set a cart item's `active` to `no` (or blank its stock), reload /cart → the line shows "No longer available"/"Sold Out" and checkout is disabled until you remove it; change it back (F-8).
4. Home: search for "a", clear it → the grid order doesn't jump (F-13).
5. /quote → help text says "up to 10 MB"; pick a file > 10 MB → error (#10). No widget is visible yet (F-20 waits for the site key).
6. Checkout (logged in): the shipping options show "Ship Rocket Surface/Air" from the sheet with "Est. 6–9 / 3–5 business days (including 1–2 days of production)" (F-9, F-11); PIN 403001 fills Goa; choose a state first, then type another PIN → your state stays (F-10). Name/address fields stop at their max length (#4).
7. Place a **test** payment (card 4111 1111 1111 1111, any future date, any CVV) → you see "Payment received. Saving your order…" briefly, then the thank-you page; /account → the order shows with the bulk-adjusted total actually charged (F-3a).
8. /account: edit your name → "Profile updated!"; with Wi-Fi off, saving shows an error after ~15 s instead of "updated" (F-4).
9. Seller: log in, then in DevTools → Application → Session storage, change `seller_token` to `x` and reload the dashboard → back to login with "Your session expired" (F-18).
10. Product FAQ and About → shipping answer reads "Air: 3–5 business days, Surface: 6–9 business days (including 1–2 days of production)" (F-11).
**Needs from other agent / owner:** Owner: MESSAGES #12 (made-to-order lead time), #13 (raw images / public prompt guide), #15 (Turnstile key steps, O-5), **#16 (review the redesign)**; TASKS O-15…O-17. BE: #14 (`.env.example` server vars).
**Next:** after O-9: R-2 tokens → R-3 partials (+F-14) → R-4 → R-5. F-1 once B-14 is live; F-3b once B-16 is live.

## 2026-11-17 · FRONTEND (redesign handover)
**Tasks:** redesign prep; no code changes. Owner gave the first design brief and asked for a handover to a new FE agent.
**Changed:**
- Backups: git tags `pre-redesign-live` (`main` @ `ca8c395`) and `pre-redesign-dev` (`dev` @ `742e141`), pushed to GitHub.
- `agents/REDESIGN_PLAN.md` (written by BE): added §8 "FE additions" (design principles as review criteria, phone-first build rules, phone testing incl. the headless <500 px gotcha, Lighthouse baseline G-5, owner sign-off on the component gallery, photography, out-of-scope list).
- `agents/design/README.md`: owner's brief ("modern, minimal, soft, not robotic, no glassmorphism/AI look, fits phones") + 10 proposed principles at the top. Directions A/B are not approved.
- `FRONTEND_CONTEXT.md` §9: machine, branches/URLs, backups, commands, browser-testing setup, test-data rules, images.
- TASKS: O-18 (gate 0 decisions), O-19 (photos, proposed). MESSAGES: replied to #17, handover #18.
- Note: a phone-first "Soft Paper" mockup set (`c-home/c-product/c-checkout.html`, `soft.css`) was drafted in `agents/design/` this session but was removed from disk before commit; it is not in the repo. The principles above describe it.
**Contract changes:** none
**Pushed to dev:** yes (docs only)
**How to verify on preview:** nothing visible changed.
**Needs from other agent / owner:** Owner: O-18 (promote dev, branch decision, product names, brief + approve a direction), O-19 optional; earlier #12, #13, #15. BE: R-2 tokens will follow the approved direction.
**Next:** new FE agent: read #18, then gate 0, then R-2.
