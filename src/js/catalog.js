/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Catalog
   Product grid with discount pricing, category tiles, search
   ═══════════════════════════════════════════════════════════════ */

import {
  getSampleProducts, CONFIG, fetchCSV, addToCart,
  formatCurrency, getDiscountPercent, debounce, renderSkeletons, showToast,
} from './utils.js';

let allProducts = [];
let filteredProducts = [];
let activeCategory = 'all';
let searchQuery = '';

// ── Load Products ──
async function loadProducts() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  renderSkeletons(grid, 8);

  try {
    if (CONFIG.PRODUCTS_CSV_URL) {
      allProducts = await fetchCSV(CONFIG.PRODUCTS_CSV_URL);
    } else {
      allProducts = getSampleProducts();
    }

    allProducts = allProducts.filter(p => p.active?.toLowerCase() === 'yes');

    // Check URL for category
    const params = new URLSearchParams(window.location.search);
    const urlCategory = params.get('category');
    if (urlCategory && ['toys', 'decor', 'engineering'].includes(urlCategory)) {
      activeCategory = urlCategory;
      updateCategoryTiles();
    }

    applyFilters();
  } catch (err) {
    console.error('Failed to load products:', err);
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
        <h3 class="empty-state__title">Unable to load products</h3>
        <p class="empty-state__desc">Please check your connection and try again.</p>
        <button class="btn btn-primary btn-md" onclick="location.reload()">Retry</button>
      </div>`;
  }
}

// ── Apply Filters ──
function applyFilters() {
  filteredProducts = allProducts.filter(product => {
    const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
    const matchesSearch = !searchQuery ||
      product.name.toLowerCase().includes(searchQuery) ||
      product.description?.toLowerCase().includes(searchQuery) ||
      product.category?.toLowerCase().includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  renderProducts(filteredProducts);
  updateProductCount();
}

// ── Render Product Cards ──
function renderProducts(products) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
        <h3 class="empty-state__title">No products found</h3>
        <p class="empty-state__desc">Try adjusting your search or filter.</p>
      </div>`;
    return;
  }

  grid.innerHTML = products.map((product, index) => {
    const imageUrl = product.image_urls ? product.image_urls.split(',')[0].trim() : '';
    const isEngineering = product.category === 'engineering';
    const isOutOfStock = !isEngineering && product.stock !== '' && Number(product.stock) <= 0 && product.made_to_order !== 'yes';
    const isMadeToOrder = product.made_to_order === 'yes';
    const discount = getDiscountPercent(product.price, product.compare_price);
    const stagger = `stagger-${(index % 6) + 1}`;
    const href = isEngineering ? '/quote.html' : `/product.html?id=${product.id}`;

    return `
      <article class="product-card animate-fade-in-up ${stagger}" role="listitem">
        <a href="${href}" class="product-card__image-wrap">
          <img class="product-card__image" src="${imageUrl}" alt="${product.name}" loading="lazy"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 400 400%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22400%22/%3E%3Ctext fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2214%22 x=%22200%22 y=%22200%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E'" />
          <div class="product-card__badges">
            ${discount > 0 ? `<span class="badge badge-sale">Save ${discount}%</span>` : ''}
            ${isMadeToOrder ? '<span class="badge badge-made-to-order">Made to Order</span>' : ''}
            ${isOutOfStock ? '<span class="badge badge-out-of-stock">Sold Out</span>' : ''}
          </div>
        </a>
        <div class="product-card__body">
          <h3 class="product-card__name"><a href="${href}">${product.name}</a></h3>
          <div class="product-card__pricing">
            ${isEngineering
              ? '<span style="font-size:var(--text-sm);color:var(--text-secondary);">Get a Quote</span>'
              : `
                <span class="product-card__price">${formatCurrency(product.price)}</span>
                ${discount > 0 ? `<span class="product-card__compare-price">${formatCurrency(product.compare_price)}</span>` : ''}
              `}
          </div>
        </div>
      </article>`;
  }).join('');
}

// ── Update Count ──
function updateProductCount() {
  const el = document.getElementById('product-count');
  if (el) el.textContent = `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''}`;
}

// ── Category Tiles ──
function updateCategoryTiles() {
  document.querySelectorAll('.category-tile').forEach(tile => {
    tile.classList.toggle('active', tile.dataset.category === activeCategory);
  });
}

function initCategoryTiles() {
  const scroll = document.getElementById('category-scroll');
  if (!scroll) return;

  scroll.addEventListener('click', (e) => {
    const tile = e.target.closest('.category-tile');
    if (!tile) return;
    e.preventDefault();

    activeCategory = tile.dataset.category || 'all';
    updateCategoryTiles();
    applyFilters();

    const url = new URL(window.location);
    if (activeCategory === 'all') {
      url.searchParams.delete('category');
    } else {
      url.searchParams.set('category', activeCategory);
    }
    window.history.replaceState({}, '', url);

    // Scroll to products
    document.getElementById('best-sellers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ── Search ──
function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;

  const debouncedSearch = debounce((query) => {
    searchQuery = query.toLowerCase().trim();
    applyFilters();
  }, 250);

  input.addEventListener('input', (e) => debouncedSearch(e.target.value));
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  initCategoryTiles();
  initSearch();
  loadProducts();
});
