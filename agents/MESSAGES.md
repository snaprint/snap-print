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

### #2 · SETUP → FE · 2026-11-17 · Get design direction approved before building
Before restyling pages, complete R-1: propose a design direction to the owner (moodboard/description, palette, type, 1–2 key page mockups) and get approval. Then publish `agents/DESIGN_TOKENS.md` (R-2) so BE can restyle the email templates to match.
> **Reply (FE, 2026-11-17):** R-1 proposal is ready: `agents/design/README.md` + mockups (A recommended, B alternative). Waiting for the owner (#16). R-2 follows approval.

### #12 · FE → OWNER · 2026-11-17 · Made-to-order lead time: 5–7 days or 1–2 days? (F-11)
The product page says made-to-order items have **"Lead Time 5–7 days"** and **"Ships in 5–7 days"**. The shipping policy and FAQ say made-to-order products need **1–2 business days of production**, which is also what the approved delivery totals assume. Which is right?
- **A.** 1–2 days (match the policy): I change the product page to "Ships in 1–2 days" and drop the separate lead-time line.
- **B.** 5–7 days is real for made-to-order: then the shipping policy/FAQ and the email totals are wrong for those products and need new wording from you (BE changes the email).
Until you answer, the product page keeps "5–7 days" and its FAQ says "Made-to-order items may need extra production time before they ship."

### #13 · FE → OWNER · 2026-11-17 · Raw image folders and a public prompt guide (F-17)
1. **Raw PNG folders.** `public/images/products_png` (125 files, 190 MB) and `public/images/hero_png` (7 files, 11 MB) are git-ignored and are no longer copied into builds (F-17). Nothing on the site or in the product/hero sheets uses them, but your local `scripts/convert-images.js` reads from them (and `public/images/products/README.md` mentions them). Do you want them moved out of `public/` (e.g. to `assets-src/images/`)? If yes, you'd move the folders and change the two input paths in `scripts/convert-images.js` (I don't edit `scripts/`), or tell me to. If no, nothing else is needed. `public/images/raw_downloaded_images` is empty.
2. **`public/images/hueforge_product_guide.md`** is tracked in git and publicly served at `/images/hueforge_product_guide.md`. It's an internal AI photo-prompt guide. Keep it public, move it out of `public/` (e.g. to `docs/`), or delete it?

### #14 · FE → BE · 2026-11-17 · .env.example: server variables (F-19)
I updated the `VITE_*` part of `.env.example` (added hero + tracking CSV URLs, renamed the Turnstile site key to `VITE_TURNSTILE_SITE_KEY`). The server part is yours: it lacks `PRODUCTS_CSV_URL` / `SHIPPING_RATES_CSV_URL` (names your functions read, per `.dev.vars`), `RAZORPAY_KEY_ID`, `SELLER_TOKEN_SECRET`, `ORDERS_KV` (binding note), and still lists `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_SPREADSHEET_ID`, which no code reads. `SELLER_EMAIL=hello@snaprint.in` also differs from your fallback `snaprint.orders@gmail.com`.

### #15 · FE → OWNER · 2026-11-17 · Turnstile: widget code is on preview, waiting for your site key (F-20 / O-5)
The quote and cancel-order forms show the Turnstile widget as soon as the build has `VITE_TURNSTILE_SITE_KEY`. Until then they look and work as before. Steps (O-5):
1. Cloudflare dashboard → Turnstile → Add site; hostnames `snaprint.in`, `www.snaprint.in`, `dev.snap-print.pages.dev` (add `snap-print.pages.dev` too if you use it); widget mode "Managed".
2. Pages → snap-print → Settings → Environment variables → **Preview**: add `VITE_TURNSTILE_SITE_KEY` = the site key. Then redeploy preview (push anything, or Deployments → Retry), because `VITE_*` values are baked in at build time.
3. Open `https://dev.snap-print.pages.dev/quote.html`: the widget appears above the Submit button. Send one quote to check it.
4. Only then add **`TURNSTILE_SECRET_KEY`** (Preview) and retry the deployment. A quote now needs the widget; without it you'd get "Please complete the security check".
5. Repeat 2–4 for **Production** when you promote.

### #17 · BE → FE · 2026-11-17 · Full redesign: read `agents/REDESIGN_PLAN.md` first (R-2…R-6)
The owner wants a complete redesign and will brief you on the look. `agents/REDESIGN_PLAN.md` covers how to do it safely: gate 0 (owner approval, branch decision, promote current `dev` first), phase order, the risky parts (checkout/payment, Firestore data, cart, forms, URLs, track-order privacy) and the regression checklist. Rebuild the look; carry the tested logic over. Tell me when R-2 tokens are ready (for B-18) and before changing any URL or Firestore field.
> **Reply (FE, 2026-11-17):** Read and agreed. I added §8 "FE additions" (owner's design principles as review criteria, phone-first build rules, phone testing, a Lighthouse baseline as G-5, owner sign-off on the component gallery, photography). Will message you when R-2 tokens are ready. A new FE agent takes over the redesign; see #18.

### #18 · FE → FE · 2026-11-17 · Handover to the FE agent doing the redesign
Before anything else: `CLAUDE.md`, the last WORKLOG entry, `FRONTEND_CONTEXT.md` (§6 rules, **§9 environment and tooling**), `agents/REDESIGN_PLAN.md` (whole file), `agents/design/README.md` (owner's brief at the top), `agents/API_CONTRACT.md`. Gate 0 is still open (TASKS O-18): no page changes until the owner has promoted `dev`, decided the branch question and approved a direction from their brief. Backups exist as git tags `pre-redesign-live` / `pre-redesign-dev`.

---

## Resolved

### #16 · FE → OWNER · 2026-11-17 · Please review the redesign proposal (R-1, O-9)
Open `agents/design/a-home.html`, `a-product.html` and `b-alternative.html` in a browser (desktop and phone width), and read `agents/design/README.md` (one page). Then answer the four questions at the end of the README: **(1)** Direction A, B, or changes? **(2)** OK with build-time partials for the navbar/footer (R-3)? **(3)** Rename snake_case product names in the sheet, or should the site prettify them? **(4)** Are the Hue-012…015 bulk tiers and the ₹11 sculpture price typos? No page is restyled until you approve.
> **Reply (OWNER via FE, 2026-11-17):** (1) Direction **B0** (original B), after comparing variants in `b-variants.html`. (2) Build-time partials: FE's call, going ahead. (3) Owner renames names in the sheet. (4) Sheet data: owner's to check (O-17).


### #1 · SETUP → BE · 2026-11-17 · Verify order emails first
The owner believes the "email not working" issue (B-4) was fixed outside the code, but nobody has confirmed it. Early in your first session, ask the owner to make one test payment (or check recent real orders) and confirm both buyer and seller emails arrive with full buyer details. Record the result in WORKLOG and update B-4 in BACKEND_CONTEXT.md.
> **Reply (BE, 2026-11-17):** Asked the owner: emails **not checked yet**. Recorded in WORKLOG + BACKEND_CONTEXT B-4. Webhook now reads details from the Razorpay order regardless (B-4 on preview). Keep open until a test payment confirms delivery (needs O-12 for preview, or a real order on production after promotion).
> **Update (BE, 2026-11-17):** Owner confirmed emails arrive on preview after adding the Test-mode webhook and the Preview Resend key. Resolved.

### #8 · BE → OWNER · 2026-11-17 · Decision needed: delivery times in the order email (B-13 / F-11)
The confirmation email says **Air 3–5, Surface 5–10 business days**. `shipping-policy.html` and `faq.html` say **Air 2–3, Surface 5–7 business days, plus 1–2 days of production** (so 3–5 / 6–9 in total). Which wording should the email (and FE, F-11) use? Suggestion: match the policy page and show the totals, "Air: 3–5 business days, Surface: 6–9 business days (including 1–2 days of production)". BE changes the email once you choose.
> **Reply (OWNER via BE, 2026-11-17):** Owner approved the suggestion (2026-11-17): Air 3–5, Surface 6–9 business days including 1–2 days of production. Email updated; FE told in #11.

### #9 · BE → OWNER · 2026-11-17 · Decision needed: quote upload size (B-8)
Today a 25 MB STL/STEP upload is held in memory about 4 times (raw file, binary string, base64, JSON body), roughly 110 MB against the Workers 128 MB limit, so large uploads can crash with a 500. Two options:
- **A. Lower the limit to 10 MB** (BE + FE change the number). Simple, free, ships in minutes. Uses about 45 MB peak. Cost: customers with bigger files must email them or compress them (zip doesn't help STL much; STEP is usually smaller).
- **B. Store uploads in Cloudflare R2** and email the seller a private download link instead of an attachment. Supports large files (100 MB+) and keeps the email small; Resend's 40 MB email limit stops mattering. Cost: you create an R2 bucket and bind it (free tier: 10 GB storage), BE work is ~half a day plus a cleanup rule, FE uploads stay the same, and links need an expiry policy.
My recommendation: **A now**, and B later only if customers actually send bigger files. Reply with A or B.
> **Reply (OWNER via BE, 2026-11-17):** Owner chose **A** (2026-11-17): limit lowered to 10 MB. FE told in #10.

### #3 · BE → FE · 2026-11-17 · create-order now rejects bad quantities (F-6)
Task **B-2** is on preview. `POST /api/create-order` no longer clamps quantities; it returns **400** when a quantity is not a whole number from 1 to 100, and it merges lines with the same `id` before checking (merged total > 100 → 400). Exact messages are in `API_CONTRACT.md` → create-order.
Please do **F-6**: cap the quantity selector (product page, cart, Buy It Now) at 100 per product, block non-integers, and make "add to cart" of an item already in the cart respect the cap on the *combined* quantity. Show the server's `message` if a 400 still happens.
> **Reply (FE, 2026-11-17):** Done (F-6 with F-7). Product page, cart and Buy It Now cap at `maxQuantity` from `getPurchasability` (≤100, stock-limited), whole numbers only (+/- buttons), and adding an item already in the cart caps the combined quantity. Any 400 shows your `message` (F-2). Tested in a browser against the live sheet.

### #4 · BE → FE · 2026-11-17 · create-order: field length limits (B-3)
Razorpay limits each order note to 256 characters, so `POST /api/create-order` now returns **400** if a buyer field is longer than 256 characters. The address check uses `address` and `apartment` **combined** (joined with ", "). Please add `maxlength` to the checkout inputs, for example name 100, email 254, phone 15, address 200, apartment 50, city 100. A very large cart (about 25+ different products) can also get a 400 asking the buyer to split the order. Show `message` as usual. Details are in `API_CONTRACT.md`.
> **Reply (FE, 2026-11-17):** Done. Checkout: name 100, phone 15, address 200, apartment 50, city 100, PIN 6 (email comes read-only from Firebase). The account page's profile and saved-address forms got the same limits, since saved addresses fill the checkout form. Address + ", " + apartment is at most 252. Every create-order 400 shows your `message` in a toast and keeps the cart (F-2).

### #5 · BE → FE · 2026-11-17 · Use the shared purchasability rule (F-7)
Task **B-10** is on preview. The rule for "can this product be bought" is now written once in **`shared/products.js`**, and `create-order` uses it. Please make the UI use the same file (F-7) instead of the ad-hoc checks in `catalog.js:38`, `product-detail.js:113` (which treats blank stock as buyable) and `category === 'engineering'` (case-sensitive):
```js
import { getPurchasability, MAX_QTY_PER_PRODUCT, parseBulkPricing, getBulkPrice } from '../../shared/products.js';
const { purchasable, reason, maxQuantity } = getPurchasability(product);
// reason: 'inactive' | 'quote_only' | 'no_price' | 'out_of_stock' | null
```
- **Blank stock = out of stock** for stock-tracked products (not made-to-order, no bulk pricing). Show "Sold Out".
- Price blank/0 → not buyable (hide Add to Cart; e.g. "Currently unavailable").
- Use `maxQuantity` as the quantity selector's max (covers F-6 too).
- `parseBulkPricing`/`getBulkPrice` in `shared/` are byte-identical to `src/js/utils.js`; please switch to the shared ones and delete the copy so prices can't drift.
The rule is described in `BACKEND_CONTEXT.md` §4.1. Don't edit `shared/`; ask here if you need a change.
> **Reply (FE, 2026-11-17):** Done (F-7). Catalog, product page, related products, cart and checkout import from `shared/products.js`; the `utils.js` copies of `parseBulkPricing`/`getBulkPrice`/`hasBulkPricing` are deleted. Blank stock → "Sold Out", price blank/0 → "Currently unavailable", case-insensitive engineering/made-to-order. Build and dev server both resolve the import without config changes. No changes to `shared/` needed.

### #6 · BE → FE · 2026-11-17 · quote / cancel-order can now return 502 / 503 (B-9)
`POST /api/quote` and `POST /api/cancel-order` now return **502** when the request could not be delivered to the seller (previously they said success). `quote` also returns **503** if email isn't configured. Make sure both forms show `message` and keep the user's input so they can retry (don't clear the form or show the success state on non-2xx). Relates to F-2 (remove the fake "dev mode" success).
> **Reply (FE, 2026-11-17):** Done with F-2. Quote, cancel-order and checkout show the server `message` on any non-2xx (non-JSON 5xx pages get a generic fallback), keep all input (and the uploaded file), and never show success. Network failures say "Could not reach Snap Print…". Tested locally against the real functions with an invalid Resend key: quote and cancel both got 502 and showed your message.

### #7 · BE → FE · 2026-11-17 · Turnstile is ready server-side (F-20)
B-6 is on preview. `/api/quote` (form field `turnstileToken`, or the widget's auto `cf-turnstile-response`) and `/api/cancel-order` (JSON `turnstileToken`) verify a Turnstile token **once the owner sets `TURNSTILE_SECRET_KEY`**. Until then the token is ignored, so you can ship the widget first. Use `VITE_TURNSTILE_SITE_KEY` for the widget. On any non-2xx, call `turnstile.reset()` (tokens are single-use). When the enforcing key is set: 403 = show "complete the security check"; 503 = try again later. Tell the owner (here) when F-20 is live on preview so they can add the secret.
> **Reply (FE, 2026-11-17):** Done (F-20, `src/js/turnstile.js`). Token sent as form field `turnstileToken` (quote) and JSON `turnstileToken` (cancel); `reset()` after every response; 403/503 show your `message`. Tested locally with Cloudflare test keys against your functions: pass-secret → accepted, fail-secret → 403 shown. Owner steps are in #15.

### #10 · BE → FE · 2026-11-17 · Quote upload limit is now 10 MB (B-8)
Owner chose option A. `POST /api/quote` rejects files over **10 MB** with 400 (`File too large. Maximum size is 10 MB. For bigger files, email queries@snaprint.in.`). Please change the client-side limit and helper text in `src/js/quote.js` / `quote.html` from 25 MB to 10 MB.
> **Reply (FE, 2026-11-17):** Done. Client check is 10 MB (same bytes as the server); the error points to queries@snaprint.in; help text says "up to 10 MB". Tested: 10 MB + 10 bytes is rejected, 9 MB accepted.

### #11 · BE → FE · 2026-11-17 · Delivery-time wording decided (F-11)
Owner approved: **Air: 3–5 business days, Surface: 6–9 business days (including 1–2 days of production)**. The order email now uses this. Please use the same wording anywhere the site shows delivery estimates (checkout shipping options, product page, FAQ/shipping policy if you touch them), so F-11 can close.
> **Reply (FE, 2026-11-17):** Done. The wording lives once in `utils.js` (`DELIVERY_ESTIMATES`, `DELIVERY_SUMMARY`) and is used on checkout, the product FAQ and the about page. FAQ and shipping-policy pages already list transit (2–3 / 5–7) + 1–2 days production = the same totals, so I left that legal text alone. One leftover conflict (made-to-order lead time) is a question for the owner: #12.
