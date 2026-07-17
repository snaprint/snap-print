/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Catalog (Fully Parametric)
   
   Display-layer only. All products, categories, prices, and
   images are driven by the Google Sheets CSV.

   Features:
   - Search (debounced, matches name + description)
   - Sort (price, name)
   - Filters (category, price range, in-stock, material)
   - URL state (shareable, bookmarkable, back-button friendly)
   - Dynamic category tiles and footer links from Sheet data
   
   NO server calls for filtering — everything operates on the
   already-fetched product array.
   ═══════════════════════════════════════════════════════════════ */

import {
  getSampleProducts, CONFIG, fetchCSV, fetchActiveProducts, extractCategories,
  addToCart, formatCurrency, getDiscountPercent, debounce, renderSkeletons,
  showToast, resolveImageUrl,
} from './utils.js';

// ── State ──
let allProducts = [];      // full active product list (never mutated after load)
let filteredProducts = [];  // result after applying all filters + sort

let state = {
  category: 'all',
  search: '',
  sort: 'default',
  priceMin: null,
  priceMax: null,
  inStockOnly: false,
  material: '',           // empty string = all materials
};

// ── Buyability check (reused by in-stock filter + card badges) ──
function isBuyable(product) {
  if (product.category?.toLowerCase() === 'engineering') return true; // quote-based
  if (product.made_to_order === 'yes') return true;
  const stock = Number(product.stock);
  return stock > 0;
}

// ═══════════════════════════════════════════════════════════════
// Load Products
// ═══════════════════════════════════════════════════════════════
async function loadProducts() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  renderSkeletons(grid, 8);

  try {
    if (CONFIG.PRODUCTS_CSV_URL) {
      allProducts = await fetchActiveProducts();
    } else {
      allProducts = getSampleProducts();
    }

    // Build dynamic UI elements from the data
    buildCategoryTiles();
    buildMaterialChips();

    // Restore state from URL (must happen after data is loaded)
    readStateFromURL();
    syncUIToState();

    applyFiltersAndRender();
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

// ═══════════════════════════════════════════════════════════════
// URL State — read / write
// ═══════════════════════════════════════════════════════════════
function readStateFromURL() {
  const params = new URLSearchParams(window.location.search);

  const urlCategory = params.get('category');
  if (urlCategory) {
    const validCategories = getUniqueCategories();
    state.category = validCategories.includes(urlCategory.toLowerCase())
      ? urlCategory.toLowerCase()
      : 'all';
  }

  state.search = params.get('q') || '';
  state.sort = params.get('sort') || 'default';

  const pMin = params.get('price_min');
  const pMax = params.get('price_max');
  state.priceMin = pMin ? Number(pMin) : null;
  state.priceMax = pMax ? Number(pMax) : null;

  state.inStockOnly = params.get('in_stock') === '1';
  state.material = params.get('material') || '';
}

function writeStateToURL() {
  const url = new URL(window.location);
  const p = url.searchParams;

  // Set or delete each param
  setOrDelete(p, 'category', state.category !== 'all' ? state.category : null);
  setOrDelete(p, 'q', state.search || null);
  setOrDelete(p, 'sort', state.sort !== 'default' ? state.sort : null);
  setOrDelete(p, 'price_min', state.priceMin !== null ? String(state.priceMin) : null);
  setOrDelete(p, 'price_max', state.priceMax !== null ? String(state.priceMax) : null);
  setOrDelete(p, 'in_stock', state.inStockOnly ? '1' : null);
  setOrDelete(p, 'material', state.material || null);

  window.history.replaceState({}, '', url);
}

function setOrDelete(params, key, value) {
  if (value !== null && value !== undefined) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}

// Sync UI controls to current state (e.g. after URL restore)
function syncUIToState() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = state.search;

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) sortSelect.value = state.sort;

  const priceMin = document.getElementById('price-min');
  if (priceMin) priceMin.value = state.priceMin ?? '';

  const priceMax = document.getElementById('price-max');
  if (priceMax) priceMax.value = state.priceMax ?? '';

  const inStockCheckbox = document.getElementById('filter-in-stock');
  if (inStockCheckbox) inStockCheckbox.checked = state.inStockOnly;

  // Material chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.material === state.material);
  });

  updateCategoryTiles();
}

// ═══════════════════════════════════════════════════════════════
// Filter + Sort + Render Pipeline
// ═══════════════════════════════════════════════════════════════
function applyFiltersAndRender() {
  const query = state.search.toLowerCase().trim();

  // 1. Filter
  filteredProducts = allProducts.filter(product => {
    // Category
    if (state.category !== 'all' && product.category?.toLowerCase() !== state.category) return false;

    // Search (name + description)
    if (query) {
      const nameMatch = product.name?.toLowerCase().includes(query);
      const descMatch = product.description?.toLowerCase().includes(query);
      if (!nameMatch && !descMatch) return false;
    }

    // Price range (skip for engineering / quote-based)
    const price = Number(product.price);
    if (product.category?.toLowerCase() !== 'engineering') {
      if (state.priceMin !== null && price < state.priceMin) return false;
      if (state.priceMax !== null && price > state.priceMax) return false;
    }

    // In stock only
    if (state.inStockOnly && !isBuyable(product)) return false;

    // Material
    if (state.material && product.material?.toLowerCase() !== state.material.toLowerCase()) return false;

    return true;
  });

  // 2. Sort
  sortProducts(filteredProducts, state.sort);

  // 3. Render
  renderProducts(filteredProducts);
  updateProductCount();
  updateActiveFilterCount();
  writeStateToURL();
}

function sortProducts(products, sortKey) {
  switch (sortKey) {
    case 'price-asc':
      products.sort((a, b) => Number(a.price) - Number(b.price));
      break;
    case 'price-desc':
      products.sort((a, b) => Number(b.price) - Number(a.price));
      break;
    case 'name-asc':
      products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
    case 'name-desc':
      products.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      break;
    default:
      // No sort — keep CSV order
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// Render Product Cards
// ═══════════════════════════════════════════════════════════════
function renderProducts(products) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  if (products.length === 0) {
    const queryDisplay = state.search ? ` for "<strong>${escapeHtml(state.search)}</strong>"` : '';
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
        <h3 class="empty-state__title">No products found${queryDisplay}</h3>
        <p class="empty-state__desc">Try adjusting your search or filters.</p>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('clear-all-filters').click()">Clear All Filters</button>
      </div>`;
    return;
  }

  grid.innerHTML = products.map((product, index) => {
    const imageUrl = resolveImageUrl(product.image_urls ? product.image_urls.split(',')[0].trim() : '');
    const isEngineering = product.category?.toLowerCase() === 'engineering';
    const isOutOfStock = !isEngineering && !isBuyable(product);
    const isMadeToOrder = product.made_to_order === 'yes';
    const discount = getDiscountPercent(product.price, product.actual_price);
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
                ${discount > 0 ? `<span class="product-card__compare-price">${formatCurrency(product.actual_price)}</span>` : ''}
              `}
          </div>
        </div>
      </article>`;
  }).join('');
}

function escapeHtml(text) {
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ═══════════════════════════════════════════════════════════════
// Product Count + Active Filter Badge
// ═══════════════════════════════════════════════════════════════
function updateProductCount() {
  const el = document.getElementById('product-count');
  if (!el) return;
  const showing = filteredProducts.length;
  const total = allProducts.length;
  el.textContent = showing === total
    ? `${total} product${total !== 1 ? 's' : ''}`
    : `Showing ${showing} of ${total} products`;
}

function updateActiveFilterCount() {
  let count = 0;
  if (state.category !== 'all') count++;
  if (state.search) count++;
  if (state.priceMin !== null) count++;
  if (state.priceMax !== null) count++;
  if (state.inStockOnly) count++;
  if (state.material) count++;
  if (state.sort !== 'default') count++;

  const badge = document.getElementById('active-filter-count');
  if (badge) {
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }
}

// ═══════════════════════════════════════════════════════════════
// Dynamic Category Tiles
// ═══════════════════════════════════════════════════════════════
function getUniqueCategories() {
  return [...new Set(allProducts.map(p => p.category?.toLowerCase()).filter(Boolean))];
}

function buildCategoryTiles() {
  const scroll = document.getElementById('category-scroll');
  if (!scroll) return;

  const categoryMap = {};
  allProducts.forEach(product => {
    const cat = product.category?.toLowerCase();
    if (!cat) return;
    if (!categoryMap[cat]) {
      const imgUrl = product.image_urls ? product.image_urls.split(',')[0].trim() : '';
      categoryMap[cat] = {
        name: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        image: resolveImageUrl(imgUrl),
        count: 0,
      };
    }
    categoryMap[cat].count++;
  });

  const categories = Object.values(categoryMap);

  scroll.innerHTML = `
    <a href="/?category=all" class="category-tile active" data-category="all">
      <div class="category-tile__image">
        <svg viewBox="0 0 100 100" style="width:100%;height:100%;background:var(--bg-muted);"><text x="50" y="55" font-family="sans-serif" font-size="28" fill="var(--text-secondary)" text-anchor="middle">All</text></svg>
      </div>
      <span class="category-tile__label">All (${allProducts.length})</span>
    </a>
    ${categories.map(cat => `
      <a href="/?category=${cat.name}" class="category-tile" data-category="${cat.name}">
        <div class="category-tile__image">
          ${cat.image
            ? `<img src="${cat.image}" alt="${cat.label}" loading="lazy" onerror="this.parentElement.innerHTML='<svg viewBox=\\'0 0 100 100\\' style=\\'width:100%;height:100%;background:var(--bg-muted)\\'><text x=\\'50\\' y=\\'55\\' font-family=\\'sans-serif\\' font-size=\\'14\\' fill=\\'var(--text-secondary)\\' text-anchor=\\'middle\\'>${cat.label}</text></svg>'" />`
            : `<svg viewBox="0 0 100 100" style="width:100%;height:100%;background:var(--bg-muted);"><text x="50" y="55" font-family="sans-serif" font-size="14" fill="var(--text-secondary)" text-anchor="middle">${cat.label}</text></svg>`
          }
        </div>
        <span class="category-tile__label">${cat.label} (${cat.count})</span>
      </a>
    `).join('')}
  `;

  initCategoryTiles();

  // Also populate footer shop links
  const footerLinks = document.getElementById('footer-shop-links');
  if (footerLinks) {
    const customPartsLink = footerLinks.querySelector('a[href="/quote.html"]');
    categories.forEach(cat => {
      if (cat.name === 'engineering') return;
      const link = document.createElement('a');
      link.href = `/?category=${cat.name}`;
      link.className = 'footer__link';
      link.textContent = cat.label;
      footerLinks.insertBefore(link, customPartsLink);
    });
  }
}

function updateCategoryTiles() {
  document.querySelectorAll('.category-tile').forEach(tile => {
    tile.classList.toggle('active', tile.dataset.category === state.category);
  });
}

function initCategoryTiles() {
  const scroll = document.getElementById('category-scroll');
  if (!scroll) return;

  scroll.addEventListener('click', (e) => {
    const tile = e.target.closest('.category-tile');
    if (!tile) return;
    e.preventDefault();

    state.category = tile.dataset.category || 'all';
    updateCategoryTiles();
    applyFiltersAndRender();

    document.getElementById('best-sellers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ═══════════════════════════════════════════════════════════════
// Dynamic Material Chips
// ═══════════════════════════════════════════════════════════════
function buildMaterialChips() {
  const group = document.getElementById('material-filter-group');
  const container = document.getElementById('material-chips');
  if (!group || !container) return;

  const materials = [...new Set(
    allProducts
      .map(p => p.material?.trim())
      .filter(Boolean)
      .filter(m => m.toLowerCase() !== 'various' && m.toLowerCase() !== 'custom')
  )].sort();

  if (materials.length < 2) return; // not useful with 0 or 1 material

  group.style.display = '';
  const divider = document.getElementById('material-filter-divider');
  if (divider) divider.style.display = '';

  container.innerHTML = `
    <button class="filter-chip active" data-material="">All</button>
    ${materials.map(m => `<button class="filter-chip" data-material="${m}">${m}</button>`).join('')}
  `;

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;

    state.material = chip.dataset.material || '';
    container.querySelectorAll('.filter-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.material === state.material);
    });
    applyFiltersAndRender();
  });
}

// ═══════════════════════════════════════════════════════════════
// Event Listeners — Search, Sort, Filters
// ═══════════════════════════════════════════════════════════════
function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;

  const debouncedSearch = debounce((query) => {
    state.search = query;
    applyFiltersAndRender();
  }, 250);

  input.addEventListener('input', (e) => debouncedSearch(e.target.value));
}

function initSort() {
  const select = document.getElementById('sort-select');
  if (!select) return;

  select.addEventListener('change', () => {
    state.sort = select.value;
    applyFiltersAndRender();
  });
}

function initFilterDrawer() {
  const toggleBtn = document.getElementById('filter-toggle-btn');
  const drawer = document.getElementById('filter-drawer');
  if (!toggleBtn || !drawer) return;

  toggleBtn.addEventListener('click', () => {
    const isOpen = drawer.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', isOpen);
    drawer.setAttribute('aria-hidden', !isOpen);
  });
}

function initPriceFilter() {
  const minInput = document.getElementById('price-min');
  const maxInput = document.getElementById('price-max');
  if (!minInput || !maxInput) return;

  const debouncedPrice = debounce(() => {
    const min = minInput.value ? Number(minInput.value) : null;
    const max = maxInput.value ? Number(maxInput.value) : null;
    state.priceMin = (min !== null && !isNaN(min) && min >= 0) ? min : null;
    state.priceMax = (max !== null && !isNaN(max) && max >= 0) ? max : null;
    applyFiltersAndRender();
  }, 300);

  minInput.addEventListener('input', debouncedPrice);
  maxInput.addEventListener('input', debouncedPrice);
}

function initInStockFilter() {
  const checkbox = document.getElementById('filter-in-stock');
  if (!checkbox) return;

  checkbox.addEventListener('change', () => {
    state.inStockOnly = checkbox.checked;
    applyFiltersAndRender();
  });
}

function initClearAll() {
  const btn = document.getElementById('clear-all-filters');
  if (!btn) return;

  btn.addEventListener('click', () => {
    state.category = 'all';
    state.search = '';
    state.sort = 'default';
    state.priceMin = null;
    state.priceMax = null;
    state.inStockOnly = false;
    state.material = '';

    syncUIToState();
    applyFiltersAndRender();
  });
}

// ═══════════════════════════════════════════════════════════════
// Hero Image Carousel
// ═══════════════════════════════════════════════════════════════
let heroInterval = null;

async function loadHeroCarousel() {
  const track = document.getElementById('hero-carousel-track');
  const dotsContainer = document.getElementById('hero-carousel-dots');
  if (!track || !dotsContainer) return;

  if (!CONFIG.HERO_IMAGES_CSV_URL) return; // No URL configured — keep fallback

  try {
    const rows = await fetchCSV(CONFIG.HERO_IMAGES_CSV_URL);

    // Column B = second column. PapaParse uses headers from row 1.
    // Get the header name for column B (second key in each row object)
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const colBKey = headers[1]; // Column B is the second header

    if (!colBKey) return; // No column B header

    // Extract non-empty image URLs from column B
    const imageUrls = rows
      .map(row => row[colBKey]?.trim())
      .filter(Boolean)
      .map(url => resolveImageUrl(url));

    if (imageUrls.length === 0) return; // Keep fallback

    // Build slides
    track.innerHTML = imageUrls.map((url, i) => `
      <div class="hero__slide ${i === 0 ? 'active' : ''}">
        <img src="${url}" alt="Snap Print – Image ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" />
      </div>
    `).join('');

    // Build dots (only if more than 1 image)
    if (imageUrls.length > 1) {
      dotsContainer.innerHTML = imageUrls.map((_, i) => `
        <button class="hero__carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}" aria-label="Go to slide ${i + 1}"></button>
      `).join('');

      // Dot click handlers
      dotsContainer.addEventListener('click', (e) => {
        const dot = e.target.closest('.hero__carousel-dot');
        if (!dot) return;
        const index = Number(dot.dataset.index);
        goToSlide(index);
        resetAutoplay();
      });

      // Start auto-advancing
      startAutoplay();
    }

  } catch (err) {
    console.warn('Hero carousel fetch failed — keeping fallback image:', err.message);
  }
}

function goToSlide(index) {
  const slides = document.querySelectorAll('.hero__slide');
  const dots = document.querySelectorAll('.hero__carousel-dot');
  if (slides.length === 0) return;

  slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
}

function startAutoplay() {
  const slides = document.querySelectorAll('.hero__slide');
  if (slides.length <= 1) return;

  heroInterval = setInterval(() => {
    const currentIndex = [...slides].findIndex(s => s.classList.contains('active'));
    const nextIndex = (currentIndex + 1) % slides.length;
    goToSlide(nextIndex);
  }, 4500); // 4.5 seconds
}

function resetAutoplay() {
  clearInterval(heroInterval);
  startAutoplay();
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initSearch();
  initSort();
  initFilterDrawer();
  initPriceFilter();
  initInStockFilter();
  initClearAll();
  loadProducts();
  loadHeroCarousel();
});
