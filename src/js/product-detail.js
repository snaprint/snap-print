/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Product Detail
   Gallery, specs, dual CTAs, trust row, embedded FAQ
   ═══════════════════════════════════════════════════════════════ */

import {
  getSampleProducts, CONFIG, fetchCSV, normalizeProduct, addToCart, clearCart,
  formatCurrency, getDiscountPercent, showToast, resolveImageUrl,
} from './utils.js';

let currentProduct = null;
let allProducts = [];

async function loadProduct() {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');
  if (!productId) { showNotFound(); return; }

  try {
    if (CONFIG.PRODUCTS_CSV_URL) {
      allProducts = (await fetchCSV(CONFIG.PRODUCTS_CSV_URL))
        .map(normalizeProduct)
        .filter(p => p.active?.toLowerCase() === 'yes');
    } else {
      allProducts = getSampleProducts().filter(p => p.active?.toLowerCase() === 'yes');
    }

    currentProduct = allProducts.find(p => p.id === productId);
    if (!currentProduct) { showNotFound(); return; }
    if (currentProduct.category === 'engineering') { window.location.href = '/quote.html'; return; }

    renderProduct(currentProduct);
    renderRelatedProducts(currentProduct);
    document.title = `${currentProduct.name} — Snap Print`;
  } catch (err) {
    console.error('Failed to load product:', err);
    showToast('Failed to load product details', 'error');
  }
}

function renderProduct(product) {
  const layout = document.getElementById('product-layout');
  const breadcrumbCategory = document.getElementById('breadcrumb-category');

  if (breadcrumbCategory) {
    const catLabel = product.category.charAt(0).toUpperCase() + product.category.slice(1);
    breadcrumbCategory.innerHTML = `<a href="/?category=${product.category}">${catLabel}</a> <span class="separator">›</span> ${product.name}`;
  }

  const images = product.image_urls ? product.image_urls.split(',').map(url => resolveImageUrl(url.trim())) : [];
  const mainImage = images[0] || '';
  const isOutOfStock = product.stock !== '' && Number(product.stock) <= 0 && product.made_to_order !== 'yes';
  const isMadeToOrder = product.made_to_order === 'yes';
  const discount = getDiscountPercent(product.price, product.actual_price);

  layout.innerHTML = `
    <!-- Gallery -->
    <div class="product-gallery">
      <div class="product-gallery__main">
        <img src="${mainImage}" alt="${product.name}" id="main-image"
          onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 600 600%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22600%22 height=%22600%22/%3E%3Ctext fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2218%22 x=%22300%22 y=%22300%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E'" />
      </div>
      ${images.length > 1 ? `
        <div class="product-gallery__thumbs">
          ${images.map((img, i) => `
            <button class="product-gallery__thumb ${i === 0 ? 'active' : ''}" data-index="${i}">
              <img src="${img}" alt="${product.name} ${i + 1}" />
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <!-- Product Info -->
    <div class="product-info">
      <span class="product-info__category">${product.category}</span>
      <h1 class="product-info__title">${product.name}</h1>

      <!-- Pricing -->
      <div class="product-info__pricing">
        <span class="product-info__price">${formatCurrency(product.price)}</span>
        ${discount > 0 ? `
          <span class="product-info__compare-price">${formatCurrency(product.actual_price)}</span>
          <span class="product-info__discount">Save ${discount}%</span>
        ` : ''}
      </div>

      <!-- Badges -->
      <div class="flex gap-2" style="flex-wrap:wrap;">
        ${isMadeToOrder ? '<span class="badge badge-made-to-order">Made to Order</span>' : ''}
        ${isOutOfStock ? '<span class="badge badge-out-of-stock">Sold Out</span>' : ''}
        ${!isOutOfStock && !isMadeToOrder && product.stock ? `<span class="badge badge-stock">In Stock (${product.stock} left)</span>` : ''}
      </div>

      <p class="product-info__desc">${product.description || 'No description available.'}</p>

      <!-- Specs -->
      ${product.material || product.dimensions || product.weight_g ? `
        <div class="product-info__specs">
          ${product.material ? `<div><span class="product-info__spec-label">Material</span><span class="product-info__spec-value">${product.material}</span></div>` : ''}
          ${product.dimensions ? `<div><span class="product-info__spec-label">Dimensions</span><span class="product-info__spec-value">${product.dimensions}</span></div>` : ''}
          ${product.weight_g ? `<div><span class="product-info__spec-label">Weight</span><span class="product-info__spec-value">${product.weight_g}g</span></div>` : ''}
          ${isMadeToOrder ? `<div><span class="product-info__spec-label">Lead Time</span><span class="product-info__spec-value">5–7 days</span></div>` : ''}
        </div>
      ` : ''}

      <!-- Quantity + CTAs -->
      ${isOutOfStock ? `
        <div class="product-info__ctas">
          <button class="btn btn-primary btn-lg btn-full" disabled>Sold Out</button>
        </div>
      ` : `
        <div class="flex items-center gap-4">
          <div class="qty-selector" id="qty-selector">
            <button class="qty-selector__btn" id="qty-decrease" aria-label="Decrease">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <span class="qty-selector__value" id="qty-value">1</span>
            <button class="qty-selector__btn" id="qty-increase" aria-label="Increase">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
        <div class="product-info__ctas">
          <button class="btn btn-primary btn-lg btn-full" id="add-to-cart-btn">Add to Cart</button>
          <button class="btn btn-accent btn-lg btn-full" id="buy-now-btn">Buy It Now</button>
        </div>
      `}

      <!-- Trust Row -->
      <div class="product-trust-row">
        <div class="product-trust-item">
          <svg class="product-trust-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          <span class="product-trust-item__text">${isMadeToOrder ? 'Ships in 5–7 days' : 'Ready to ship'}</span>
        </div>
        <div class="product-trust-item">
          <svg class="product-trust-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span class="product-trust-item__text">Secure Payment</span>
        </div>
        <div class="product-trust-item">
          <svg class="product-trust-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
          <span class="product-trust-item__text">Easy Replacement</span>
        </div>
        <div class="product-trust-item">
          <svg class="product-trust-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          <span class="product-trust-item__text">Registered Business</span>
        </div>
      </div>

      <!-- FAQ -->
      <div class="product-faq">
        <h3 class="product-faq__title">Frequently Asked Questions</h3>
        <div class="faq-list" id="product-faq-list">
          <div class="faq-item">
            <button class="faq-item__question">How long will delivery take?<svg class="faq-item__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
            <div class="faq-item__answer">${isMadeToOrder ? 'Made-to-order items take 5–7 days to produce, then' : 'We'} ship via Normal (7–10 days) or Speed (3–5 days) delivery.</div>
          </div>
          <div class="faq-item">
            <button class="faq-item__question">What if my item arrives damaged?<svg class="faq-item__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
            <div class="faq-item__answer">Email us within 48 hours with photos and we'll reprint or refund — no questions asked.</div>
          </div>
          <div class="faq-item">
            <button class="faq-item__question">Is my payment secure?<svg class="faq-item__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
            <div class="faq-item__answer">Yes! All payments are processed securely through Razorpay. We never store your card details.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ─ Event Listeners ─

  // Gallery thumbs
  layout.querySelectorAll('.product-gallery__thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = Number(thumb.dataset.index);
      const mainImg = document.getElementById('main-image');
      if (mainImg && images[idx]) {
        mainImg.src = images[idx];
        layout.querySelectorAll('.product-gallery__thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      }
    });
  });

  // Quantity
  let quantity = 1;
  const qtyValue = document.getElementById('qty-value');
  document.getElementById('qty-decrease')?.addEventListener('click', () => {
    if (quantity > 1) { quantity--; qtyValue.textContent = quantity; }
  });
  document.getElementById('qty-increase')?.addEventListener('click', () => {
    quantity++; qtyValue.textContent = quantity;
  });

  // Add to Cart
  document.getElementById('add-to-cart-btn')?.addEventListener('click', () => {
    addToCart(currentProduct, quantity);
  });

  // Buy It Now — add to cart and go straight to checkout
  document.getElementById('buy-now-btn')?.addEventListener('click', () => {
    addToCart(currentProduct, quantity);
    window.location.href = '/checkout.html';
  });

  // Product FAQ accordion
  layout.querySelectorAll('.faq-item__question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      layout.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

function renderRelatedProducts(product) {
  const section = document.getElementById('related-products');
  const grid = document.getElementById('related-grid');
  if (!section || !grid) return;

  const related = allProducts
    .filter(p => p.category === product.category && p.id !== product.id && p.category !== 'engineering')
    .slice(0, 4);

  if (related.length === 0) return;

  section.style.display = 'block';
  grid.innerHTML = related.map(p => {
    const img = p.image_urls ? resolveImageUrl(p.image_urls.split(',')[0].trim()) : '';
    const disc = getDiscountPercent(p.price, p.actual_price);
    return `
      <article class="product-card">
        <a href="/product.html?id=${p.id}" class="product-card__image-wrap">
          <img class="product-card__image" src="${img}" alt="${p.name}" loading="lazy"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 400%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22400%22/%3E%3C/svg%3E'" />
          ${disc > 0 ? `<div class="product-card__badges"><span class="badge badge-sale">Save ${disc}%</span></div>` : ''}
        </a>
        <div class="product-card__body">
          <h3 class="product-card__name"><a href="/product.html?id=${p.id}">${p.name}</a></h3>
          <div class="product-card__pricing">
            <span class="product-card__price">${formatCurrency(p.price)}</span>
            ${disc > 0 ? `<span class="product-card__compare-price">${formatCurrency(p.actual_price)}</span>` : ''}
          </div>
        </div>
      </article>`;
  }).join('');
}

function showNotFound() {
  const layout = document.getElementById('product-layout');
  if (layout) {
    layout.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state__icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        <h2 class="empty-state__title">Product not found</h2>
        <p class="empty-state__desc">This product doesn't exist or has been removed.</p>
        <a href="/" class="btn btn-primary btn-md">Browse Products</a>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', loadProduct);
