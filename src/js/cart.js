/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cart
   Renders cart items, quantity controls, summary, checkout link.
   Refreshes every line from the products sheet on load (F-8).
   ═══════════════════════════════════════════════════════════════ */

import {
  getCart,
  setCart,
  removeFromCart,
  updateQuantity,
  getCartSubtotal,
  getCartCount,
  formatCurrency,
  showToast,
  fetchActiveProducts,
  getItemMaxQuantity,
  cartFieldsFromProduct,
  unavailableLabel,
  fetchCSV,
  CONFIG,
} from './utils.js';
import { parseBulkPricing, getBulkPrice, getPurchasability } from '../../shared/products.js';
import { escapeHtml } from './helpers.js';

// F-8: cart lines that can't be bought right now, id → reason
// ('inactive' when the product is gone from the sheet). Filled by the refresh.
let unavailableItems = {};

// Free-shipping thresholds from the shipping sheet: [{ label, threshold }].
// Same rule as the server: subtotal >= item_total → that method is free.
// Empty when the sheet can't be loaded (then nothing is shown, no guessing).
let freeShippingTiers = [];

async function loadFreeShippingTiers() {
  if (!CONFIG.SHIPPING_RATES_CSV_URL) return;
  try {
    const rows = await fetchCSV(CONFIG.SHIPPING_RATES_CSV_URL);
    const seen = new Set();
    freeShippingTiers = rows
      .map(r => ({ ...r, method: String(r.method ?? '').trim().toLowerCase() }))
      .filter(r => r.method && !seen.has(r.method) && seen.add(r.method))
      .map(r => ({
        label: r.field_content?.trim() || r.method.charAt(0).toUpperCase() + r.method.slice(1),
        threshold: Number(String(r.item_total ?? '').trim()),
      }))
      .filter(t => Number.isFinite(t.threshold) && t.threshold > 0)
      .sort((a, b) => a.threshold - b.threshold);
  } catch (err) {
    console.warn('[Cart] Could not load shipping thresholds:', err);
  }
}

function renderFreeShippingHint(subtotal) {
  if (!freeShippingTiers.length) return '';
  const lines = freeShippingTiers.map(t => {
    const remaining = t.threshold - subtotal;
    return remaining <= 0
      ? `<li class="cart-free-ship__item cart-free-ship__item--done">Free ${escapeHtml(t.label)} shipping unlocked</li>`
      : `<li class="cart-free-ship__item">Add ${formatCurrency(remaining)} more for free ${escapeHtml(t.label)} shipping</li>`;
  }).join('');
  return `<ul class="cart-free-ship" aria-label="Free shipping">${lines}</ul>`;
}

/**
 * F-8: brings every cart line up to date with the products sheet (name,
 * price, compare price, image, material, bulk tiers, quantity cap) and flags
 * lines that can no longer be bought. Lines are kept (not silently removed)
 * so the buyer sees what happened; checkout is blocked until they're removed.
 */
async function refreshCartFromSheet() {
  let products;
  try {
    products = await fetchActiveProducts();
  } catch (err) {
    console.warn('[Cart] Could not refresh the cart from the sheet:', err);
    return; // keep showing stored data; the server re-checks everything at payment
  }
  const live = new Map(products.map(p => [p.id, p]));
  const cart = getCart();
  const notes = [];
  let changed = false;
  let pricesChanged = false;
  unavailableItems = {};

  for (const item of cart) {
    const product = live.get(item.id);
    if (!product) { unavailableItems[item.id] = 'inactive'; continue; }

    const { purchasable, reason, maxQuantity } = getPurchasability(product);
    const fresh = cartFieldsFromProduct(product);
    if (!purchasable) {
      unavailableItems[item.id] = reason;
      delete fresh.max_quantity; // 0 for unbuyable products; keep the old cap
    }
    for (const [key, value] of Object.entries(fresh)) {
      if (item[key] !== value) {
        if (key === 'price' || key === 'bulk_pricing') pricesChanged = true;
        item[key] = value;
        changed = true;
      }
    }
    if (purchasable && item.quantity > maxQuantity) {
      notes.push(`Only ${maxQuantity} of ${item.name} can be ordered. Your cart was updated.`);
      item.quantity = maxQuantity;
      changed = true;
    }
  }

  if (changed) setCart(cart);
  if (pricesChanged) notes.push('Some prices changed since you added these items. Your cart shows the current prices.');
  notes.forEach(n => showToast(n, 'info', 7000));
}

function renderCart() {
  const itemsContainer = document.getElementById('cart-items');
  const summaryContainer = document.getElementById('cart-summary');
  const layout = document.getElementById('cart-layout');
  if (!itemsContainer || !summaryContainer) return;

  const cart = getCart();

  if (cart.length === 0) {
    // Empty cart
    layout.style.display = 'block';
    itemsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
        </div>
        <h2 class="empty-state__title">Your cart is empty</h2>
        <p class="empty-state__desc">Looks like you haven't added anything yet. Browse our collection and find something you love!</p>
        <a href="/" class="btn btn-primary btn-lg">Browse Products</a>
      </div>
    `;
    summaryContainer.innerHTML = '';
    return;
  }

  // Cart items
  itemsContainer.innerHTML = cart.map(item => {
    const tiers = parseBulkPricing(item.bulk_pricing);
    const effectivePrice = getBulkPrice(tiers, item.quantity, item.price);
    const isBulkDiscounted = tiers && effectivePrice < item.price;
    const lineTotal = effectivePrice * item.quantity;
    const id = escapeHtml(item.id);
    const name = escapeHtml(item.name);
    const unavailableReason = unavailableItems[item.id];

    return `
    <div class="cart-item animate-fade-in${unavailableReason ? ' cart-item--unavailable' : ''}" data-id="${id}">
      <div class="cart-item__image">
        <img src="${escapeHtml(item.image)}" alt="${name}" loading="lazy"
          onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22%3E%3Crect fill=%22%23f3f4f6%22 width=%2280%22 height=%2280%22/%3E%3C/svg%3E'" />
      </div>
      <div class="cart-item__info">
        <a href="/product.html?id=${encodeURIComponent(item.id)}" class="cart-item__name">${name}</a>
        <span class="cart-item__meta">${item.material ? escapeHtml(item.material) + ' · ' : ''}${formatCurrency(effectivePrice)} each</span>
        ${isBulkDiscounted ? `
          <span class="cart-item__bulk-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Bulk Discount
          </span>
        ` : ''}
        ${unavailableReason ? `
          <span class="badge badge-out-of-stock" style="align-self:flex-start;">${escapeHtml(unavailableLabel(unavailableReason))}</span>
          <span style="font-size:var(--text-xs);color:var(--text-sale);">Please remove this item to continue.</span>
        ` : ''}
      </div>
      <div class="qty-selector">
        <button class="qty-selector__btn qty-decrease" data-id="${id}" aria-label="Decrease quantity">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <span class="qty-selector__value">${item.quantity}</span>
        <button class="qty-selector__btn qty-increase" data-id="${id}" aria-label="Increase quantity"
          ${item.quantity >= getItemMaxQuantity(item) ? `disabled title="Max ${getItemMaxQuantity(item)} per order"` : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div class="flex items-center gap-3">
        <span class="cart-item__price">${formatCurrency(lineTotal)}</span>
        <button class="cart-item__remove remove-btn" data-id="${id}" aria-label="Remove ${name}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');

  // Summary sidebar
  const subtotal = getCartSubtotal();
  const count = getCartCount();
  const blocked = cart.some(item => unavailableItems[item.id]);

  summaryContainer.innerHTML = `
    <div class="summary-card">
      <h2 class="summary-card__title">Order Summary</h2>
      <div class="summary-card__row">
        <span class="summary-card__label">Items (${count})</span>
        <span class="summary-card__value">${formatCurrency(subtotal)}</span>
      </div>
      <div class="summary-card__row">
        <span class="summary-card__label">Shipping</span>
        <span class="summary-card__value summary-card__value--accent">Calculated at checkout</span>
      </div>
      <div class="summary-card__row summary-card__row--total">
        <span class="summary-card__label">Subtotal</span>
        <span class="summary-card__value price">${formatCurrency(subtotal)}</span>
      </div>
      ${renderFreeShippingHint(subtotal)}
      ${blocked ? `
        <button class="btn btn-primary btn-lg" style="width: 100%; margin-top: var(--space-5);" disabled>Proceed to Checkout</button>
        <p id="cart-blocked-note" style="margin-top:var(--space-2);font-size:var(--text-sm);color:var(--text-sale);">Some items are no longer available. Remove them to continue.</p>
      ` : `
      <a href="/checkout.html" class="btn btn-primary btn-lg" style="width: 100%; margin-top: var(--space-5);">
        Proceed to Checkout
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </a>`}
      <a href="/" class="btn btn-ghost" style="width: 100%; margin-top: var(--space-2);">Continue Shopping</a>
    </div>
  `;

  // Event listeners
  attachCartEvents();
}

function attachCartEvents() {
  // Quantity decrease
  document.querySelectorAll('.qty-decrease').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const cart = getCart();
      const item = cart.find(i => i.id === id);
      if (item && item.quantity > 1) {
        updateQuantity(id, item.quantity - 1);
        renderCart();
      }
    });
  });

  // Quantity increase
  document.querySelectorAll('.qty-increase').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const cart = getCart();
      const item = cart.find(i => i.id === id);
      if (item && item.quantity < getItemMaxQuantity(item)) {
        updateQuantity(id, item.quantity + 1);
        renderCart();
      }
    });
  });

  // Remove
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = getCart().find(i => i.id === id);
      removeFromCart(id);
      showToast(`${item?.name || 'Item'} removed from cart`, 'info');
      renderCart();
    });
  });
}

// Re-render on cart updates from other components
window.addEventListener('cart-updated', renderCart);

document.addEventListener('DOMContentLoaded', () => {
  // 1. Render immediately from localStorage (instant, no network)
  renderCart();

  // 2. Refresh every line from the sheet in the background (F-8), then re-render
  refreshCartFromSheet().then(renderCart);

  // 3. Free-shipping hint from the shipping sheet
  loadFreeShippingTiers().then(() => { if (freeShippingTiers.length) renderCart(); });
});
