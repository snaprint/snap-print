# API Contract

The single source of truth for every server endpoint. **BE owns this file**; FE writes only in "Requests from FE".
Full implementation detail lives in `BACKEND_CONTEXT.md`. This file is the agreement: request shape, response shape, errors.

**Status values:** `planned` → `in progress` → `live on preview` → `live` (on main).
FE may mock a `planned` endpoint but must not ship UI depending on it before `live on preview`.

### Conventions (all `/api/*`)
- JSON in/out unless noted. CORS + `nosniff` + `X-Frame-Options: DENY` added by `_middleware.js`.
- **Error shape:** `{ "error": true, "message": "Human-readable text" }` with a 4xx/5xx status. FE shows `message` to users.
- Prices are always computed server-side; the client never sends prices.

---

## Live endpoints

### `POST /api/create-order` · status: `live`
Request:
```json
{ "items": [{ "id": "TOY-001", "quantity": 2 }],
  "shippingMethod": "surface",
  "buyer": { "uid": "", "email": "", "fullName": "", "phone": "", "address": "", "apartment": "", "city": "", "state": "MH", "pincode": "400001" } }
```
Required: `items[]`, `shippingMethod` (must match a `method` in the shipping sheet), `buyer.email/fullName/phone/pincode`.
200: `{ "order_id": "order_xxx", "amount": 49900, "currency": "INR", "key_id": "rzp_..." }` (amount in paise).
400s: no items, missing buyer info, invalid shipping method, product not found/inactive, engineering item, out of stock / only N available, invalid total. 500: CSV fetch, Razorpay, config.

**Quantity rules (B-2, live on preview 2026-11-17, not yet on main):**
- Each `items[].quantity` must be a whole number from **1 to 100** (a number, or a string of digits). Anything else → 400 `Invalid quantity for <id>: must be a whole number from 1 to 100`. The server no longer clamps silently.
- Lines with the same `id` are **merged** (quantities summed) before validation against stock and the cap. Merged total > 100 → 400 `You can order at most 100 of <name> (your cart has N)`.
- Missing/blank `id` → 400 `Item N is missing a product id`.
- FE should cap the quantity input at 100 per product (F-6) so users never see these errors in normal use.

**Purchasability (B-10, live on preview 2026-11-17):** the server applies `getPurchasability()` from `shared/products.js`. New 400: `<name> is currently unavailable` (price blank/0 in the sheet). Blank `stock` on a stock-tracked product → `<name> is out of stock`. Category/yes-no checks are case-insensitive.

**Length rules (B-3, live on preview 2026-11-17):** each buyer value must be ≤256 characters, where "address" means `address` + `", "` + `apartment` combined. Too long → 400 `<Field> is too long (maximum 256 characters)` (fields: Full name, Email, Phone, Address (including apartment), City, State, PIN code). `buyer.uid` > 128 chars → 400 `Invalid account id`.
**Cart size:** a cart with too many *different* products to fit Razorpay's notes (about 25 with long ids, more with short ones) → 400 `This order has too many different products. Please split it into two orders.`

### `POST /api/webhook` · status: `live`
Razorpay only (`X-Razorpay-Signature`). Not called by FE.

### `POST /api/quote` · status: `live`
`multipart/form-data`: `name, email, phone, material, notes?, file` (`.stl/.step/.stp`, ≤25 MB).
200: `{ "success": true, "message": "Quote request submitted" }`.
**Errors (B-9, live on preview 2026-11-17):** 502 if the seller email could not be sent (nothing was received; user should retry), 503 if email isn't configured on the server. Both use the standard error shape with a user-facing `message`. A failed *confirmation* email to the user still returns 200.
**Turnstile (B-6, code live on preview, enforcement OFF until the owner sets `TURNSTILE_SECRET_KEY`):** send the widget token as form field `turnstileToken` (the widget's auto-injected `cf-turnstile-response` field is also accepted). When enforcement is on: missing/invalid token → 403 `Please complete the security check and try again.`; Cloudflare unreachable → 503. Tokens are single-use: get a fresh one (`turnstile.reset()`) after any error response.

### `POST /api/cancel-order` · status: `live`
```json
{ "orderId": "", "name": "", "email": "", "phone": "", "reason": "",
  "screenshot": { "data": "<base64, no data: prefix>", "filename": "x.png", "contentType": "image/png" } }
```
Screenshot ≤5 MB, png/jpeg/webp. 200: `{ "success": true, "message": "..." }`.
**Errors (B-9, live on preview):** 502 if the seller email failed (retry), 500 if email isn't configured.
**Turnstile (B-6, same switch as quote):** add `"turnstileToken": "<widget token>"` to the JSON body. Same 403/503 behaviour as quote.

### `POST /api/seller-login` · status: `live`
`{ "username": "", "password": "" }` → 200 `{ "success": true, "token": "<payload>.<sig>", "username": "" }`; 401 invalid credentials. Token lasts 4 h; FE stores it in `sessionStorage.seller_token`. (B-7: when the owner sets `SELLER_TOKEN_SECRET`, tokens issued before that return 401 on `send-shipment` once; FE's existing 401 → login redirect handles it. Request/response shapes unchanged.) Token payload is base64 JSON `{ sub, exp, iat }` (FE may decode `exp`, never trust it for auth).

### `POST /api/send-shipment` · status: `live`
```json
{ "token": "", "buyerName": "", "buyerEmail": "", "orderId": "", "shipmentPartner": "",
  "trackingLink": "", "items": [{ "name": "", "quantity": 1 }] }
```
`orderId`, `trackingLink`, `items` optional. 200 `{ "success": true, "message": "..." }`; 401 expired/invalid token (FE: clear token, go to login).

### `GET /sitemap.xml` · status: `live`
Not called by FE. BE must add any new public FE page (FE: send a message when you add one).

---

## Planned endpoints

### `POST /api/track-order` · status: `planned` · task B-14 (unblocks F-1)
Draft (BE may revise before implementing):
```json
{ "email": "buyer@example.com", "mobile": "9876543210" }
```
200: `{ "found": true, "orders": [{ "orderId": "", "status": "processing|in_transit|delivered", "trackingLink": "", "customerFirstName": "" }] }`; or `{ "found": false }`.
For the account page: also accepts `Authorization: Bearer <Firebase ID token>` with body `{ "orderIds": [] }` and returns the same `orders` shape for the signed-in user's orders only. Never returns other customers' email/phone.

---

## Requests from FE

_FE: add needs here (new endpoint, field, error code). BE answers inline and moves accepted items into "Planned"._

---

## Changelog
- 2026-11-17: initial contract documenting existing endpoints; `track-order` planned.
- 2026-11-17 (BE, B-7): no shape change; seller tokens may be signed with a new secret (one-time 401 for logged-in sellers).
- 2026-11-17 (BE, B-6): `quote` and `cancel-order` accept `turnstileToken`; enforced (403 without a valid token) only once `TURNSTILE_SECRET_KEY` is set.
- 2026-11-17 (BE, B-9): `quote` and `cancel-order` return 502 when the seller email fails (was 200); `quote` returns 503 when email is not configured (was 200).
- 2026-11-17 (BE, B-10): `create-order` uses the shared purchasability rule (`shared/products.js`); new 400 "currently unavailable" for price ≤ 0.
- 2026-11-17 (BE, B-3): `create-order` adds 400s for over-long buyer fields and for carts with too many different products.
- 2026-11-17 (BE, B-2): `create-order` rejects quantities that are not whole numbers 1–100 (per product, after merging duplicate ids) with 400 instead of clamping.
