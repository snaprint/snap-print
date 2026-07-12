/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Catalog (Fully Parametric)
   
   All products, categories, prices, and images are driven
   entirely by the Google Sheets CSV. No hardcoded values.
   Add a new category or product in the Sheet and it appears
   automatically on the next page load — no redeployment needed.
   ═══════════════════════════════════════════════════════════════ */

import {
  getSampleProducts, CONFIG, fetchCSV, addToCart,
  formatCurrency, getDiscountPercent, debounce, renderSkeletons, showToast,
} from './utils.js';

let allProducts = [];
let filteredProducts = [];
let activeCategory = 'all';
let searchQuery = '';

// ── Resolve Image URL ──
// Converts GitHub blob URLs to raw URLs so they work in <img> tags.
// Also handles raw.githubusercontent.com, local paths, and external URLs.
function resolveImageUrl(url) {
  if (!url) return '';
  url = url.trim();

  // Already a raw GitHub URL — good
  if (url.startsWith('https://raw.githubusercontent.com/')) return url;

  // GitHub blob URL → convert to raw
  // e.g. https://github.com/user/repo/blob/main/path/img.png
  //   → https://raw.githubusercontent.com/user/repo/main/path/img.png
  const blobMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (blobMatch) {
    return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
  }

  // Local path (starts with /) — works as-is from same domain
  if (url.startsWith('/')) return url;

  // Any other external URL — use as-is
  return url;
}

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

    // Build dynamic category tiles from the data
    buildCategoryTiles();

    // Check URL for category
    const params = new URLSearchParams(window.location.search);
    const urlCategory = params.get('category');
    if (urlCategory) {
      // Accept any category from the URL — no hardcoded whitelist
      const validCategories = [...new Set(allProducts.map(p => p.category?.toLowerCase()).filter(Boolean))];
      if (validCategories.includes(urlCategory.toLowerCase())) {
        activeCategory = urlCategory.toLowerCase();
      }
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

// ── Build Dynamic Category Tiles ──
function buildCategoryTiles() {
  const scroll = document.getElementById('category-scroll');
  if (!scroll) return;

  // Extract unique categories from product data
  const categoryMap = {};
  allProducts.forEach(product => {
    const cat = product.category?.toLowerCase();
    if (!cat) return;
    if (!categoryMap[cat]) {
      // Use the first product's image as the category tile image
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

  // Build HTML: "All" tile first, then each category from the Sheet
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

  // Re-init click handlers on the newly created tiles
  initCategoryTiles();

  // Also populate footer shop links dynamically
  const footerLinks = document.getElementById('footer-shop-links');
  if (footerLinks) {
    // Insert category links before the "Custom Parts" link
    const customPartsLink = footerLinks.querySelector('a[href="/quote.html"]');
    categories.forEach(cat => {
      if (cat.name === 'engineering') return; // skip — already have "Custom Parts"
      const link = document.createElement('a');
      link.href = `/?category=${cat.name}`;
      link.className = 'footer__link';
      link.textContent = cat.label;
      footerLinks.insertBefore(link, customPartsLink);
    });
  }
}

// ── Apply Filters ──
function applyFilters() {
  filteredProducts = allProducts.filter(product => {
    const matchesCategory = activeCategory === 'all' || product.category?.toLowerCase() === activeCategory;
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
    const imageUrl = resolveImageUrl(product.image_urls ? product.image_urls.split(',')[0].trim() : '');
    const isEngineering = product.category?.toLowerCase() === 'engineering';
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
  initSearch();
  loadProducts();
});
