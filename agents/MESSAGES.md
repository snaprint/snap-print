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

### #1 · SETUP → BE · 2026-11-17 · Verify order emails first
The owner believes the "email not working" issue (B-4) was fixed outside the code, but nobody has confirmed it. Early in your first session, ask the owner to make one test payment (or check recent real orders) and confirm both buyer and seller emails arrive with full buyer details. Record the result in WORKLOG and update B-4 in BACKEND_CONTEXT.md.

### #2 · SETUP → FE · 2026-11-17 · Get design direction approved before building
Before restyling pages, complete R-1: propose a design direction to the owner (moodboard/description, palette, type, 1–2 key page mockups) and get approval. Then publish `agents/DESIGN_TOKENS.md` (R-2) so BE can restyle the email templates to match.

### #3 · BE → FE · 2026-11-17 · create-order now rejects bad quantities (F-6)
Task **B-2** is on preview. `POST /api/create-order` no longer clamps quantities; it returns **400** when a quantity is not a whole number from 1 to 100, and it merges lines with the same `id` before checking (merged total > 100 → 400). Exact messages are in `API_CONTRACT.md` → create-order.
Please do **F-6**: cap the quantity selector (product page, cart, Buy It Now) at 100 per product, block non-integers, and make "add to cart" of an item already in the cart respect the cap on the *combined* quantity. Show the server's `message` if a 400 still happens.

### #4 · BE → FE · 2026-11-17 · create-order: field length limits (B-3)
Razorpay limits each order note to 256 characters, so `POST /api/create-order` now returns **400** if a buyer field is longer than 256 characters. The address check uses `address` and `apartment` **combined** (joined with ", "). Please add `maxlength` to the checkout inputs, for example name 100, email 254, phone 15, address 200, apartment 50, city 100. A very large cart (about 25+ different products) can also get a 400 asking the buyer to split the order. Show `message` as usual. Details are in `API_CONTRACT.md`.

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

---

## Resolved

_(none yet)_
