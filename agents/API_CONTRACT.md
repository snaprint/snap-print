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
⚠️ Pending change **B-2**: quantities >100 / non-integer will return 400 instead of being clamped.

### `POST /api/webhook` · status: `live`
Razorpay only (`X-Razorpay-Signature`). Not called by FE.

### `POST /api/quote` · status: `live`
`multipart/form-data`: `name, email, phone, material, notes?, file` (`.stl/.step/.stp`, ≤25 MB).
200: `{ "success": true, "message": "Quote request submitted" }`.
⚠️ Pending **B-6**: will require a `turnstileToken` field. ⚠️ Pending **B-9**: will return 502 if the seller email fails.

### `POST /api/cancel-order` · status: `live`
```json
{ "orderId": "", "name": "", "email": "", "phone": "", "reason": "",
  "screenshot": { "data": "<base64, no data: prefix>", "filename": "x.png", "contentType": "image/png" } }
```
Screenshot ≤5 MB, png/jpeg/webp. 200: `{ "success": true, "message": "..." }`.
⚠️ Pending **B-6** / **B-9**: same as quote.

### `POST /api/seller-login` · status: `live`
`{ "username": "", "password": "" }` → 200 `{ "success": true, "token": "<payload>.<sig>", "username": "" }`; 401 invalid credentials. Token lasts 4 h; FE stores it in `sessionStorage.seller_token`. Token payload is base64 JSON `{ sub, exp, iat }` (FE may decode `exp`, never trust it for auth).

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
