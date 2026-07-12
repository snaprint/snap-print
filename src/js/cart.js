/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cart
   Renders cart items, quantity controls, summary, checkout link
   ═══════════════════════════════════════════════════════════════ */

import {
  getCart,
  removeFromCart,
  updateQuantity,
  getCartSubtotal,
  getCartCount,
  formatCurrency,
  showToast,
} from './utils.js';

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
  itemsContainer.innerHTML = cart.map(item => `
    <div class="cart-item animate-fade-in" data-id="${item.id}">
      <div class="cart-item__image">
        <img src="${item.image}" alt="${item.name}" loading="lazy"
          onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22%3E%3Crect fill=%22%23f3f4f6%22 width=%2280%22 height=%2280%22/%3E%3C/svg%3E'" />
      </div>
      <div class="cart-item__info">
        <a href="/product.html?id=${item.id}" class="cart-item__name">${item.name}</a>
        <span class="cart-item__meta">${item.material ? item.material : ''} · ${formatCurrency(item.price)} each</span>
      </div>
      <div class="qty-selector">
        <button class="qty-selector__btn qty-decrease" data-id="${item.id}" aria-label="Decrease quantity">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <span class="qty-selector__value">${item.quantity}</span>
        <button class="qty-selector__btn qty-increase" data-id="${item.id}" aria-label="Increase quantity">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <div class="flex items-center gap-3">
        <span class="cart-item__price">${formatCurrency(item.price * item.quantity)}</span>
        <button class="cart-item__remove remove-btn" data-id="${item.id}" aria-label="Remove ${item.name}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Summary sidebar
  const subtotal = getCartSubtotal();
  const count = getCartCount();

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
      <a href="/checkout.html" class="btn btn-primary btn-lg" style="width: 100%; margin-top: var(--space-5);">
        Proceed to Checkout
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </a>
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
      if (item) {
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

document.addEventListener('DOMContentLoaded', renderCart);
