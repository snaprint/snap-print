/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cloudflare Pages Function: Create Razorpay Order
   
   POST /api/create-order
   
   Receives cart items + shipping method + buyer info from frontend.
   Fetches the Products + Shipping CSV server-side, computes the
   authoritative total (tamper-proof), and creates a Razorpay order.
   ═══════════════════════════════════════════════════════════════ */

// Simple CSV parser (no external deps in Pages Functions)
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (values[i] || '').trim(); });
    return obj;
  });
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

export async function onRequestPost(context) {
  const { env } = context;

  try {
    const body = await context.request.json();
    const { items, shippingMethod, buyer } = body;

    // Validate input
    if (!items || !Array.isArray(items) || items.length === 0) {
      return jsonError('No items provided', 400);
    }
    if (!shippingMethod || !['surface', 'air'].includes(shippingMethod)) {
      return jsonError('Invalid shipping method', 400);
    }
    if (!buyer || !buyer.email || !buyer.firstName || !buyer.phone || !buyer.pincode) {
      return jsonError('Missing buyer information', 400);
    }

    // Fetch Products CSV server-side
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

    const products = parseCSV(await productsRes.text());
    const shippingRates = parseCSV(await shippingRes.text());

    // Compute server-side total
    let subtotal = 0;
    const resolvedItems = [];

    for (const cartItem of items) {
      const product = products.find(p => p.id === cartItem.id && p.active?.toLowerCase() === 'yes');
      if (!product) {
        return jsonError(`Product ${cartItem.id} not found or inactive`, 400);
      }

      // Engineering items can't be purchased directly
      if (product.category === 'engineering') {
        return jsonError(`Engineering parts require a quote — cannot checkout directly`, 400);
      }

      const price = Number(product.price);
      const quantity = Math.max(1, Math.min(100, Number(cartItem.quantity)));

      // Check stock (skip for made-to-order)
      if (product.made_to_order !== 'yes') {
        const stock = Number(product.stock);
        if (stock <= 0) {
          return jsonError(`${product.name} is out of stock`, 400);
        }
        if (quantity > stock) {
          return jsonError(`Only ${stock} of ${product.name} available`, 400);
        }
      }

      subtotal += price * quantity;
      resolvedItems.push({
        id: product.id,
        name: product.name,
        price,
        quantity,
      });
    }

    // Compute shipping cost server-side using item_total from the sheet
    // Parses condition strings like '< 999' or '> 999'
    function evalCondition(condStr, value) {
      const m = String(condStr).trim().match(/^([<>]=?)\s*(\d+(?:\.\d+)?)$/);
      if (!m) return false;
      const threshold = Number(m[2]);
      if (m[1] === '<')  return value <  threshold;
      if (m[1] === '<=') return value <= threshold;
      if (m[1] === '>')  return value >  threshold;
      if (m[1] === '>=') return value >= threshold;
      return false;
    }

    const matchingRate = shippingRates.find(
      r => r.method?.trim().toLowerCase() === shippingMethod &&
           evalCondition(r.item_total, subtotal)
    );
    const shippingCost = matchingRate ? Number(matchingRate.shipping_cost) : 0;

    const totalAmount = subtotal + shippingCost;
    const totalAmountPaise = Math.round(totalAmount * 100);

    if (totalAmountPaise <= 0) {
      return jsonError('Invalid order total', 400);
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
        notes: {
          buyer_name: buyer.fullName || '',
          buyer_email: buyer.email,
          buyer_phone: buyer.phone,
          buyer_address: [buyer.address, buyer.apartment].filter(Boolean).join(', '),
          buyer_city: buyer.city || '',
          buyer_state: buyer.state || '',
          buyer_pincode: buyer.pincode,
          shipping_method: shippingMethod,
          shipping_cost: String(shippingCost),
          subtotal: String(subtotal),
          item_count: String(resolvedItems.length),
          items_summary: resolvedItems
            .map(i => `${i.name} x${i.quantity}`)
            .join(', ')
            .slice(0, 512),
          // JSON-encoded item details for itemized emails
          items_detail: JSON.stringify(
            resolvedItems.map(i => ({ n: i.name, q: i.quantity, p: i.price }))
          ).slice(0, 512),
        },
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
