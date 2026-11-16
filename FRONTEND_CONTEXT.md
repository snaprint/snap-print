# Snap Print — Frontend Context

> Context file for anyone (human or AI agent) changing client-side code.
> Covers `src/` (Vite multi-page app), `public/`, client data flow, auth, and known problems.
> Companion file: [BACKEND_CONTEXT.md](BACKEND_CONTEXT.md).
> Snapshot of `main` @ `ca8c395` (Nov 2026).

---

## 1. Stack at a glance

| Concern | Technology |
|---|---|
| Build | Vite 6, `root: 'src'`, `publicDir: '../public'`, `outDir: '../dist'` |
| Pages | 18 plain HTML entry points (MPA), listed in `vite.config.js` `rollupOptions.input` |
| JS | Vanilla ES modules, no framework. One script per page plus shared `main.js` / `utils.js` |
| CSS | 3 hand-written files, design tokens in CSS custom properties ("Warm Linen" beige theme), Inter from Google Fonts |
| Runtime deps | `firebase` (Auth + Firestore, split into its own `firebase` chunk), `papaparse` (CSV) |
| Third-party scripts | Razorpay Checkout (`checkout.html` only), Instagram `embed.js` (product page, on demand) |
| Data source | Google Sheets published as CSV, fetched directly from the browser |
| State | `localStorage` (cart, login flag), `sessionStorage` (seller token), Firestore (buyer profile/addresses/orders) |

**Adding a page:** create `src/<name>.html`, add it to `rollupOptions.input` in [vite.config.js](vite.config.js), copy navbar + footer markup from an existing page (they are duplicated per page, there are no includes), and add it to `STATIC_PAGES` in `functions/sitemap.xml.js` if it should be indexed.

---

## 2. File map

```
src/
├── index.html            Home: hero carousel, category tiles, catalog with search/sort/filters, trust badges
├── product.html          Product detail (?id=)
├── cart.html             Cart
├── checkout.html         Auth gate → address/shipping form → Razorpay      (loads Razorpay SDK)
├── thank-you.html        Post-payment (?order=); inline script shows order id
├── account.html          Auth gate → profile, addresses (max 16), order history
├── quote.html            Custom-part quote form (STL/STEP upload)
├── track-order.html      Email + mobile lookup → tracking link
├── cancel-order.html     Cancellation request form (screenshot upload)
├── seller-login.html     Seller login (noindex; no navbar/footer, no pages.css)
├── seller-dashboard.html Send "shipped" email (noindex)
├── about.html, faq.html  (both have an inline FAQ-accordion script)
├── contact.html
├── refund-policy.html, shipping-policy.html, terms.html, privacy-policy.html
├── css/
│   ├── index.css         tokens (:root), reset, typography, layout utilities, animations
│   ├── components.css    navbar, buttons, product card, badges, forms, toasts, hamster loader, footer, filter drawer…
│   └── pages.css         per-page sections: hero, product detail, lightbox, bulk table, cart, checkout, auth gate, account…
└── js/
    ├── utils.js          shared: cart, currency, bulk pricing, toast, CONFIG, fetchCSV, product cache, loaders, PIN lookup, sample data
    ├── main.js           runs on every public page: navbar, injected search, Shop dropdown, footer category links, scroll animations
    ├── firebase.js       Firebase init + Auth helpers + Firestore CRUD (only imported by checkout.js & account.js)
    ├── catalog.js        index.html
    ├── product-detail.js product.html
    ├── cart.js           cart.html
    ├── checkout.js       checkout.html
    ├── account.js        account.html
    ├── quote.js          quote.html
    ├── track-order.js    track-order.html
    ├── cancel-order.js   cancel-order.html (self-contained, no utils import)
    ├── seller-login.js   seller-login.html (self-contained)
    └── seller-dashboard.js seller-dashboard.html
public/
├── favicon.svg, robots.txt, svg_files/track_order.svg
└── images/products/ (≈130 tracked files), images/hero_images/
policy_pages/*.md         source text for the policy HTML pages (not built)
```

Seller pages, `cancel-order.html`, `track-order.html` and `index.html` each also have an inline `<style>` block.

---

## 3. Configuration (`CONFIG` in [utils.js:214](src/js/utils.js#L214))

All values are inlined at **build time** from `VITE_*` env vars, so they are public in the shipped bundle.

| CONFIG key | Env var | Used by |
|---|---|---|
| `PRODUCTS_CSV_URL` | `VITE_PRODUCTS_CSV_URL` | catalog, main, product, cart, seller-dashboard |
| `SHIPPING_RATES_CSV_URL` | `VITE_SHIPPING_RATES_CSV_URL` | checkout |
| `HERO_IMAGES_CSV_URL` | `VITE_HERO_IMAGES_CSV_URL` | catalog (hero carousel; column B = URL) |
| `ORDER_TRACKING_CSV_URL` | `VITE_ORDER_TRACKING_CSV_URL` | track-order, account (see **F-1**) |
| `RAZORPAY_KEY_ID` | `VITE_RAZORPAY_KEY_ID` | checkout fallback (server returns `key_id`) |
| `API_BASE` | `'/api'` | checkout, quote |

Firebase config: `VITE_FIREBASE_API_KEY, _AUTH_DOMAIN, _PROJECT_ID, _STORAGE_BUCKET, _MESSAGING_SENDER_ID, _APP_ID` (public identifiers by design).

If `PRODUCTS_CSV_URL` is empty, catalog and product pages fall back to `getSampleProducts()` (Unsplash demo data). If the shipping CSV fails, checkout falls back to `getSampleShippingRates()` and shows a toast.

---

## 4. Shared modules

### `utils.js`
- **Cart** (`localStorage['snaprint_cart']`): items are `{id, name, price, actual_price, weight_g, image, material, bulk_pricing, max_quantity, quantity}`. `setCart` updates `.cart-badge` elements and dispatches a `cart-updated` window event. `main.js` listens to `storage` for cross-tab badge sync.
- **Pricing / purchasability:** come from **`shared/products.js`** (BE-owned, imported as `../../shared/products.js`; never edit it, never copy it). `getCartSubtotal` applies bulk tiers. `getDiscountPercent(price, actual_price)`.
- **Cart caps:** `addToCart(product, qty)` applies `getPurchasability` and caps the combined quantity; `updateQuantity` clamps to `getItemMaxQuantity(item)`; `cartFieldsFromProduct` builds a line from a sheet row; `unavailableLabel(reason)` gives "Sold Out" / "Currently unavailable" / …
- **Data:** `fetchCSV(url)` uses PapaParse with header trim/BOM strip and value trim, plus a cache-buster `?_t=` and `cache: 'no-store'`. `fetchActiveProducts()` is a module-level memoised promise of active rows (shared `isActive`), used by **every** page that needs products (F-15). Don't call `fetchCSV(PRODUCTS_CSV_URL)` directly. `normalizeProduct` maps legacy `compare_price` → `actual_price`. `resolveImageUrl` converts GitHub `blob` URLs to `raw.githubusercontent.com`.
- **UI:** `showToast(msg, type, ms)` (innerHTML), `renderSkeletons` (hamster loader in a grid), `showPageLoader/hidePageLoader` (full-screen overlay), `debounce`.
- **Validation:** `isValidEmail`, `isValidPhone` (Indian 10-digit starting 6–9, strips +91).
- **`lookupPIN(pin)`**: PIN prefix → state code, `null` when unknown or shared by two states (F-10).

### `main.js` (every public page)
Mobile menu toggle on `.navbar__hamburger` / `.navbar__mobile-menu`; active-link highlighting; `[data-copy-email]` copy buttons; **injects** a search icon + slide-down search panel and a mobile search box (Enter → `/?q=` or filters in place on home); wraps the "Shop" link in a category dropdown built from product categories; fills `#footer-shop-links` with category links; `.scroll-animate` IntersectionObserver; if `localStorage.snaprint_logged_in` is set, rewrites Track Order links to `/account.html#orders`.

### `firebase.js`
Initialises app/auth/db, `browserLocalPersistence`. Auth: `signInWithGoogle` (popup), `signUpWithEmail` (+ fire-and-forget verification mail; unverified users can still check out), `signInWithEmail`, `resetPassword`, `signOutUser`, `onAuthChange` (also sets/clears `snaprint_logged_in`), `getCurrentUser`.

Firestore model:
```
buyers/{uid}            { name, phone, email, addresses: [Address], updatedAt }
buyers/{uid}/orders/{razorpayOrderId}
                        { orderId, paymentId, items:[{id,name,quantity,price,image}],
                          subtotal, shippingCost, shippingMethod, total, buyerEmail, status:'paid', createdAt }
Address = { id:'addr_xxxxxxxx', label, name, phone, address, apartment, city, state(2-letter code), pincode, isDefault }
```
Address CRUD (`add/update/delete/setDefault`) is read-modify-write of the whole array with `{merge:true}`. Old flat profiles (`address`, `city`… at top level) are auto-migrated into `addresses[]` on read. **All helpers throw on Firestore errors; callers must catch** (F-4). `addBuyerAddress` returns `null` only when the 16-address limit is reached. Firestore security rules are configured manually in the Firebase console and are **not versioned in this repo**.

---

## 5. Page flows

### Home / catalog (`catalog.js`)
Loads active products → builds category tiles (first product image per category) and material chips (only if ≥ 2 materials) → restores state from URL (`category, q, sort, price_min, price_max, in_stock=1, material`) → filter → sort → render, then writes state back with `history.replaceState`. Default sort is a **random order chosen once per page load** (F-13). Engineering products link to `/quote.html` and show "Get a Quote". Hero carousel from the hero CSV, autoplay every 4.5 s.

### Product (`product-detail.js`)
`?id=` → shared product cache → redirects engineering items to the quote page. Gallery with thumbs, prev/next, fullscreen lightbox (keyboard nav), Web Share / clipboard. Quantity selector updates the price and highlights the active bulk-pricing tier. Add to Cart / Buy It Now (adds and goes to checkout). Static FAQ, related products (same category, up to 4), Instagram embeds from `instagram_url`.

### Cart (`cart.js`)
Renders instantly from localStorage, then refreshes every line from the sheet (F-8), flags unbuyable lines and blocks checkout until they are removed. ± (capped, F-6) and remove controls. Shipping shows "Calculated at checkout".

### Checkout (`checkout.js`)
1. Empty cart → redirect to cart. Render order summary.
2. `onAuthChange`: logged out → login gate (Google / email signup / login / forgot password); logged in → form. Email comes from the Firebase user (read-only).
3. Prefill name/phone from profile; if there are saved addresses, show the address picker (selecting one fills **and disables** the fields; "+ Add New Address" clears them).
4. Shipping selector (hard-coded `surface` / `air` radios), free-shipping progress bars from the sheet `item_total` threshold, PIN → state auto-fill, blur validation.
5. Pay → `POST /api/create-order` with `{items:[{id,quantity}], shippingMethod, buyer}` → Razorpay modal with server `order_id`/`amount`/`key_id`.
6. Razorpay `handler`: profile save, new address save (if not a saved one), order doc save, **awaited** (max 4 s) → `clearCart()` → redirect `/thank-you.html?order=<id>`. Payment signature is **not** verified client-side; the webhook is the source of truth (and sends the emails).

### Account (`account.js`)
Same auth gate (code duplicated from checkout). Profile view/edit (name, phone), address cards (add / edit / delete / set default, counter `n/16`), and orders from `buyers/{uid}/orders` (newest first) merged with the tracking CSV by `order_id`. Status priority: sheet `order_status` → default "Processing". "Track Order →" is enabled only when status is `in_transit` and there is a `tracking_link`. `#orders` hash scrolls to orders.

### Track order (`track-order.js`)
Downloads the **entire** tracking CSV in the browser, normalises email + mobile (strips +91/0091/0), finds a row where both match, and opens its `tracking_link`. Same generic error for "no match" and "link not ready".

### Quote (`quote.js`) / Cancel (`cancel-order.js`)
Client validation, then `FormData` POST to `/api/quote` (≤ 10 MB, STL/STEP/STP), or JSON with a base64 screenshot (≤ 5 MB, png/jpg/webp) to `/api/cancel-order`.

### Seller (`seller-login.js`, `seller-dashboard.js`)
Login → token in `sessionStorage` (`seller_token`, `seller_username`). The dashboard guard only checks that the token exists. Form: buyer name/email, optional order id, partner select (or "Other…"), optional tracking link, items picked via product autocomplete (keyboard nav, chips with qty) → `/api/send-shipment`. A 401 response clears the token and redirects to login.

---

## 6. Conventions & gotchas

- **Only `checkout.js` and `account.js` may import `firebase.js`.** It is about 170 KB; other pages read `localStorage.snaprint_logged_in`.
- Navbar/footer HTML is copy-pasted in every page. Change it in all 16 public pages. `main.js` finds the Shop link by its exact text `"Shop"`.
- Category names are lower-cased everywhere for comparison; the display label is first-letter-capitalised.
- State is stored as a 2-letter code; the code→name map is duplicated in `checkout.js` and `account.js`, and the `<select>` options are duplicated in `checkout.html` and `account.html`.
- Engineering category = quote-only; never purchasable.
- All prices shown client-side are previews. The server recomputes everything (`create-order`).
- `npm run dev` has no `/api`. Use `npm run dev:full` (port 8788) to exercise checkout/quote/cancel/seller.

---

## 7. Known problems (frontend)

Severity: 🔴 high · 🟠 medium · 🟡 low.

### 🔴 F-1 Customer PII is publicly downloadable (order-tracking sheet)
`VITE_ORDER_TRACKING_CSV_URL` is compiled into the public JS bundle, and [track-order.js:68](src/js/track-order.js#L68) / [account.js:575](src/js/account.js#L575) download the **whole** sheet (`customer_name, customer_email, mobile, order_id, tracking_link`) to the browser. Anyone can open DevTools, copy the URL, and download every customer's name, email and phone. This is a privacy/DPDP-Act exposure and contradicts the privacy policy.
**Fix:** unpublish the sheet; add a server function (e.g. `POST /api/track-order`) that reads the sheet with a non-public URL or service account and returns only the matching row's status and link. For the account page, filter by the authenticated user's order ids server-side (verify the Firebase ID token).

### 🔴 F-2 "Dev mode" fallbacks fake success in production — ✅ fixed 2026-11-17
**Fixed:** the fallbacks are gone (not just hidden behind `DEV`). `src/js/helpers.js` has `apiFetch` (network failure → "Could not reach Snap Print…") and `readApiError` (server `message`, with a fallback for non-JSON pages). Checkout keeps the cart; quote and cancel-order keep every field and the file, and show success only on 2xx. For local work use `npm run dev:full`; `npm run dev` has no `/api` and now shows the network error.

[checkout.js:690](src/js/checkout.js#L690): any `TypeError` mentioning "fetch" (offline, DNS failure, connection reset, ad-blocker) **clears the cart and redirects to the thank-you page with `DEV-<timestamp>`**, so a real customer believes an unpaid order was placed. [quote.js:190](src/js/quote.js#L190) likewise shows "Quote request submitted successfully!" when the request never reached the server.
**Fix:** wrap both in `if (import.meta.env.DEV)`; in production show an error toast and keep the cart.

### 🔴 F-3 Post-payment Firestore writes can be lost; order record is client-authored — 🟡 first half fixed 2026-11-17 (F-3a); removal of the client write waits for B-16 (F-3b)
**F-3a done:** the handler shows "Payment received. Saving your order…", awaits `Promise.allSettled` of the three writes (capped at 4 s, `POST_PAYMENT_SAVE_TIMEOUT_MS`), then redirects. The order doc stores the **bulk unit price** per item and `total` = the amount Razorpay charged (`amount/100`, computed by the server); `shippingCost` = total − subtotal. Still client-authored and `status: paid` without signature check until B-16.
In the Razorpay `handler` ([checkout.js:740-786](src/js/checkout.js#L740-L786)) three writes are fired without `await`, then the page navigates away immediately ([checkout.js:786](src/js/checkout.js#L786)). In-flight Firestore writes are aborted on navigation, so orders can be missing from **My Account**. The record also uses `price: item.price` (base price, not the bulk price actually charged, [checkout.js:774](src/js/checkout.js#L774)), a client-computed subtotal/total, and `status: 'paid'` without verifying `razorpay_signature`.
**Fix:** `await Promise.allSettled([...])` (with a ~3 s timeout) before redirecting. Better: have the webhook write the order with the Firebase Admin REST API, so the record is server-authored and always present. Commit the Firestore rules (`firestore.rules`) and make `orders` read-only for clients.

### 🟠 F-4 Firestore helpers swallow errors → false "saved!" toasts — ✅ fixed 2026-11-17
**Fixed:** all helpers in `firebase.js` now throw (reads too). This also closes a data-loss path: a failed profile read used to look like "no addresses", and the next address save would have overwritten every saved address. `account.js` shows an error toast and keeps the form open on failure; a failed read shows "could not be loaded" instead of "No orders yet"/an empty list; a failed *reload after a successful save* says "Saved, but…".
Every helper in `firebase.js` catches and only `console.warn`s (e.g. [firebase.js:194](src/js/firebase.js#L194), [:321](src/js/firebase.js#L321)). So `account.js` always shows "Profile updated!" ([account.js:290](src/js/account.js#L290)), "Address saved!", or "Address deleted." even when the write failed, and the `.catch()` handlers in `checkout.js` are dead code.
**Fix:** let helpers re-throw (or return `{ok:false}`) and handle the result in callers.

### 🟠 F-5 Mobile menu is broken on the Track Order page — ✅ fixed 2026-11-17 (duplicate handler removed; tested on a 390 px viewport)
The same button is toggled twice per click, once in [main.js:29](src/js/main.js#L29) (`.navbar__hamburger`) and once in [track-order.js:176](src/js/track-order.js#L176) (`#hamburger`), so the menu opens and closes instantly.
**Fix:** delete the hamburger block in `track-order.js` (lines 172-181).

### 🟠 F-6 No quantity limits in the UI — ✅ fixed 2026-11-17 (with F-7)
Product page ([product-detail.js:450](src/js/product-detail.js#L450)), cart ([cart.js:174](src/js/cart.js#L174)) and `addToCart` have no maximum and ignore `stock`. The server silently clamps to 100 (BACKEND B-2) and rejects quantities above stock only at the payment step, after login and address entry.
**Fix:** cap at `min(stock, 100)` for stocked items (100 for made-to-order/bulk), and disable "+" at the cap.

### 🟠 F-7 Stock semantics differ between catalog, product page and server — ✅ fixed 2026-11-17
**Fixed (F-6 + F-7):** the UI imports `getPurchasability`, `MAX_QTY_PER_PRODUCT`, `parseBulkPricing`, `getBulkPrice` (and `isEngineering`, `isMadeToOrder`, `tracksStock`, `availableStock`) from `shared/products.js`; the copies in `utils.js` are deleted. Blank stock on a stock-tracked product → "Sold Out"; price blank/0 → "Currently unavailable" (no ₹0, no Add to Cart); category checks are case-insensitive. The product-page selector stops at `maxQuantity` (shows "Max N per order"); `addToCart` caps the **combined** quantity and returns `false` when nothing could be added (Buy It Now only navigates on `true`); cart lines store `max_quantity`, refreshed from the sheet, and "+" is disabled at the cap; a line above the cap is clamped with a toast. Vite builds and serves the import from outside `src/` with default settings (dev server `fs.allow` defaults to the project root).
For a product with a blank `stock` cell and `made_to_order != yes`:
- catalog `isBuyable` ([catalog.js:39](src/js/catalog.js#L39)) → **Sold Out**
- product page ([product-detail.js:113](src/js/product-detail.js#L113)) → **purchasable**
- server → **out of stock** (unless it has bulk pricing)

The engineering check is also case-sensitive on the product page ([product-detail.js:31](src/js/product-detail.js#L31)).
**Fix:** one shared `isPurchasable(product)` in `utils.js` matching the server rules.

### 🟠 F-8 Cart shows stale prices and dead products — ✅ fixed 2026-11-17
**Fixed:** on load the cart refreshes every line from the shared product cache (`cartFieldsFromProduct`: name, price, compare price, image, material, bulk tiers, cap) and toasts when prices changed. Lines that are inactive / sold out / unpriced stay visible with a badge ("No longer available", "Sold Out", "Currently unavailable") and "Please remove this item"; "Proceed to Checkout" is disabled until they're removed. If the sheet can't be loaded, the stored cart is shown unchanged (the server still re-checks at payment).
Cart items store `price`, `name` and `image` at add-time. Only `bulk_pricing` is refreshed ([cart.js](src/js/cart.js)), so price changes in the sheet aren't reflected and deactivated products stay in the cart until `create-order` rejects them.
**Fix:** during the refresh, also update `price`/`actual_price`/`name`/`image`, and flag or remove items missing from the active list.

### 🟡 F-9 Shipping methods hard-coded in the UI
`checkout.html` has fixed `surface`/`air` radios; [checkout.js:31](src/js/checkout.js#L31) and [:476](src/js/checkout.js#L476) assume those names, while the server accepts whatever is in the sheet. Renaming or adding a method in the sheet breaks checkout. Render the options from the shipping CSV instead.

### 🟡 F-10 PIN → state auto-fill is wrong for several regions — ✅ fixed 2026-11-17
**Fixed:** `lookupPIN` uses 2-digit defaults plus 3-digit (and a few 5/6-digit) overrides: Goa 403, Ladakh 194, Uttarakhand 248/249/263, Sikkim 737, Andaman 744, the North-East 790–799 by state, Jharkhand 814–816/822/825–835, Lakshadweep 68255, Mahe 673310/1. Prefixes shared by two states (160, 244, 246, 247, 262, 362, 396, 533, 605, 609, 813) and Army Postal 90–99 return `null` (no guess). Checkout fills the state only when it's empty or was filled by us, and clears its own guess if the PIN changes to an unknown one. Unit-tested on 52 real PIN codes; the checkout form behaviour (needs login) is not browser-tested.
`PIN_STATE_MAP` ([utils.js:474](src/js/utils.js#L474)) maps all `79xxxx` to Arunachal (it also covers Meghalaya, Manipur, Mizoram, Nagaland, Tripura), maps `90/91/93` to Manipur/Mizoram/Nagaland (these prefixes are Army Postal Service), maps Goa `403` to Maharashtra, Jharkhand `81–83` to Bihar, Uttarakhand `24x/26x` to Uttar Pradesh, and Sikkim `737` to West Bengal. Because it silently overwrites the state select, buyers can submit a wrong state.
**Fix:** use 3-digit prefixes, or an India Post pincode API, and only auto-fill when the state field is empty.

### 🟡 F-11 Inconsistent delivery-time copy
- About page and product FAQ ([product-detail.js:239](src/js/product-detail.js#L239)): "Normal 7–10 / Speed 3–5 days"
- `shipping-policy.html`: "Surface 5–7 / Air 2–3"
- Order email: "Surface 5–10 / Air 3–5"

Pick one source of truth (ideally the shipping sheet's `field_content`).
**✅ Fixed 2026-11-17** with the owner-approved wording "Air: 3–5 business days, Surface: 6–9 business days (including 1–2 days of production)", defined once in `utils.js` (`DELIVERY_ESTIMATES`, `DELIVERY_PRODUCTION_NOTE`, `DELIVERY_SUMMARY`) and used by checkout, the product FAQ and about. **Open:** made-to-order "Lead Time / Ships in 5–7 days" on the product page vs "1–2 days production" in the policy (owner question, MESSAGES #12 / O-15).

### 🟡 F-12 Unescaped HTML interpolation — ✅ fixed 2026-11-17
**Fixed:** one `escapeHtml` in `src/js/helpers.js` (escapes `& < > " '`), used for every sheet / cart / Firestore value in templates in catalog, product, cart, checkout, account, main and seller-dashboard (its private copy is deleted). `showToast` sets the message with `textContent`. Product ids and categories in links use `encodeURIComponent`; account tracking links only allow http(s); Instagram embeds only use parsed instagram.com permalinks; the category-tile `onerror` no longer builds HTML from the label. Tested with a sheet row containing `<img onerror>` and quotes: nothing executes, the text shows literally. **Rule for new code:** never put a data value into `innerHTML` without `escapeHtml`.
Sheet fields (`name`, `description`, `material`, `category`, image URLs), localStorage cart items, and Firestore address/profile fields are inserted with `innerHTML` across `catalog.js`, `product-detail.js`, `cart.js`, `checkout.js`, `account.js` and `main.js`; `showToast` also uses `innerHTML` ([utils.js:196](src/js/utils.js#L196)). The sheet is trusted, but a stray `<` or `"` breaks markup, and a compromised sheet becomes stored XSS on every page. `seller-dashboard.js` already has a proper `escapeHtml`; move it to `utils.js` and use it.

### 🟡 F-13 Catalog reshuffles on every interaction — ✅ fixed 2026-11-17 (shuffled once after load; default sort keeps that order; a reload reshuffles)
With default sort, `sortProducts` runs Fisher-Yates ([catalog.js:217](src/js/catalog.js#L217)) on every filter change and every debounced search keystroke, so the grid order jumps. Shuffle once after load and keep that order.

### 🟡 F-14 Page inconsistencies
- `account.html` links `/favicon.ico` ([account.html:8](src/account.html#L8)); only `favicon.svg` exists, so it 404s.
- `account.html` footer differs from other pages and lacks `#footer-shop-links`, so no category links appear.
- Only `index.html` and `account.html` have the Track Order nav link.
- `robots.txt` doesn't disallow `/account.html` or `/cancel-order.html`.

### 🟡 F-15 Redundant network work — ✅ fixed 2026-11-17 (client side)
**Fixed:** `fetchActiveProducts()` is the only way pages get products (catalog, product page, cart, main.js nav/footer, seller dashboard): one products-CSV download per page view (tested: 1 on home, product, cart, about; the product page used to make 2). It filters with the shared `isActive`, falls back to sample products only when `VITE_PRODUCTS_CSV_URL` is unset, and doesn't cache a failed download. The `?_t=` cache-buster stays so sheet edits show up immediately. **Still open (BE idea):** serve the CSVs through a cached Pages Function to avoid hitting Google Sheets on every page view.
`fetchCSV` cache-busts every call, so each page view hits Google Sheets directly (published CSVs can lag ~5 min and rate-limit under load). The product page fetches the products CSV twice (its own `fetchCSV` + `main.js`'s `fetchActiveProducts`). Use `fetchActiveProducts()` in `product-detail.js`; consider serving the CSVs through a cached Pages Function.

### 🟡 F-16 Dead / duplicated code
- `#address-suggestions` ([checkout.html:167](src/checkout.html#L167)) and its CSS ("Address Autocomplete Dropdown" in components.css) are unused.
- `getCartWeight`, `hasBulkPricing` and unused imports (`addToCart`, `showToast`, `fetchCSV` in catalog.js; `clearCart` in product-detail.js).
- Auth-gate code and the state-name map are duplicated between `checkout.js` and `account.js`.

### 🟡 F-17 Deploy bloat from git-ignored images
`public/images/products_png` (~190 MB) and `hero_png` (~11 MB) are git-ignored but live inside `publicDir`, so Vite copies them into `dist/` and `npm run deploy` uploads them. Move source/raw images outside `public/` (e.g. a top-level `assets-src/`).

### 🟡 F-18 Seller dashboard guard
Only checks that a token **exists**. An expired token sends `seller-login` → dashboard → (works until submit) → 401 → login. Decode `exp` client-side and redirect early.

### 🟡 F-19 Repo hygiene
`.gitignore` lists `policy_pages/` but those files are tracked, so the rule has no effect. `.env.example` lacks `VITE_HERO_IMAGES_CSV_URL` / `VITE_ORDER_TRACKING_CSV_URL`. No tests, linter or formatter are configured.

### 🟠 F-21 Local builds ignored `.env` — ✅ fixed 2026-11-17
Found 2026-11-17. Vite reads `.env` from `envDir`, which defaults to `root` (`src/`), but `.env` lives in the project root. So `npm run dev`, `npm run dev:full` and a **local** `npm run deploy` built with no `VITE_*` values: sample (Unsplash) products, no shipping sheet, empty Firebase config. Cloudflare Pages builds were fine (dashboard env vars). **Fixed:** `envDir: __dirname` in `vite.config.js`. Verified the local build now contains the sheet URL and Firebase config.

## 8. Planned work (new IDs)

- **R-1…R-5** Full redesign track (see `agents/TASKS.md`). The owner must approve the design direction (R-1) before building.
- **F-20** Turnstile widget on quote + cancel forms (pairs with BE B-6).

Coordination: see `CLAUDE.md` and `agents/`.
