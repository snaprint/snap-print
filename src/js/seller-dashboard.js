/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Seller Dashboard JS
   Auth guard, products autocomplete, shipment form, email send
   ═══════════════════════════════════════════════════════════════ */

import { CONFIG, fetchCSV } from './utils.js';

// ── State ──
let products = [];           // Loaded from CSV
let selectedItems = [];      // { name, quantity }
let activeDropdownIndex = -1; // Keyboard navigation index

// ── DOM refs ──
const form = document.getElementById('shipment-form');
const submitBtn = document.getElementById('send-submit');
const submitText = document.getElementById('send-submit-text');
const usernameDisplay = document.getElementById('seller-username');
const logoutBtn = document.getElementById('btn-logout');
const toastEl = document.getElementById('seller-toast');
const partnerSelect = document.getElementById('shipment-partner');
const partnerOtherInput = document.getElementById('partner-other');
const itemsSearchInput = document.getElementById('items-search');
const itemsDropdown = document.getElementById('items-dropdown');
const itemsChips = document.getElementById('items-chips');

// ═══════════════════════════════════════════════════════════════
// Auth Guard
// ═══════════════════════════════════════════════════════════════

function checkAuth() {
  const token = sessionStorage.getItem('seller_token');
  const username = sessionStorage.getItem('seller_username');

  if (!token) {
    window.location.href = '/seller-login.html';
    return false;
  }

  if (usernameDisplay) {
    usernameDisplay.textContent = username || 'Seller';
  }
  return true;
}

function logout() {
  sessionStorage.removeItem('seller_token');
  sessionStorage.removeItem('seller_username');
  window.location.href = '/seller-login.html';
}

// ═══════════════════════════════════════════════════════════════
// Products Loading (for autocomplete)
// ═══════════════════════════════════════════════════════════════

async function loadProducts() {
  if (!CONFIG.PRODUCTS_CSV_URL) {
    console.warn('PRODUCTS_CSV_URL not configured — items autocomplete disabled');
    return;
  }

  try {
    const rows = await fetchCSV(CONFIG.PRODUCTS_CSV_URL);
    products = rows
      .filter(r => r.active?.toLowerCase() === 'yes' && r.name)
      .map(r => ({
        id: r.id,
        name: r.name,
        category: r.category || '',
      }));
    console.log(`Loaded ${products.length} products for autocomplete`);
  } catch (err) {
    console.warn('Failed to load products for autocomplete:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// Items Autocomplete
// ═══════════════════════════════════════════════════════════════

function initItemsAutocomplete() {
  if (!itemsSearchInput) return;

  itemsSearchInput.addEventListener('input', () => {
    const query = itemsSearchInput.value.trim().toLowerCase();
    if (query.length === 0) {
      closeDropdown();
      return;
    }
    showFilteredProducts(query);
  });

  itemsSearchInput.addEventListener('focus', () => {
    const query = itemsSearchInput.value.trim().toLowerCase();
    if (query.length > 0) {
      showFilteredProducts(query);
    }
  });

  // Keyboard navigation
  itemsSearchInput.addEventListener('keydown', (e) => {
    const items = itemsDropdown.querySelectorAll('.items-dropdown__item');
    if (!items.length && e.key !== 'Escape') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeDropdownIndex = Math.min(activeDropdownIndex + 1, items.length - 1);
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeDropdownIndex = Math.max(activeDropdownIndex - 1, 0);
      updateActiveItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeDropdownIndex >= 0 && items[activeDropdownIndex]) {
        const name = items[activeDropdownIndex].dataset.name;
        addItem(name);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
      itemsSearchInput.blur();
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.items-field')) {
      closeDropdown();
    }
  });
}

function showFilteredProducts(query) {
  // Filter products that match the query and aren't already selected
  const selectedNames = new Set(selectedItems.map(i => i.name.toLowerCase()));
  const matches = products.filter(p =>
    p.name.toLowerCase().includes(query) && !selectedNames.has(p.name.toLowerCase())
  ).slice(0, 8); // Cap at 8 results

  if (matches.length === 0) {
    itemsDropdown.innerHTML = '<div class="items-dropdown__empty">No matching products found</div>';
    itemsDropdown.classList.add('open');
    activeDropdownIndex = -1;
    return;
  }

  itemsDropdown.innerHTML = matches.map((p, idx) => {
    // Highlight matching text
    const highlighted = highlightMatch(p.name, query);
    const category = p.category ? ` <span style="color:var(--text-muted);font-size:12px;">(${escapeHtml(p.category)})</span>` : '';
    return `<div class="items-dropdown__item" data-name="${escapeHtml(p.name)}" data-index="${idx}">${highlighted}${category}</div>`;
  }).join('');

  itemsDropdown.classList.add('open');
  activeDropdownIndex = -1;

  // Click handler for items
  itemsDropdown.querySelectorAll('.items-dropdown__item').forEach(el => {
    el.addEventListener('click', () => {
      addItem(el.dataset.name);
    });
  });
}

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return `${escapeHtml(before)}<mark>${escapeHtml(match)}</mark>${escapeHtml(after)}`;
}

function updateActiveItem(items) {
  items.forEach((el, i) => {
    el.classList.toggle('active', i === activeDropdownIndex);
  });
  // Scroll active item into view
  if (activeDropdownIndex >= 0 && items[activeDropdownIndex]) {
    items[activeDropdownIndex].scrollIntoView({ block: 'nearest' });
  }
}

function closeDropdown() {
  itemsDropdown.classList.remove('open');
  activeDropdownIndex = -1;
}

// ── Selected items management ──

function addItem(name) {
  if (!name) return;

  // Check if already added
  const existing = selectedItems.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.quantity++;
    renderChips();
  } else {
    selectedItems.push({ name, quantity: 1 });
    renderChips();
  }

  itemsSearchInput.value = '';
  closeDropdown();
  itemsSearchInput.focus();
}

function removeItem(index) {
  selectedItems.splice(index, 1);
  renderChips();
}

function changeQuantity(index, delta) {
  const item = selectedItems[index];
  if (!item) return;
  item.quantity = Math.max(1, item.quantity + delta);
  renderChips();
}

function renderChips() {
  if (!itemsChips) return;

  if (selectedItems.length === 0) {
    itemsChips.innerHTML = '';
    return;
  }

  itemsChips.innerHTML = selectedItems.map((item, idx) => `
    <div class="item-chip">
      <span class="item-chip__name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
      <div class="item-chip__qty">
        <button type="button" class="item-chip__qty-btn" data-action="decrease" data-index="${idx}" aria-label="Decrease quantity">−</button>
        <span class="item-chip__qty-val">${item.quantity}</span>
        <button type="button" class="item-chip__qty-btn" data-action="increase" data-index="${idx}" aria-label="Increase quantity">+</button>
      </div>
      <button type="button" class="item-chip__remove" data-index="${idx}" aria-label="Remove ${escapeHtml(item.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `).join('');

  // Bind chip buttons
  itemsChips.querySelectorAll('.item-chip__qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index);
      const delta = btn.dataset.action === 'increase' ? 1 : -1;
      changeQuantity(index, delta);
    });
  });

  itemsChips.querySelectorAll('.item-chip__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      removeItem(Number(btn.dataset.index));
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// Shipment Partner "Other" Toggle
// ═══════════════════════════════════════════════════════════════

function initPartnerToggle() {
  if (!partnerSelect || !partnerOtherInput) return;

  partnerSelect.addEventListener('change', () => {
    if (partnerSelect.value === '__other__') {
      partnerOtherInput.classList.add('visible');
      partnerOtherInput.focus();
    } else {
      partnerOtherInput.classList.remove('visible');
      partnerOtherInput.value = '';
    }
  });
}

function getShipmentPartner() {
  if (partnerSelect.value === '__other__') {
    return partnerOtherInput.value.trim();
  }
  return partnerSelect.value;
}

// ═══════════════════════════════════════════════════════════════
// Form Submission
// ═══════════════════════════════════════════════════════════════

async function handleSubmit(e) {
  e.preventDefault();

  // Validate
  const buyerName = document.getElementById('buyer-name').value.trim();
  const buyerEmail = document.getElementById('buyer-email').value.trim();
  const orderId = document.getElementById('order-id').value.trim();
  const shipmentPartner = getShipmentPartner();
  const trackingLink = document.getElementById('tracking-link').value.trim();
  const token = sessionStorage.getItem('seller_token');

  let hasError = false;

  if (!buyerName) {
    markFieldError('group-buyer-name');
    hasError = true;
  }
  if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
    markFieldError('group-buyer-email');
    hasError = true;
  }
  if (!shipmentPartner) {
    markFieldError('group-shipment-partner');
    hasError = true;
  }

  if (hasError) return;

  if (!token) {
    showToast('Session expired — please log in again', true);
    setTimeout(() => { window.location.href = '/seller-login.html'; }, 1500);
    return;
  }

  setLoading(true);

  try {
    const response = await fetch('/api/send-shipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyerName,
        buyerEmail,
        orderId: orderId || undefined,
        shipmentPartner,
        trackingLink: trackingLink || undefined,
        items: selectedItems.length > 0 ? selectedItems : undefined,
        token,
      }),
    });

    const data = await response.json();

    if (response.status === 401) {
      showToast('Session expired — please log in again', true);
      setTimeout(() => {
        sessionStorage.removeItem('seller_token');
        sessionStorage.removeItem('seller_username');
        window.location.href = '/seller-login.html';
      }, 1500);
      return;
    }

    if (!response.ok || !data.success) {
      showToast(data.message || 'Failed to send email. Please try again.', true);
      setLoading(false);
      return;
    }

    showToast(`✓ Shipment email sent to ${buyerEmail}`);
    resetForm();

  } catch (err) {
    console.error('Send shipment error:', err);
    showToast('Something went wrong. Please try again.', true);
  } finally {
    setLoading(false);
  }
}

function resetForm() {
  form.reset();
  selectedItems = [];
  renderChips();
  partnerOtherInput.classList.remove('visible');
  partnerOtherInput.value = '';
  // Clear all error states
  form.querySelectorAll('.form-group').forEach(g => g.classList.remove('has-error'));
}

// ═══════════════════════════════════════════════════════════════
// UI Helpers
// ═══════════════════════════════════════════════════════════════

function setLoading(on) {
  submitBtn.disabled = on;
  submitText.textContent = on ? 'Sending…' : 'Send Shipment Email';
}

function markFieldError(groupId) {
  const group = document.getElementById(groupId);
  if (group) group.classList.add('has-error');
}

function showToast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('visible');
  setTimeout(() => { toastEl.classList.remove('visible'); }, 4000);
}

function escapeHtml(text) {
  const el = document.createElement('span');
  el.textContent = String(text);
  return el.innerHTML;
}

// Clear error state on input
function initFieldListeners() {
  form.querySelectorAll('.form-input, select').forEach(input => {
    input.addEventListener('input', () => {
      input.closest('.form-group')?.classList.remove('has-error');
    });
    input.addEventListener('change', () => {
      input.closest('.form-group')?.classList.remove('has-error');
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════

async function init() {
  if (!checkAuth()) return;

  initPartnerToggle();
  initItemsAutocomplete();
  initFieldListeners();

  if (form) form.addEventListener('submit', handleSubmit);
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Load products for autocomplete (non-blocking)
  loadProducts();
}

document.addEventListener('DOMContentLoaded', init);
