# Snap Print — 3D Printed Toys & Custom Parts — Website Plan Summary

## Brand & Domain
- **Brand name:** Snap Print
- **Domain:** `snaprint.in` — already purchased via **GoDaddy**
- **Status:** Domain is registered. **DNS still needs to be pointed to Cloudflare before hosting will work** — see "Domain DNS Setup" section below. This is a required setup step, not optional/later.
- **Note:** GoDaddy is used for registration only — no hosting, website builder, or email add-ons should be purchased from GoDaddy. Actual hosting stays on Cloudflare Pages (free tier) as planned below.
- **Checkout add-ons already declined/to decline:** GoDaddy's "domain theft protection" — free transfer lock + WHOIS privacy should be checked/enabled in GoDaddy account settings instead of paying extra.

## Goal
Zero/near-zero recurring cost e-commerce site for selling 3D-printed toys, decor, and custom engineering parts under the **Snap Print** brand. Only recurring cost: domain (`snaprint.in`, purchased via GoDaddy). Everything else runs on free tiers.

---

## Domain DNS Setup — GoDaddy → Cloudflare (do this before Stage 8 / deploy, but can be done any time now)

The domain is bought on GoDaddy, but **hosting, backend functions, email forwarding, and CAPTCHA all live on Cloudflare** — so Cloudflare needs to be put in charge of the domain's DNS. This is a one-time setup, roughly 10 minutes of clicking plus a wait for propagation (can take anywhere from a few minutes up to ~24 hours, though it's usually fast).

**Steps:**
1. Log into Cloudflare (cloudflare.com) → **Add a Site** → type `snaprint.in` → select the **Free plan**.
2. Cloudflare scans existing DNS records and shows a summary — click through/confirm.
3. Cloudflare gives **two nameserver addresses** (they look like `xxx.ns.cloudflare.com` and `yyy.ns.cloudflare.com`). Copy both.
4. Log into **GoDaddy** → go to **My Products → Domains → snaprint.in → DNS / Manage DNS → Nameservers**.
5. Change nameservers from GoDaddy's default to **Custom**, and paste in the two Cloudflare nameservers from step 3. Save.
6. Go back to Cloudflare and click **Done, check nameservers** (or similar) — it will show "Pending" until GoDaddy's change propagates, then flip to "Active."
7. Once Active, all further DNS changes (for the live site, email routing, etc.) happen **inside Cloudflare's dashboard**, not GoDaddy's. GoDaddy remains only the place where the domain is registered/renewed each year.

**Why this matters for the AI agent building the site:** any instructions involving "connect the domain," "set up email routing," or "add DNS records" should be carried out in the **Cloudflare dashboard**, never in GoDaddy — GoDaddy has no further role once nameservers are pointed to Cloudflare.

---

## Hosting Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend (catalog, cart, pages) | **Cloudflare Pages** *(locked in)* | Free tier — unlimited bandwidth, up to 20,000 files, 500 builds/month |
| Backend logic | **Cloudflare Pages Functions** (Workers) | Serverless, free tier (100,000 requests/day) — handles Razorpay webhook + email/sheet logging |
| Domain | **GoDaddy** — `snaprint.in`, registration only | Only real recurring cost (annual renewal). DNS is pointed to Cloudflare — see "Domain DNS Setup" above. All DNS/email/hosting config happens in Cloudflare, not GoDaddy |
| Product catalog & shipping rates | Google Sheets (published to web as CSV) | Parametric — see below. No redeploys for catalog or shipping-rate changes |
| Payments | Razorpay | Handles checkout + is a permanent backup record of every transaction |
| Order log | Google Sheets API (separate sheet, private) | Free, via service account — see below |
| Emails | Resend / Brevo (free tier) | Better deliverability than raw SMTP |
| Product images | GitHub repo (`/public/images/`) or Cloudflare R2 | Google Sheets can only store links, not files |

**No database. No paid server. No cloud storage costs.**

---

## Product Catalog — Parametric via Google Sheets

Decision: catalog is **not** stored as JSON/Markdown in the repo. Instead it's driven live from a **Google Sheet**, so adding/editing/removing products never requires touching code or redeploying.

### Three separate sheets
- **Products Sheet** — public-readable, no personal data. Drives the storefront.
- **Shipping Rates Sheet** — public-readable, no personal data. Drives shipping cost calculation — see "Shipping Cost Logic" section below.
- **Orders Sheet** — private, written to only by the serverless function via the service account (as already planned). Never exposed publicly. Keep all three fully separate.

### How it works
1. Products Sheet and Shipping Rates Sheet are each **published to the web as CSV** (Google Sheets → File → Share → Publish to web → CSV format). This gives a public URL that always reflects current sheet contents — no API key or auth needed to read it.
2. Frontend fetches the Products CSV URL on page load, parses it (e.g. via PapaParse), and renders product cards dynamically from the rows.
3. Adding a row / changing a price / changing a weight / deleting a product / toggling stock → refresh the page, it's live. Zero code changes, zero redeploys for routine catalog or shipping-rate updates.

### Suggested Products Sheet columns
| Column | Example |
|---|---|
| `id` | TOY-001 |
| `name` | Dragon Figurine |
| `category` | toys / decor / engineering |
| `price` | 499 *(selling price; checkout source of truth)* |
| `actual_price` | 699 *(optional original price; shown struck through when higher than `price`)* |
| `weight_g` | 120 *(weight in grams — required for shipping cost calculation, see below)* |
| `stock` | 5 *(or leave blank + use `made_to_order`)* |
| `made_to_order` | yes/no |
| `image_urls` | optional comma-separated image links (hosted on GitHub repo or R2); the first image is used in catalog cards and all images are available on the product page |
| `description` | short text |
| `material` | PLA / Resin etc. |
| `dimensions` | 10x5x5 cm |
| `active` | yes/no — hides a product instantly without deleting the row |

- **Stock display is pure frontend logic**: if `stock <= 0`, "Add to Cart" auto-greys out / shows "Out of Stock." No backend needed.
- **Discount display is frontend-only**: leave `actual_price` blank (or set it equal to/lower than `price`) to hide the crossed-out price and discount badge. It never affects the amount charged.
- **Alternative worth considering**: since items are self-printed, skip stock counts entirely and label items "Made to order — ships in X days." Removes race-condition concerns altogether.
- Race condition (two buyers, one item) accepted as low-risk given low volume; reprintable if it happens.
- Sheet-as-CSV comfortably handles thousands of rows — scale isn't a concern at this stage. Only pagination/lazy-loading would need attention if the catalog grows into the hundreds.

### Known trade-off: SEO
Since the catalog is fetched client-side at runtime (not baked into HTML at build time), it's slightly less optimal for search engine indexing than static pre-rendered pages (though Google's crawler does execute JS). Acceptable trade-off for a store relying more on direct/social links than organic search. Can be improved later with a Cloudflare Pages Function that fetches the sheet server-side and pre-renders — not needed for v1.

### Optional future upgrade (not needed for v1)
A Pages Function that proxies the CSV fetch and caches it for a few minutes — guards against rate-limiting on the publish-to-web endpoint if traffic spikes, and shaves latency. Add only if an actual issue is observed.

## Custom Engineering Parts — Separate Flow

- Should **not** go through a normal add-to-cart flow (can't price without specs).
- Use a **"Request a Quote"** form instead: file upload (STL/STEP), material choice, tolerance/notes, contact info.
- Quotes handled manually, priced individually, then sent a separate payment link if needed.

---

## Shipping Cost Logic

Buyer chooses between two shipping methods at checkout: **Normal** or **Speed**. Cost is a flat fee per order (not per item), determined by the **combined weight of every item in the cart**, and is fetched live from the **Shipping Rates Sheet** — same pattern as Products, so rates can be changed anytime without touching code.

### Rate table (source of truth lives in the Shipping Rates Sheet, not hardcoded)
| Method | Combined weight | Price |
|---|---|---|
| Normal | under 500g | ₹70 |
| Normal | 500g or more | ₹80 |
| Speed | under 500g | ₹120 |
| Speed | 500g or more | ₹150 |

### Suggested Shipping Rates Sheet columns
| Column | Example |
|---|---|
| `method` | normal / speed |
| `weight_tier` | under_500g / 500g_or_more |
| `price` | 70 |

Four rows total (2 methods × 2 weight tiers) cover the full table above. To change any of the four prices later, edit the cell in the Sheet — no redeploy needed.

### Calculation logic (server-side — see tamper-proof note below)
1. Sum `weight_g × quantity` across every item in the cart → `total_weight_g`.
2. Determine weight tier: `total_weight_g < 500` → `under_500g`, else `500g_or_more`.
3. Look up the row in the Shipping Rates Sheet matching the buyer's chosen `method` + the computed `weight_tier` → that's the shipping price.
4. `order_total = subtotal (from Products Sheet prices) + shipping price`.

### Tamper-proof note (ties into Order & Payment Flow below)
The buyer's browser is allowed to send **which method they picked** (`"normal"` or `"speed"`) — that's a legitimate choice, not a price. Everything else must be computed server-side in the serverless function:
- The frontend must **never** send `total_weight_g`, the resolved `weight_tier`, or a shipping ₹ amount — all three are derived server-side from the Products Sheet (`weight_g` per item) and the Shipping Rates Sheet, the same way `subtotal` already is.
- The server must **validate** the `method` value is exactly `"normal"` or `"speed"` and reject/ignore anything else, rather than trusting it blindly.
- This keeps shipping cost governed by the exact same trust chain as the product subtotal: **server computes it from Sheets data → locked into the Razorpay `order_id` → never asserted by the client.**

---

## Order & Payment Flow — Tamper-Proof Design

**Core principle: the browser is never trusted to state a price.** All amount calculation happens server-side (in a Cloudflare Pages Function), and the resulting order is locked on Razorpay's side before the buyer ever sees a checkout screen. This uses Razorpay's **Orders API** (server-side) + **Checkout.js** (frontend) — *not* the no-code dashboard "Payment Button," which is only meant for fixed/preset amounts and has no way to receive a dynamically computed cart total securely.

1. Buyer adds items to cart, chooses a shipping method (**Normal** or **Speed**), enters name/address/phone at checkout.
2. Frontend sends only the **cart contents** (item IDs + quantities) and the **chosen shipping method** to a serverless function — never a total amount, never a weight, never a shipping price.
3. The serverless function is the single source of truth for pricing:
   - Re-fetches current prices + weights from the live Products Sheet CSV (never trusts any price or weight the client sends).
   - Computes `subtotal` from item prices × quantities.
   - Computes `total_weight_g` from item weights × quantities, determines the weight tier, and looks up the matching shipping price from the Shipping Rates Sheet CSV (see "Shipping Cost Logic" above) — never trusts a shipping amount from the client.
   - Calls the **Razorpay Orders API** server-side with `subtotal + shipping` as the computed amount, plus buyer details in the `notes` field — this makes Razorpay itself a permanent backup record of shipping details, not just payment data. This is the key fix against "lost order" risk.
   - Razorpay returns an `order_id` with the amount locked inside it — this is what actually makes the amount tamper-proof, since the ID (not a raw number) is what gets passed to checkout.
4. Frontend opens Razorpay Checkout using that `order_id` (never a raw amount).
5. On successful payment, Razorpay sends a **webhook** to a serverless function. Before trusting it:
   - **Verify the webhook's HMAC signature** using the webhook secret — reject anything unsigned or spoofed outright (see Security section — already a must-have).
   - **Check payment `status` is `captured`**, not just `authorized` — authorized-but-uncaptured payments aren't yet settled and get auto-refunded after a fixed window if capture is missed. Enable auto-capture in Dashboard → Account & Settings → Payment Capture so this happens automatically.
6. Once verified + captured, the function:
   - Sends an email to the seller with full order + buyer details.
   - Appends a row to a **Google Sheet** (order log) via the Sheets API.
   - (Optional) sends a confirmation email to the buyer.
7. Seller manages everything downstream manually (printing, shipping, status updates) from the sheet/email.

### Trust chain summary
`Server computes amount (from Products Sheet)` → `Orders API locks it into an order_id` → `Checkout uses only that order_id, never a raw amount` → `Webhook signature verification confirms the event is genuinely from Razorpay` → `"captured" status confirms money has actually settled, not just been authorized`.
The frontend never gets to assert a price or a payment status at any point in this chain — every trust-sensitive step happens server-side.

### Redundancy against lost data
Three independent copies of every order now exist:
- Razorpay dashboard (`notes` field) — most reliable, always present.
- Google Sheet row — searchable/sortable order log.
- Seller's email inbox — human-readable backup.

---

## Razorpay Account Setup — What to Get, Where It Goes

Use **Standard Checkout (Orders API + Checkout.js)** — not the dashboard's no-code "Payment Button," which only supports fixed/preset amounts, not a dynamic cart total.

### What to get from the Razorpay Dashboard
| Item | Where to find it | Where it's used |
|---|---|---|
| **Key ID + Key Secret** (test mode first, then live mode) | Dashboard → Settings → API Keys → Generate Key | Key ID goes in frontend Checkout.js config (public, safe to expose). Key Secret goes only in the serverless function's environment variables (Cloudflare Pages encrypted env store) — never in frontend code. Used to authenticate Orders API calls. |
| **Webhook Secret** | Dashboard → Settings → Webhooks → Create Webhook → set the URL to your serverless function's webhook endpoint → choose events (at minimum `payment.captured`) → Razorpay shows a secret at creation | Stored as an env variable in the serverless function; used to verify the HMAC signature on every incoming webhook call, so a spoofed "payment successful" request can't be trusted. |
| **Payment Capture setting** | Dashboard → Account & Settings → Payment Capture | Set to auto-capture, so authorized payments settle automatically instead of expiring uncaptured. |

### Account setup timeline — this does NOT block development
- **Test mode requires no approval, no website, no KYC.** Test Key ID/Secret can be generated immediately after signup and used against `localhost` or a Cloudflare Pages preview URL. Build and fully test the entire flow (Orders API, Checkout popup, webhook, signature verification, capture check) in test mode first.
- **Live mode requires two separate things**, neither of which blocks building:
  1. **Website details** — Razorpay requires the live website URL to generate Live Mode API keys (Dashboard → Account & Settings → API Keys → Generate Key, in Live Mode). This just means `snaprint.in` needs to be deployed and reachable first — it does not need KYC to be done yet.
  2. **KYC** (PAN, bank account, business documents) — required before Razorpay will actually **settle** captured payments to the bank account. This can be submitted in parallel with/after deploying the site; typically reviewed within a few days.
- **Correct build order:** (1) build the whole site + payment flow using test keys → (2) deploy live to `snaprint.in` → (3) submit website URL to generate live keys → (4) submit KYC for settlement → (5) swap test keys for live keys in Cloudflare Pages env vars → (6) go live for real.

### The complete workflow, end to end
1. **Test mode first**: build and test the entire flow using test Key ID/Secret and Razorpay's test card numbers — no real money moves.
2. Buyer checks out → serverless function computes the trusted total → function calls Orders API using Key ID + Key Secret → Razorpay returns an `order_id`.
3. Frontend loads `checkout.js` and opens the Razorpay popup using the Key ID (public) + that `order_id`. Buyer pays with card/UPI/etc. inside Razorpay's own hosted popup — card details never touch your server.
4. Razorpay processes the payment and, independently of the buyer's browser, sends a webhook POST to the URL you registered in Settings → Webhooks.
5. Serverless function verifies the webhook's signature (using the Webhook Secret) and checks the payment status is `captured` — only then does it treat the order as real and paid.
6. **Go live**: once testing works, generate live-mode Key ID/Secret and Webhook Secret from the Dashboard, swap them into the Cloudflare Pages environment variables (test keys → live keys), and repeat the webhook setup for the live endpoint.

This is also *how you actually "receive" the money*: Razorpay settles captured payments to your linked bank account on its normal settlement schedule (visible in Dashboard → Settlements) — there's no separate "Payments API" step required to receive funds; capturing a payment is what triggers settlement.

### Checkout UX: it's a popup, not a redirect
`checkout.js` opens a **Razorpay-hosted modal/overlay on top of `snaprint.in`** — the buyer does not get redirected away to a separate Razorpay-owned page/domain. They stay on the site throughout; card/UPI details are entered inside the overlay and never touch Cloudflare Pages Functions or any custom backend. On completion, Razorpay closes the overlay and calls a frontend `handler` function.

**Important distinction for whoever builds this:** that `handler` callback is for **UI purposes only** (e.g. showing "Thanks for your order!" or redirecting to a `/thank-you` page). It must **never** be treated as proof of payment and must never trigger fulfillment, emails, or the Sheets write — a buyer can close the tab, lose connection, or have their browser JS blocked/tampered with before that callback fires. The **webhook** (server-to-server, signature-verified, `captured` status) is the only source of truth for "this order is real and paid." This should read as two fully independent code paths: one cosmetic (frontend handler → UI only), one authoritative (webhook → serverless function → fulfillment).

### ⚠️ Instructions for the AI agent building this — do not do any of the following
- Do **not** use the dashboard no-code "Payment Button" widget — it can't take a dynamically computed cart total.
- Do **not** calculate the order amount in frontend JS and send it to Razorpay in any form — the amount must only ever be computed inside the serverless function, from the live Products Sheet CSV.
- Do **not** trust any shipping-related value from the frontend beyond the buyer's chosen method (`"normal"`/`"speed"`) — combined item weight, weight tier, and shipping ₹ amount must all be computed server-side from the Products Sheet (`weight_g`) and Shipping Rates Sheet, never accepted from the client.
- Do **not** trust the frontend `handler` callback (or any client-side "payment success" event) to trigger order fulfillment, emails, or the Sheets write — only a signature-verified, `captured`-status webhook may do that.
- Do **not** skip HMAC signature verification on the webhook, even temporarily "to get it working" — an unverified webhook endpoint can be spoofed by anyone who finds the URL.
- Do **not** place the Razorpay **Key Secret** or **Webhook Secret** in any frontend file, client-side bundle, or public repo — both belong only in Cloudflare Pages' encrypted environment variables, read only inside serverless functions. Only the **Key ID** is safe to expose in frontend code.
- Do **not** skip the webhook idempotency check (payment ID lookup before appending a row) — Razorpay may retry webhook delivery, and without this check a single payment can create duplicate order rows/emails.

---

## Google Sheets Order Log — Setup Notes

1. Create a free Google Cloud project → enable **Google Sheets API**.
2. Create a **service account** → generates an email + private key (JSON credentials).
3. Create the order-tracking Sheet → share it with the service account's email (like sharing with a person).
4. Serverless function uses `googleapis` npm package, authenticates via service account credentials (stored as env variables, never hardcoded), calls `spreadsheets.values.append()` on every successful payment.
5. Columns suggestion: timestamp, order ID, buyer name, address, phone, items, amount, Razorpay payment ID, status (pending/printed/shipped).

Cost: $0 at this volume — free quota is far beyond what's needed.

---

## Security & Redundancy Hardening

All items below stay on free tiers — no new recurring cost, consistent with the zero/near-zero cost goal.

### Security (must-have — real payments involved)
- **Verify Razorpay webhook signature (HMAC)** in the serverless function before trusting any "payment successful" event. Without this, a spoofed webhook call could log/fulfill an order with no actual payment. Not optional.
- **Idempotency check on the webhook.** Razorpay may retry delivery if it doesn't get a fast-enough response. Before appending a row, check whether the Razorpay payment ID already exists in the Orders Sheet — prevents duplicate order rows / duplicate emails.
- **Cloudflare Turnstile** (free CAPTCHA alternative) on the checkout and "Request a Quote" forms — blocks bots from spamming fake orders or uploading junk files. Integrates natively since the stack is already on Cloudflare.
- **Secrets in environment variables, never hardcoded** — Razorpay keys, Google service account credentials, email API keys all go in Cloudflare Pages' encrypted environment variable store.
- **HTTPS everywhere** — automatic and free with Cloudflare Pages, nothing to configure.

### Redundancy beyond current plan
- **Google Sheets version history** (File → Version History) is automatic and free — a safety net against accidental edits/deletions on either sheet. Nothing to set up, just worth knowing it exists.
- **Order notification emails to two addresses** (e.g. primary + a secondary Gmail) — free, protects against one inbox having issues.
- **Data validation on the Products Sheet** — dropdown lists for `category` and `active` (yes/no) instead of free text, so a typo can't silently break the frontend's filtering logic. Similarly, use a dropdown for `method` (`normal`/`speed`) and `weight_tier` (`under_500g`/`500g_or_more`) on the Shipping Rates Sheet, so the server-side lookup never fails on a typo'd row.
- **Free uptime monitoring** — UptimeRobot (free tier) pings the site periodically and emails if it goes down. Useful peace of mind for a site not actively watched all day.
- **File size/type limits on the quote-upload form** — cap STL/STEP uploads at a reasonable size so the form can't be abused to dump huge files.

---

## Order Status / Buyer Order History

- No "my orders" account system for v1.
- If a buyer wants order history/status, they email the seller, who looks it up in the Sheet/local records and replies manually.
- Simple WhatsApp/email contact link on-site instead of a support ticket system.

---

## Professional Email (`queries@snaprint.in`)

- **Decision:** use **Cloudflare Email Routing (free)** to forward `queries@snaprint.in` to the existing personal Gmail, with Gmail's "send as" feature configured so replies also show the professional address. No paid mailbox needed for v1.
- **Storefront contact UX:** every buyer-facing `queries@snaprint.in` address is a mail link with a small copy button beside it, so buyers can either open their email app or copy the address.
- **Prerequisite:** this only works once the "Domain DNS Setup" step above is done (nameservers pointed from GoDaddy to Cloudflare) — Cloudflare Email Routing can't be configured until Cloudflare is managing the domain's DNS.
- Avoid GoDaddy's paid email add-ons (e.g. "Professional Email") for now — they're a recurring cost with no functional benefit at this scale.
- Revisit only if the business grows to the point of needing multiple team logins, shared inbox, or larger storage — at that point Zoho Mail's free tier is the next cheapest step up before a fully paid mailbox (Google Workspace / GoDaddy Professional Email).

---

## Data & Compliance Notes

- No strict "must stay local only" policy — priority is **cost minimization**, not data locality. Google Sheets storage is fine.
- India's **DPDP Act (2023)** governs personal data handling — not urgent at current scale, but worth a skim once volume grows. (Not legal advice.)
- GST/tax recordkeeping is a separate legal requirement (if applicable) regardless of app architecture — Razorpay's dashboard exports help here.

---

## v1 Feature List — Current Status

- [x] Product catalog fetched live from published Google Sheet CSV (categories: Toys / Decor / Custom Engineering Parts)
- [x] Product detail pages: multiple images, dimensions, and material
- [x] Optional `actual_price` Sheet field: shows the original price struck through and a calculated discount when it is higher than `price`; it is display-only and is never used for checkout
- [x] Shipping method selector at checkout (Normal / Speed), with cost fetched live from Shipping Rates Sheet CSV based on server-computed combined cart weight
- [x] Cart + Razorpay checkout via **Orders API + Checkout.js popup** (not the no-code Payment Button, not a redirect flow) — server computes amount (subtotal + shipping), never the frontend
- [x] Stock display logic (greyed out when unavailable) and "made to order" labeling
- [x] "Request a Quote" form for custom engineering parts (file upload + specs)
- [x] Razorpay webhook (signature-verified, `captured` status only) → seller and buyer email notifications
- [x] Razorpay webhook (signature-verified, `captured` status only) → Google Sheets order log
- [x] Razorpay webhook signature (HMAC) verification — **must-have, not optional**
- [x] Webhook idempotency check (payment ID lookup before appending a row)
- [x] Frontend `handler` callback used for UI/thank-you page only — never wired to fulfillment, email, or Sheets logic
- [ ] Cloudflare Turnstile on checkout + "Request a Quote" forms
- [x] File size/type limits on the quote-upload form
- [x] Search/filter by category, price, material, and product name; global search and a Sheet-driven Shop dropdown use shareable URL parameters
- [x] Support contact link at `queries@snaprint.in`, including an email-copy control
- [ ] Data validation (dropdowns) on Products Sheet `category` and `active` columns
- [ ] Free uptime monitoring (UptimeRobot) configured post-launch

---

## Open Items for Next Discussion

- Four policy pages: Refund/Return, Shipping, Terms & Conditions, and Privacy Policy (needed before Razorpay website verification).
- Cloudflare Turnstile for checkout and quote submissions.
- Razorpay KYC, website verification, and the coordinated move to live-mode credentials/webhook.
- Data validation in the public Sheets and a deliberate webhook-replay/idempotency test.
