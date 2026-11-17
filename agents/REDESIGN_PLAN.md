# Front-end redesign plan

**For:** the FRONTEND agent · **Written by:** BACKEND, 2026-11-17 · **Status:** draft, waiting for the owner's brief
**Covers tasks:** R-1 (done, proposal) → R-2 … R-6 in `agents/TASKS.md`

The owner wants a **complete visual redesign** of the site. The owner will brief you separately on *what* the new site should look and feel like. That brief, plus the approved direction from R-1 (O-9), wins over anything in this file about looks.
This file covers **how** to do it safely: order of work, what must not break, and how to prove it works before it reaches customers.

Read this file fully before starting, then read `FRONTEND_CONTEXT.md` §4–§6 and `agents/API_CONTRACT.md` again.

---

## 1. The one-line rule

**Rebuild the look from scratch, carry the logic over.**
New HTML structure, new CSS, new components and new page layouts are all fine. The JavaScript behaviour fixed in F-2 … F-21 (cart caps, purchasability, error handling, escaping, Firestore safety, post-payment saving) is tested and must survive. Move it, rename it, split it, but don't rewrite it from memory. If you do rewrite a function, re-run the checks in §6 that cover it.

No framework change (React, Astro, etc.) unless the owner asks for one in the brief. If they do, stop and write a short proposal first: it changes every risk in §4.

---

## 2. Before you start (gate 0)

Do not change any page until all of these are true:

| # | Condition | Who |
|---|---|---|
| G-1 | Owner has approved a design direction (O-9) **and** given you the brief. Record both in `agents/design/README.md` ("Approved direction" section) | Owner → FE |
| G-2 | Branch decision made (see below) | Owner |
| G-3 | The current `dev` (all B-x and F-x fixes) has been checked by the owner and **promoted to `main`**, so production gets the fixes before the long redesign starts | Owner |
| G-4 | Product-name decision (MESSAGES #16 q3): sheet renamed, or the site prettifies `snake_case` | Owner |

**Branch decision (G-2). Recommended: a `redesign` branch.**
Promotion is `dev` → `main`, fast-forward only. If a half-finished redesign sits on `dev`, **no fix can reach production** until the whole redesign is finished. With a separate branch:
- Work on `redesign`; Cloudflare builds it at its own preview URL (normally `https://redesign.snap-print.pages.dev`; owner confirms the real one).
- Regularly merge `dev` into `redesign` (`git merge dev`, never rebase) so you have BE's latest work.
- When the owner signs off the whole redesign, merge `redesign` into `dev`, verify on the dev preview, then the owner promotes as usual.
- This needs a one-line exception in `CLAUDE.md` §4 ("FE may work on `redesign` for R-3…R-6"). Add it only after the owner says yes, with a WORKLOG note.
- **Owner setup for the branch preview URL** (add to TASKS "Owner actions" if chosen):
  - Firebase console → Authentication → Settings → **Authorized domains**: add the redesign host, or Google sign-in fails there.
  - Turnstile site (O-5): add the redesign host, or the widget fails there.
  - Razorpay test payments work on the redesign URL, but the test webhook points at `dev.snap-print.pages.dev`, so **no order emails** come from payments made there. Emails get tested after the merge to `dev`.

If the owner prefers to stay on `dev`, accept that production is frozen until the redesign ships, and say so in the WORKLOG.

---

## 3. Phases

Each phase ends with a commit, push to the working branch, a WORKLOG entry with "How to verify on preview", and the owner looking at it. Don't start the next phase on top of unreviewed work unless the owner says to continue.

### Phase 1 · R-2 Design tokens for email (short)
Write `agents/DESIGN_TOKENS.md`: colours (hex), fonts and web-safe fallbacks, logo URL (absolute, `https://snaprint.in/...`), button style, border radius. BE uses it for B-18 (email templates; emails can't load your CSS, so give plain values).
Send BE a message when it's ready.

### Phase 2 · R-3 Page shell (navbar, footer, head)
- One source for the navbar, footer and common `<head>` tags (build-time partials, as proposed in R-1, unless the owner chose otherwise).
- Fold in F-14 (favicon, Track Order link everywhere, account footer, robots.txt).
- `main.js` currently finds the Shop link by the exact text `"Shop"` and injects search, the category dropdown and footer category links. With a new shell, give those elements ids/data attributes and update `main.js` to use them.
- Keep the `snaprint_logged_in` behaviour (Track Order → `/account.html#orders` when logged in).
- Pages: 18 entries in `vite.config.js`. Seller pages have no public navbar; keep it that way.

### Phase 3 · R-4 Design system
- New tokens and components (buttons, inputs, cards, badges, toasts, loaders, dialogs, steppers, tables).
- Build a **component gallery** page that is *not* in `rollupOptions.input` (keep it in `agents/design/`, or behind a dev-only entry), so it never deploys.
- Plan to delete the old CSS: either replace `index.css` / `components.css` / `pages.css` page by page, or create new files and remove the old ones in R-6. Don't leave two design systems loaded on the same page in the final result.
- Accessibility baseline (applies to every phase): text contrast ≥ WCAG AA, visible focus rings, 44 px touch targets, every form input has a `<label>`, every image has `alt`, dialogs trap focus and close on Esc, works with `prefers-reduced-motion`.

### Phase 4 · R-5 Pages, lowest risk first
Do one page (or one small group) per commit. Suggested order:

| Step | Pages | Risk | Notes |
|---|---|---|---|
| 4.1 | about, faq, contact, refund-policy, shipping-policy, terms, privacy-policy | low | **Copy the text exactly.** Policy and legal text changes need the owner's approval. Keep the FAQ accordion working |
| 4.2 | index (home / catalog) | medium | Keep every URL parameter (§4.6). Keep the one-time shuffle (F-13) and one product download per page (F-15) |
| 4.3 | product | medium | Quantity cap, bulk tiers, sold-out / unavailable states, Buy It Now only when `addToCart` returns `true`, Instagram embeds, lightbox |
| 4.4 | cart | **high** | §4.3 |
| 4.5 | quote, cancel-order | **high** | §4.4 |
| 4.6 | checkout | **highest** | §4.1, §4.2. Do this alone in its own session if you can |
| 4.7 | account | **high** | §4.2 |
| 4.8 | thank-you | medium | Reads `?order=`; shows the order id |
| 4.9 | track-order | high (privacy) | §4.7: restyle only, or wait for B-14 |
| 4.10 | seller-login, seller-dashboard | medium | §4.8 |

### Phase 5 · R-6 Full regression and launch
- Run the whole checklist in §6 on the preview, desktop and phone.
- Remove the old CSS and any dead code. Check that nothing is unused (`tsc --noUnusedLocals` worked last time).
- Lighthouse on home, product and checkout (mobile): note Performance / Accessibility / SEO scores in the WORKLOG next to the old site's scores.
- Write the owner a launch checklist (what to click on preview before "promote to main") and a rollback note: Cloudflare Pages → Deployments → previous production deployment → **Rollback** restores the old site in seconds.

---

## 4. Risky parts: be careful here

These are the places where a redesign can lose money, lose customer data, or leak it. For each one: what must stay true, and how to check it.

### 4.1 Checkout and payment 🔴
Code: `src/js/checkout.js` (Pay button handler ~line 499, `openRazorpay` ~558, Razorpay `handler` ~586).
Must stay true:
- Pay sends `POST /api/create-order` with **only** `{ items: [{id, quantity}], shippingMethod, buyer }`. Never send prices or totals. The amount the buyer pays is the server's `amount`; show the server's number if it differs from the preview.
- Razorpay opens with the **server's** `order_id`, `amount` and `key_id`. Load the Razorpay script on the checkout page only.
- The Pay button is disabled while a request is in flight and re-enabled on any error. **No double orders:** test double-click and Enter-key.
- On error: show the server `message` (via `readApiError`), **keep the cart and the form**. Never redirect to thank-you without a real payment (F-2).
- In the Razorpay `handler`: show "Payment received. Saving your order…", **await** the three Firestore writes (profile, order, new address) capped at `POST_PAYMENT_SAVE_TIMEOUT_MS` (4 s), **then** `clearCart()`, **then** go to `/thank-you.html?order=<id>`. Don't reorder these. The order record stores the bulk unit price and `total = amount / 100`.
- Modal dismissed (buyer closes Razorpay) → back to the form, cart intact, button enabled.
- Shipping options are rendered from the shipping sheet (F-9); method values are trimmed and lower-cased like the server. Delivery wording comes from `DELIVERY_*` in `utils.js`.
- Fields keep their `maxlength`s (B-3: each buyer value ≤ 256; address + apartment combined ≤ 256).
- PIN → state fill follows F-10 (never overwrite a state the buyer chose).
Check: a full **test-mode payment** on preview (card `4111 1111 1111 1111`) after every checkout change, then confirm the order appears in /account with the right total. Also the error cases in §6.

### 4.2 Customer data in Firestore 🔴
Code: `src/js/firebase.js`, `src/js/auth-gate.js`, `src/js/account.js`.
Real customers already have saved profiles, addresses and orders. A redesign must read and write **exactly the same shape**:
```
buyers/{uid}            { name, phone, email, addresses: [Address], updatedAt }
buyers/{uid}/orders/{razorpayOrderId}
                        { orderId, paymentId, items:[{id,name,quantity,price,image}],
                          subtotal, shippingCost, shippingMethod, total, buyerEmail, status, createdAt }
Address = { id, label, name, phone, address, apartment, city, state (2-letter code), pincode, isDefault }
```
Must stay true:
- No renamed or new fields without a message to BE (B-16 will write orders from the server using this shape).
- Old flat profiles are migrated on read; keep that.
- Helpers **throw**; callers show an error and keep the form open. A failed read must never lead to a save, because an address save is read-modify-write of the whole array, so saving after a failed read wipes the buyer's addresses (F-4).
- Keep `withTimeout` (15 s) on account reads/writes and the "taking too long" message.
- 16-address limit.
- Only `checkout.js` and `account.js` (and `auth-gate.js`) import Firebase (~170 KB). Other pages use `localStorage.snaprint_logged_in`.
Check: with a **test account**, never with a real customer's: add / edit / delete / set-default address; edit profile; Wi-Fi off → error, not "saved"; reload → data unchanged.

### 4.3 Cart 🟠
Code: `src/js/utils.js` (cart helpers), `src/js/cart.js`, `shared/products.js`.
- Keep the storage key `snaprint_cart` and the item shape, so carts that shoppers already have survive the switch.
- Purchasability, caps and bulk pricing come **only** from `shared/products.js` (BE-owned: import it, never edit or copy it).
- `addToCart` caps the **combined** quantity and returns `false` when nothing was added; `+` disabled at the cap.
- On load, lines refresh from the sheet; unavailable lines are flagged and checkout is blocked until they're removed (F-8).
- The cart badge updates across tabs (`cart-updated` event + `storage` listener).

### 4.4 Quote and cancel forms 🟠
- Same endpoints and field names (`API_CONTRACT.md`): quote is `multipart/form-data` (`name, email, phone, material, notes, file`), cancel is JSON with a base64 screenshot.
- Limits shown in the UI and checked before upload: quote ≤ **10 MB**, `.stl/.step/.stp`; screenshot ≤ 5 MB, png/jpeg/webp.
- Turnstile: keep `mountTurnstile(slot, action)`; send `turnstileToken`; **reset the widget after every response** (tokens are single-use). The widget only appears when `VITE_TURNSTILE_SITE_KEY` is set.
- Success only on 2xx. On 4xx/5xx/network error: show the message, keep every field and the chosen file.

### 4.5 Showing sheet data safely 🟠
Every value from the sheet, the cart, Firestore or the URL that goes into `innerHTML` goes through `escapeHtml` (F-12). Prefer `textContent`. Links built from data: `encodeURIComponent` for ids; only `http(s)` URLs in `href`. Re-run the XSS test row (`<img src=x onerror=alert(1)>` and quotes in name/description/category) on every page that shows products.

### 4.6 URLs, SEO and links from outside 🟠
Links already exist in Google, the sitemap, emails, Instagram and customers' bookmarks. **Keep these working:**
- every current `/<page>.html` path; `/product.html?id=<id>`; `/thank-you.html?order=<id>`; `/account.html#orders`;
- home URL parameters `category, q, sort, price_min, price_max, in_stock=1, material` (the navbar search sends `/?q=`);
- `https://snaprint.in/track-order.html` is hard-coded in the "shipped" email.
If the brief wants new URLs (e.g. `/product/<slug>`), that is a separate decision: tell BE first. It needs `public/_redirects` from every old URL, plus BE changes to the sitemap and emails.
Also: each page keeps a unique `<title>` and meta description; add `canonical` and Open Graph tags (only home has OG today); seller pages stay `noindex`; checkout/cart/thank-you stay disallowed in `robots.txt`. New public pages → message BE to add them to the sitemap.

### 4.7 Track order: privacy 🔴
F-1 is still open: the tracking sheet with every customer's name, email and phone is public. **Don't build anything new on top of `VITE_ORDER_TRACKING_CSV_URL`.** Either restyle the page without touching its logic, or wait until `POST /api/track-order` (B-14) is `live on preview` and switch to it (F-1). BE will message you when it is.

### 4.8 Seller pages 🟡
Token in `sessionStorage.seller_token`; it travels in the JSON body; expiry is read for display only (F-18); a 401 clears it and goes to login. Keep `noindex`. Low traffic, but this is how buyers get "shipped" emails, so test one send to your own address.

### 4.9 Build-time settings 🟡
`VITE_*` values are baked in at build time. Sample (Unsplash) products appear **only** when `VITE_PRODUCTS_CSV_URL` is unset; if you see sample data on preview, something is wrong with the build, not the design. Don't add new `VITE_*` variables without listing them in `.env.example` and in TASKS "Owner actions".

### 4.10 Images and performance 🟡
Product images come from sheet URLs (GitHub `blob` → raw, via `resolveImageUrl`). Use `loading="lazy"` below the fold, fixed aspect ratios (no layout jump), `width`/`height` attributes. Max two font families, `font-display: swap`. Don't import Firebase on pages that don't need it. Keep the F-17 Vite plugin.

---

## 5. Things you must not change without asking

- Prices, quantities, caps, stock rules → BE + owner (`shared/products.js`).
- Policy / legal text, delivery times, return rules, the made-to-order lead time (O-15) → owner.
- Any `/api` request or response shape → BE, through `API_CONTRACT.md` "Requests from FE".
- Firestore field names → BE (B-16 depends on them).
- Files under `functions/` or `shared/` → BE only.
- Product data in the sheet → owner (just report suspected typos, as in MESSAGES #16 q4).

---

## 6. Regression checklist (run before each risky commit, and all of it in R-6)

Test locally with `npm run dev:full` (functions + `.dev.vars`) and then on the preview. Viewports: **360, 390, 768, 1280 px**. Browsers: Chrome/Edge; Safari on iPhone if the owner can help (not tested so far). Headless browser scripts like last time are fine; keep them in your scratchpad, not the repo.

**Shopping**
1. Home: tiles, filters, sort, search, price/material filters, URL params survive reload; grid doesn't reshuffle while typing; one products-CSV download.
2. Product: gallery, lightbox (keyboard), share; quantity stops at the cap with "Max N per order"; bulk tier highlights; sold-out / unavailable / engineering (redirects to quote) states.
3. Add to cart twice up to the cap → second time says the maximum is reached. Badge updates in another tab.
4. Cart: `+` disabled at cap; set a product inactive in the sheet → "No longer available", checkout blocked; restore.

**Checkout** (test account, Razorpay test mode)
5. Logged out → sign-in gate (Google, email sign-up, login, forgot password).
6. Saved addresses, new address, PIN → state, shipping options from the sheet, free-shipping bar.
7. Server error (e.g. quantity 101 via DevTools) → message shown, cart kept. Offline → network message, cart kept.
8. Double-click Pay → one order only. Close the Razorpay modal → back, cart kept.
9. Successful test payment → "Saving your order…" → thank-you with the order id → order in /account with the charged total → (on the `dev` preview) buyer + seller emails arrive.

**Account**
10. Profile edit, address add/edit/delete/default, 16-address limit, offline save → error. Orders list newest first.

**Forms**
11. Quote: > 10 MB and wrong type rejected; success path; server 502 → message, inputs kept. With Turnstile on: no token → "complete the security check".
12. Cancel: screenshot > 5 MB / wrong type rejected; success path; error keeps inputs.
13. Seller: login, send a shipment email to yourself, tampered token → login with "session expired".

**Everywhere**
14. XSS test row shows as text on every product surface.
15. Keyboard only: can reach and use navbar, filters, stepper, add to cart, checkout form, dialogs.
16. No console errors; no 404s (favicon, fonts, images).
17. Every old URL in §4.6 still opens the right page.

---

## 7. What BE will do alongside

| BE task | When | Effect on you |
|---|---|---|
| B-14 `/api/track-order` | Before you reach step 4.9 | Unblocks F-1; message when `live on preview` |
| B-18 email restyle | After R-2 | Emails match the new look; nothing for you to change |
| Sitemap updates | When you add/rename public pages | Send a message |
| B-16 server-written orders | Later, owner decides | Then F-3b removes the client order write; until then keep it exactly as is |
| Optional cached `/api/products` | Only if you ask (F-15 follow-up) | Faster pages; same CSV columns |

Need something new from the server (e.g. a field, an endpoint)? Add it to `API_CONTRACT.md` → "Requests from FE" and send a message. Don't work around it in the browser.

---

## 8. FE additions (FRONTEND, 2026-11-17)

Added after reading this plan, based on the owner's brief so far ("modern, minimal, soft, not robotic, no glassmorphism / AI look, fits phones perfectly").

### 8.1 Design principles = review criteria
The owner's look-and-feel brief is recorded in `agents/design/README.md` (to be added with G-1) as a short checklist. Every page review checks it: flat surfaces (no blur, gradients, glows), warm neutrals + one muted accent, hairlines instead of shadows, one radius family, max two font families, plain human copy (no "elevate your space", no emoji bullets, no icon-tile rows), motion limited to quick fades. The current `.scroll-animate` effects in `main.js` go.

### 8.2 Phone-first is a build rule, not a test step
- Base CSS is written for a 360–430 px phone; larger screens are added with `min-width` queries.
- Inputs use 16 px text (iOS zooms otherwise); checkout fields get `autocomplete`, `inputmode` (`numeric` for PIN, `tel` for phone) and `enterkeyhint`.
- Primary action always reachable with a thumb: sticky "Add to cart" bar on product, sticky "Pay" bar on checkout, both with `env(safe-area-inset-bottom)` and never covering the last form field or the Razorpay modal.
- Filters/sort open as a bottom sheet on phones; product gallery is swipeable; horizontal rows scroll inside themselves, never the page (no sideways page scroll at 360 px).
- Nothing works only on hover; hover styles sit inside `@media (hover: hover)`.
- Toasts appear above the sticky bars and the on-screen keyboard.
- Use `dvh` (not `vh`) for full-height panels so mobile browser bars don't cut them.

### 8.3 Testing on phones
- Headless Edge/Chrome won't render a window narrower than ~500 px (`--window-size=390,…` silently lays out wider). Use a device-emulation viewport (puppeteer `setViewport`) or a 390 px iframe for screenshots.
- Owner checks each phase on **their own phone** (Android Chrome and, if possible, an iPhone): this is the "fits perfectly" test no script replaces.
- Razorpay Checkout on a phone (UPI intent / app switch and back) is part of check 9 in §6.

### 8.4 Baseline before starting (add to gate 0)
- G-5: record Lighthouse **mobile** scores (Performance, Accessibility, SEO) and phone screenshots at 390 px for home, product, cart and checkout on the current site, so R-6 has something to compare with.
- Performance budget for R-6: LCP ≤ 2.5 s on Lighthouse mobile for home and product; no layout shift from images or fonts (CLS ≤ 0.1).

### 8.5 Owner review at the design-system stage
Phase 3 ends with the owner opening the component gallery **on a phone** and approving it, before any page is restyled. Changing a token later is cheap; restyling 18 pages twice is not.

### 8.6 Photography (owner)
The biggest "not AI-made" lever is the images, not the CSS. The current hero images (`public/images/hero_images/`) look AI-generated. Real photos of the products in use, the printer and the packing would do more for the brief than any styling. Add as an owner action (O-18) if the owner agrees; the redesign works with the existing images until then.

### 8.7 Out of scope unless the owner asks
Dark mode, new URLs/slugs (§4.6), a framework change (§1), new product data fields.

---

## 9. Session hygiene (reminder of `CLAUDE.md`)

- Set **Active agent** at session start; reset to `none` at the end.
- Commit prefix `[FE] R-x: …`, one page or one concern per commit; `npm run build` before every push.
- Never push or merge to `main`. Never force-push.
- Each WORKLOG entry lists exactly what to click on preview, on phone and desktop.
- When unsure whether something is a design choice or a behaviour change: it's a behaviour change, so ask.
