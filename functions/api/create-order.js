/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Create Razorpay Order
   
   POST /api/create-order
   
   Receives cart items + shipping method + buyer info from frontend.
   Fetches the Products + Shipping CSV server-side, computes the
   authoritative total (tamper-proof), and creates a Razorpay order.
   ═══════════════════════════════════════════════════════════════ */

import {
  MAX_QTY_PER_PRODUCT,
  getPurchasability,
  availableStock,
  parsePrice,
  parseBulkPricing,
  getBulkPrice,
} from '../../shared/products.js';
import { parseCSV } from '../_lib/csv.js';
import { jsonError, jsonResponse } from '../_lib/http.js';

// B-2: quantities are validated, never clamped. Max per product (MAX_QTY_PER_PRODUCT,
// from shared/products.js) applies after merging duplicate lines.

/** Accepts an integer (or an all-digits string). Returns the number, or null if invalid. */
function parseQuantity(value) {
  const n = typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  return Number.isInteger(n) ? n : null;
}

// ── B-3: Razorpay notes limits ──
// Razorpay allows at most 15 note keys, each value at most 256 characters.
// Items are stored compactly as `id:qty:unitPrice` tokens joined by ',' (ids are
// URI-encoded so ':' and ',' can't appear inside), split across ITEMS_NOTE_KEYS at
// item boundaries (key budget: 8 buyer_* + 4 order keys + 3 item chunks = 15). The webhook decodes them (see webhook.js parseItemsFromNotes).
const NOTE_MAX_CHARS = 256;
const NOTE_MAX_KEYS = 15;
const ITEMS_NOTE_KEYS = ['items_1', 'items_2', 'items_3'];

// Buyer fields that go into notes, with the label used in error messages.
const BUYER_NOTE_FIELDS = [
  ['buyer_name', 'Full name'],
  ['buyer_email', 'Email'],
  ['buyer_phone', 'Phone'],
  ['buyer_address', 'Address (including apartment)'],
  ['buyer_city', 'City'],
  ['buyer_state', 'State'],
  ['buyer_pincode', 'PIN code'],
];

/** Packs tokens into at most `maxChunks` strings of ≤ maxLen chars without splitting a token. */
function packTokens(tokens, maxChunks, maxLen, sep = ',') {
  const chunks = [];
  let current = '';
  for (const token of tokens) {
    if (token.length > maxLen) return null;
    const next = current ? current + sep + token : token;
    if (next.length <= maxLen) { current = next; continue; }
    chunks.push(current);
    current = token;
  }
  if (current) chunks.push(current);
  return chunks.length <= maxChunks ? chunks : null;
}

/** Human-readable summary, shortened at item boundaries to fit one note. */
function buildItemsSummary(resolvedItems) {
  const parts = resolvedItems.map(i => `${i.name} x${i.quantity}`);
  const full = parts.join(', ');
  if (full.length <= NOTE_MAX_CHARS) return full;
  for (let keep = parts.length - 1; keep >= 0; keep--) {
    const more = ` +${parts.length - keep} more`;
    const head = parts.slice(0, keep).join(', ');
    if (head.length + more.length <= NOTE_MAX_CHARS) return head + more;
  }
  return `${parts.length} items`;
}

export async function onRequestPost(context) {
  const { env } = context;

  try {
    const body = await context.request.json();
    const { items, shippingMethod, buyer } = body;

    // Validate basic input before making any network requests
    if (!items || !Array.isArray(items) || items.length === 0) {
      return jsonError('No items provided', 400);
    }
    // B-1: normalise the shipping method ONCE and use only `method` below.
    const method = typeof shippingMethod === 'string' ? shippingMethod.trim().toLowerCase() : '';
    if (!method) {
      return jsonError('Missing shipping method', 400);
    }
    if (!buyer || !buyer.email || !buyer.fullName || !buyer.phone || !buyer.pincode) {
      return jsonError('Missing buyer information', 400);
    }

    // B-3: every buyer value that goes into Razorpay notes must fit in 256 chars.
    const str = v => (v === undefined || v === null ? '' : String(v).trim());
    const buyerNotes = {
      buyer_uid: str(buyer.uid),
      buyer_name: str(buyer.fullName),
      buyer_email: str(buyer.email),
      buyer_phone: str(buyer.phone),
      buyer_address: [str(buyer.address), str(buyer.apartment)].filter(Boolean).join(', '),
      buyer_city: str(buyer.city),
      buyer_state: str(buyer.state),
      buyer_pincode: str(buyer.pincode),
    };
    for (const [key, label] of BUYER_NOTE_FIELDS) {
      if (buyerNotes[key].length > NOTE_MAX_CHARS) {
        return jsonError(`${label} is too long (maximum ${NOTE_MAX_CHARS} characters)`, 400);
      }
    }
    if (buyerNotes.buyer_uid.length > 128) {
      return jsonError('Invalid account id', 400);
    }

    // B-2: validate every line, then merge duplicate product ids (id → total quantity).
    const requested = new Map();
    for (const [index, cartItem] of items.entries()) {
      const id = typeof cartItem?.id === 'string' ? cartItem.id.trim() : '';
      if (!id) {
        return jsonError(`Item ${index + 1} is missing a product id`, 400);
      }
      const qty = parseQuantity(cartItem.quantity);
      if (qty === null || qty < 1 || qty > MAX_QTY_PER_PRODUCT) {
        return jsonError(`Invalid quantity for ${id}: must be a whole number from 1 to ${MAX_QTY_PER_PRODUCT}`, 400);
      }
      requested.set(id, (requested.get(id) || 0) + qty);
    }

    // Fetch Products + Shipping CSVs server-side
    const productsCSVUrl = env.PRODUCTS_CSV_URL || env.VITE_PRODUCTS_CSV_URL;
    const shippingCSVUrl = env.SHIPPING_RATES_CSV_URL || env.VITE_SHIPPING_RATES_CSV_URL;

    if (!productsCSVUrl || !shippingCSVUrl) {
      return jsonError('Server configuration error: missing CSV URLs', 500);
    }

    const [productsRes, shippingRes] = await Promise.all([
      fetch(productsCSVUrl),
      fetch(shippingCSVUrl),
    ]);

    if (!productsRes.ok || !shippingRes.ok) {
      return jsonError('Failed to fetch pricing data', 500);
    }

    const products     = parseCSV(await productsRes.text());
    const shippingRates = parseCSV(await shippingRes.text());

    // Validate that the requested shipping method actually exists in the sheet.
    // This replaces a previous hardcoded ['surface','air'] allowlist so that
    // adding new methods to the sheet works without a code change.
    const validMethods = shippingRates
      .map(r => r.method?.trim().toLowerCase())
      .filter(Boolean);
    if (!validMethods.includes(method)) {
      return jsonError(`Invalid shipping method. Valid options: ${validMethods.join(', ')}`, 400);
    }

    // Compute server-side total
    let subtotal = 0;
    const resolvedItems = [];

    for (const [id, quantity] of requested) {
      // Same rule the UI uses: shared/products.js getPurchasability (B-10).
      const product = products.find(p => p.id === id);
      const status = getPurchasability(product);
      if (!status.purchasable) {
        switch (status.reason) {
          case 'inactive':
            return jsonError(`Product ${id} not found or inactive`, 400);
          case 'quote_only':
            return jsonError(`Engineering parts require a quote — cannot checkout directly`, 400);
          case 'no_price':
            console.error(`Products sheet: ${id} has no valid price (> 0)`);
            return jsonError(`${product.name} is currently unavailable`, 400);
          default: // out_of_stock
            return jsonError(`${product.name} is out of stock`, 400);
        }
      }
      if (quantity > MAX_QTY_PER_PRODUCT) {
        return jsonError(`You can order at most ${MAX_QTY_PER_PRODUCT} of ${product.name} (your cart has ${quantity})`, 400);
      }
      if (quantity > status.maxQuantity) {
        // Only stock-tracked products have maxQuantity < MAX_QTY_PER_PRODUCT.
        return jsonError(`Only ${availableStock(product)} of ${product.name} available`, 400);
      }

      const basePrice = parsePrice(product.price);
      // Bulk tiers set the per-unit price (bulk-priced products skip the stock check — see tracksStock).
      const effectivePrice = getBulkPrice(parseBulkPricing(product.bulk_pricing), quantity, basePrice);
      if (!Number.isFinite(effectivePrice) || effectivePrice <= 0) {
        console.error(`Products sheet: ${id} bulk tier for qty ${quantity} has no valid price (> 0)`);
        return jsonError(`${product.name} is currently unavailable`, 400);
      }

      subtotal += effectivePrice * quantity;
      resolvedItems.push({
        id: product.id,
        name: product.name,
        price: effectivePrice,
        basePrice,
        quantity,
      });
    }

    // Compute shipping cost server-side using the item_total price cap from the sheet.
    // Logic: item_total is a plain number (the free-shipping threshold).
    //   - If subtotal >= item_total  →  shipping is FREE (0)
    //   - If subtotal <  item_total  →  charge shipping_cost
    const rateRow = shippingRates.find(
      r => r.method?.trim().toLowerCase() === method
    );
    // rateRow always exists here (validated above), but never fall through to free shipping.
    const rateCost = Number(rateRow?.shipping_cost);
    if (!rateRow || !rateRow.shipping_cost?.trim() || !Number.isFinite(rateCost) || rateCost < 0) {
      console.error(`Shipping sheet: invalid shipping_cost for method "${method}"`);
      return jsonError('Shipping rates are misconfigured. Please try again later.', 500);
    }
    // Blank / non-numeric item_total means "no free-shipping threshold" (never free).
    const capRaw = rateRow.item_total?.trim();
    const shippingCap = capRaw && Number.isFinite(Number(capRaw)) ? Number(capRaw) : Infinity;
    const shippingCost = subtotal < shippingCap ? rateCost : 0;

    const totalAmount = subtotal + shippingCost;
    const totalAmountPaise = Math.round(totalAmount * 100);

    if (totalAmountPaise <= 0) {
      return jsonError('Invalid order total', 400);
    }

    // B-3: build notes that respect Razorpay's limits (never truncate structured data).
    const itemChunks = packTokens(
      resolvedItems.map(i => `${encodeURIComponent(i.id)}:${i.quantity}:${i.price}`),
      ITEMS_NOTE_KEYS.length,
      NOTE_MAX_CHARS,
    );
    if (!itemChunks) {
      return jsonError('This order has too many different products. Please split it into two orders.', 400);
    }
    const notes = {
      ...buyerNotes,
      shipping_method: method,
      shipping_cost: String(shippingCost),
      subtotal: String(subtotal),
      items_summary: buildItemsSummary(resolvedItems),
    };
    itemChunks.forEach((chunk, i) => { notes[ITEMS_NOTE_KEYS[i]] = chunk; });

    const keys = Object.keys(notes);
    const oversized = keys.filter(k => String(notes[k]).length > NOTE_MAX_CHARS);
    if (keys.length > NOTE_MAX_KEYS || oversized.length) {
      console.error('Razorpay notes exceed limits', { keyCount: keys.length, oversized });
      return jsonError('Could not prepare your order. Please contact us.', 500);
    }

    // Create Razorpay Order
    const razorpayKeyId = env.RAZORPAY_KEY_ID || env.VITE_RAZORPAY_KEY_ID;
    const razorpayKeySecret = env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret) {
      return jsonError('Payment gateway not configured', 500);
    }

    const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`),
      },
      body: JSON.stringify({
        amount: totalAmountPaise,
        currency: 'INR',
        receipt: `order_${Date.now()}`,
        notes,
      }),
    });

    if (!rzpResponse.ok) {
      const errBody = await rzpResponse.text();
      console.error('Razorpay error:', errBody);
      return jsonError('Failed to create payment order', 500);
    }

    const rzpOrder = await rzpResponse.json();

    return jsonResponse({
      order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key_id: razorpayKeyId,
    });

  } catch (err) {
    console.error('Create order error:', err);
    return jsonError('Internal server error', 500);
  }
}

