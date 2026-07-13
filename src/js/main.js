/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Main (shared across all pages)
   Navbar, mobile menu, cart badge, scroll animations,
   global search, and shop category dropdown
   ═══════════════════════════════════════════════════════════════ */

import {
  updateCartBadge, fetchActiveProducts, extractCategories,
} from './utils.js';

// ── Detect if we're on the catalog (homepage) ──
function isCatalogPage() {
  const p = window.location.pathname;
  return p === '/' || p === '/index.html';
}

// ═══════════════════════════════════════════════════════════════
// Navbar
// ═══════════════════════════════════════════════════════════════
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  const hamburger = document.querySelector('.navbar__hamburger');
  const mobileMenu = document.querySelector('.navbar__mobile-menu');

  if (!navbar) return;

  // Mobile menu toggle
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = hamburger.classList.toggle('open');
      mobileMenu.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', isOpen);
    });

    mobileMenu.querySelectorAll('.navbar__link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', (e) => {
      if (!navbar.contains(e.target)) {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Active link
  const currentPath = window.location.pathname;
  navbar.querySelectorAll('.navbar__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (href === '/' && (currentPath === '/index.html' || currentPath === '/'))) {
      link.classList.add('active');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Global Search (injected into navbar on all pages)
// ═══════════════════════════════════════════════════════════════
function initGlobalSearch() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  const actions = navbar.querySelector('.navbar__actions');
  if (!actions) return;

  // ── Search toggle button (icon) ──
  const searchBtn = document.createElement('button');
  searchBtn.className = 'navbar__search-toggle';
  searchBtn.setAttribute('aria-label', 'Search products');
  searchBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

  const cartBtn = actions.querySelector('.cart-icon-btn');
  actions.insertBefore(searchBtn, cartBtn);

  // ── Slide-down search panel ──
  const panel = document.createElement('div');
  panel.className = 'navbar__search-panel';
  panel.innerHTML = `
    <div class="navbar__search-panel-inner">
      <svg class="navbar__search-panel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="search" class="navbar__search-panel-input" id="global-search-input" placeholder="Search products..." aria-label="Search products" autocomplete="off" />
      <button class="navbar__search-panel-close" aria-label="Close search">&times;</button>
    </div>
  `;
  navbar.appendChild(panel);

  const input = panel.querySelector('#global-search-input');
  const closeBtn = panel.querySelector('.navbar__search-panel-close');

  searchBtn.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('open');
    if (isOpen) input.focus();
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open');
  });

  // Close on Escape
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      panel.classList.remove('open');
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGlobalSearch(input.value.trim(), panel);
    }
  });

  // ── Mobile search bar (inside mobile menu) ──
  const mobileMenu = navbar.querySelector('.navbar__mobile-menu');
  if (mobileMenu) {
    const mobileSearch = document.createElement('div');
    mobileSearch.className = 'navbar__mobile-search';
    mobileSearch.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="search" class="navbar__mobile-search-input" placeholder="Search products..." aria-label="Search products" />
    `;
    mobileMenu.insertBefore(mobileSearch, mobileMenu.firstChild);

    const mobileInput = mobileSearch.querySelector('input');
    mobileInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleGlobalSearch(mobileInput.value.trim());
      }
    });
  }
}

function handleGlobalSearch(query, panel) {
  if (!query) return;

  if (isCatalogPage()) {
    // Sync with catalog's own search input for instant filtering
    const catalogInput = document.getElementById('search-input');
    if (catalogInput) {
      catalogInput.value = query;
      catalogInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (panel) panel.classList.remove('open');
    document.getElementById('best-sellers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    // Navigate to catalog with search query
    window.location.href = `/?q=${encodeURIComponent(query)}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// Shop Category Dropdown (injected into navbar on all pages)
// ═══════════════════════════════════════════════════════════════
async function initShopDropdown() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  // ── Desktop: Find the "Shop" link and wrap it in a dropdown ──
  const desktopLinks = navbar.querySelector('.navbar__links');
  const shopLink = desktopLinks
    ? [...desktopLinks.querySelectorAll('.navbar__link')].find(a => a.textContent.trim() === 'Shop')
    : null;

  let menu; // the dropdown menu element, populated after fetch

  if (shopLink) {
    const wrapper = document.createElement('div');
    wrapper.className = 'navbar__shop-wrapper';
    shopLink.parentNode.insertBefore(wrapper, shopLink);
    wrapper.appendChild(shopLink);

    // Add dropdown arrow to the link
    shopLink.insertAdjacentHTML('beforeend',
      ` <svg class="navbar__dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="6 9 12 15 18 9"/></svg>`
    );

    // Create empty dropdown menu
    menu = document.createElement('div');
    menu.className = 'navbar__dropdown-menu';
    wrapper.appendChild(menu);
  }

  // ── Fetch categories (shared cache with catalog.js) ──
  try {
    const products = await fetchActiveProducts();
    if (products.length === 0) return;

    const categories = extractCategories(products);

    // Populate desktop dropdown
    if (menu) {
      menu.innerHTML = `
        <a href="/" class="navbar__dropdown-item">
          All Products <span class="navbar__dropdown-count">${products.length}</span>
        </a>
        ${categories.map(c => `
          <a href="/?category=${c.name}" class="navbar__dropdown-item">
            ${c.label} <span class="navbar__dropdown-count">${c.count}</span>
          </a>
        `).join('')}
      `;
    }

    // Populate mobile menu categories
    const mobileMenu = navbar.querySelector('.navbar__mobile-menu');
    if (mobileMenu) {
      const mobileShopLink = [...mobileMenu.querySelectorAll('.navbar__link')].find(
        a => a.textContent.trim() === 'Shop'
      );
      if (mobileShopLink) {
        const catContainer = document.createElement('div');
        catContainer.className = 'navbar__mobile-categories';
        catContainer.innerHTML = categories.map(c =>
          `<a href="/?category=${c.name}" class="navbar__link navbar__mobile-cat-link">${c.label}</a>`
        ).join('');
        mobileShopLink.after(catContainer);
      }
    }
  } catch (err) {
    console.warn('Failed to load nav categories:', err.message);
    // Fallback: dropdown just links to homepage
    if (menu) {
      menu.innerHTML = `<a href="/" class="navbar__dropdown-item">All Products</a>`;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Scroll Animations
// ═══════════════════════════════════════════════════════════════
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fade-in-up');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
  );

  document.querySelectorAll('.scroll-animate').forEach(el => observer.observe(el));
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initGlobalSearch();
  initShopDropdown();
  initScrollAnimations();
  updateCartBadge();
});

// Sync cart badge across tabs
window.addEventListener('storage', (e) => {
  if (e.key === 'snaprint_cart') updateCartBadge();
});
