/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — shared product rules (backend + frontend)

   Owned by BACKEND. Frontend imports this file (e.g. from src/js/…
   via a relative import) but must not edit it; ask in agents/MESSAGES.md.
   Pure functions only: no DOM, no env, no fetch — so it runs in the
   browser, in Cloudflare Pages Functions and in Node.

   The server (functions/api/create-order.js) uses exactly these rules
   to accept or reject an order, so the UI must use them too or users
   will see "buyable" products that checkout rejects.
   ═══════════════════════════════════════════════════════════════ */

/** Max quantity of one product per order (after merging duplicate cart lines). */
export const MAX_QTY_PER_PRODUCT = 100;

/** Sheet yes/no cells: case-insensitive, whitespace-tolerant. */
export function isYes(value) {
  return String(value ?? '').trim().toLowerCase() === 'yes';
}

export function isActive(product) {
  return isYes(product?.active);
}

export function isMadeToOrder(product) {
  return isYes(product?.made_to_order);
}

/** Engineering parts are quote-only (case-insensitive category check). */
export function isEngineering(product) {
  return String(product?.category ?? '').trim().toLowerCase() === 'engineering';
}

/** A sheet price cell as a positive number, or null if blank / not a number / ≤ 0. */
export function parsePrice(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Bulk pricing ──
// Format: "1-2:499|3-5:449|6-10:399|11+:349" (pipe-separated range:price;
// ranges "a-b", "n" or "n+"). Above every tier, the last tier applies.
// Moved verbatim from functions/api/create-order.js (identical to the copy
// in src/js/utils.js on 2026-11-17).

export function parseBulkPricing(bulkString) {
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

export function getBulkPrice(tiers, quantity, basePrice) {
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

export function hasBulkPricing(product) {
  return parseBulkPricing(product?.bulk_pricing) !== null;
}

// ── Stock ──

/**
 * Stock is only tracked for products that are neither made-to-order nor
 * bulk-priced (bulk orders are manufactured after confirmation).
 */
export function tracksStock(product) {
  return !isMadeToOrder(product) && !hasBulkPricing(product);
}

/**
 * Units available for a stock-tracked product. A blank, non-numeric or
 * negative stock cell counts as 0 (out of stock). Fractions round down.
 */
export function availableStock(product) {
  const n = Number(String(product?.stock ?? '').trim() || NaN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * THE purchasability rule. A product can go through checkout only if:
 *   1. active = yes                                      else reason 'inactive'
 *   2. category is not "engineering" (any case)          else 'quote_only'
 *   3. price is a number > 0                             else 'no_price'
 *   4. stock: if stock is tracked (see tracksStock), at
 *      least 1 unit — blank stock counts as 0            else 'out_of_stock'
 *
 * Returns { purchasable, reason, maxQuantity } where maxQuantity is the most
 * the buyer may order (stock-limited, capped at MAX_QTY_PER_PRODUCT; 0 if
 * not purchasable). Checkout also rejects a bulk tier priced at 0.
 */
export function getPurchasability(product) {
  const no = reason => ({ purchasable: false, reason, maxQuantity: 0 });
  if (!product || !isActive(product)) return no('inactive');
  if (isEngineering(product)) return no('quote_only');
  if (parsePrice(product.price) === null) return no('no_price');
  if (tracksStock(product)) {
    const stock = availableStock(product);
    if (stock < 1) return no('out_of_stock');
    return { purchasable: true, reason: null, maxQuantity: Math.min(stock, MAX_QTY_PER_PRODUCT) };
  }
  return { purchasable: true, reason: null, maxQuantity: MAX_QTY_PER_PRODUCT };
}

export function isPurchasable(product) {
  return getPurchasability(product).purchasable;
}
