/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Create Razorpay Order
   
   POST /api/create-order
   
   Receives cart items + shipping method + buyer info from frontend.
   Fetches the Products + Shipping CSV server-side, computes the
   authoritative total (tamper-proof), and creates a Razorpay order.
   ═══════════════════════════════════════════════════════════════ */

// Simple CSV parser (no external deps in Pages Functions)
// Handles multi-line quoted fields (e.g. descriptions with line breaks)
function parseCSV(text) {
  const lines = splitCSVRows(text);
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      // Strip UTF-8 BOM from the first header (Google Sheets CSVs often include it)
      const key = h.replace(/^\uFEFF/, '').trim();
      obj[key] = (values[i] || '').trim();
    });
    return obj;
  });
}

/**
 * Splits raw CSV text into rows, respecting quoted fields that contain newlines.
 * A newline inside a quoted field is part of the cell value, not a row boundary.
 */
function splitCSVRows(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // Row boundary (only outside quotes)
      if (char === '\r' && text[i + 1] === '\n') i++; // skip \r\n pair
      if (current.trim()) rows.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Last row (may not end with newline)
  if (current.trim()) rows.push(current);
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else if (char === '\r') {
      // skip
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ── Bulk Pricing (server-side, tamper-proof) ──
// Duplicated from src/js/utils.js because Pages Functions can't import ES modules.
function parseBulkPricing(bulkString) {
  if (!bulkString || typeof bulkString !== 'string') return null;
  const trimmed = bulkString.trim();
  if (!trimmed) return null;

  const tiers = [];
  const segments = trimmed.split('|');

  for (const segment of segments) {
    const [rangeStr, priceStr] = segment.split(':');
    if (!rangeStr || !priceStr) continue;

    const price = Number(priceStr.trim());
    if (isNaN(price) || price < 0) continue;

    const range = rangeStr.trim();

    if (range.endsWith('+')) {
      const min = Number(range.slice(0, -1));
      if (isNaN(min) || min < 1) continue;
      tiers.push({ min, max: Infinity, price });
    } else if (range.includes('-')) {
      const [minStr, maxStr] = range.split('-');
      const min = Number(minStr.trim());
      const max = Number(maxStr.trim());
      if (isNaN(min) || isNaN(max) || min < 1 || max < min) continue;
      tiers.push({ min, max, price });
    } else {
      const qty = Number(range);
      if (isNaN(qty) || qty < 1) continue;
      tiers.push({ min: qty, max: qty, price });
    }
  }

  if (tiers.length === 0) return null;
  return tiers.sort((a, b) => a.min - b.min);
}

function getBulkPrice(tiers, quantity, basePrice) {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return Number(basePrice);
  const qty = Number(quantity);

  for (const tier of tiers) {
    if (qty >= tier.min && qty <= tier.max) {
      return tier.price;
    }
  }

  const lastTier = tiers[tiers.length - 1];
  if (qty >= lastTier.min) return lastTier.price;

  return Number(basePrice);
}

// B-2: quantities are validated, never clamped. Max per product, after merging duplicate lines.
const MAX_QTY_PER_PRODUCT = 100;

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
      const product = products.find(p => p.id === id && p.active?.toLowerCase() === 'yes');
      if (!product) {
        return jsonError(`Product ${id} not found or inactive`, 400);
      }
      if (quantity > MAX_QTY_PER_PRODUCT) {
        return jsonError(`You can order at most ${MAX_QTY_PER_PRODUCT} of ${product.name} (your cart has ${quantity})`, 400);
      }

      // Engineering items can't be purchased directly
      if (product.category === 'engineering') {
        return jsonError(`Engineering parts require a quote — cannot checkout directly`, 400);
      }

      const basePrice = Number(product.price);

      // Compute effective per-unit price using bulk pricing tiers
      const bulkTiers = parseBulkPricing(product.bulk_pricing);
      const hasBulk = bulkTiers !== null;

      // Check stock (skip for made-to-order AND bulk-priced products — bulk orders are manufactured after confirmation)
      if (product.made_to_order !== 'yes' && !hasBulk) {
        const stock = Number(product.stock);
        if (stock <= 0) {
          return jsonError(`${product.name} is out of stock`, 400);
        }
        if (quantity > stock) {
          return jsonError(`Only ${stock} of ${product.name} available`, 400);
        }
      }

      const effectivePrice = getBulkPrice(bulkTiers, quantity, basePrice);

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

    return new Response(JSON.stringify({
      order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key_id: razorpayKeyId,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Create order error:', err);
    return jsonError('Internal server error', 500);
  }
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
