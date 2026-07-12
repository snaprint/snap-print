/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Shared Utilities
   Cart, formatting, toast, helpers, sample data
   ═══════════════════════════════════════════════════════════════ */

const CART_KEY = 'snaprint_cart';

// ── Currency Formatting ──
export function formatCurrency(amount) {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

// ── Discount Calculation ──
export function getDiscountPercent(price, comparePrice) {
  const p = Number(price);
  const cp = Number(comparePrice);
  if (!cp || cp <= p) return 0;
  return Math.round(((cp - p) / cp) * 100);
}

// ── Cart ──
export function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}

export function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('cart-updated', { detail: { cart } }));
}

export function addToCart(product, quantity = 1) {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      compare_price: Number(product.compare_price) || 0,
      weight_g: Number(product.weight_g) || 0,
      image: product.image_urls ? product.image_urls.split(',')[0].trim() : '',
      material: product.material || '',
      quantity,
    });
  }
  setCart(cart);
  showToast(`${product.name} added to cart`, 'success');
}

export function removeFromCart(productId) {
  setCart(getCart().filter(item => item.id !== productId));
}

export function updateQuantity(productId, quantity) {
  const cart = getCart();
  const item = cart.find(item => item.id === productId);
  if (item) item.quantity = Math.max(1, quantity);
  setCart(cart);
}

export function clearCart() { setCart([]); }

export function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

export function getCartSubtotal() {
  return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function getCartWeight() {
  return getCart().reduce((sum, item) => sum + (item.weight_g || 0) * item.quantity, 0);
}

// ── Cart Badge ──
export function updateCartBadge() {
  const badges = document.querySelectorAll('.cart-badge');
  const count = getCartCount();
  badges.forEach(badge => {
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  });
}

// ── Toast ──
let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

const TOAST_ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

export function showToast(message, type = 'info', duration = 3500) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
    <span class="toast__message">${message}</span>
    <button class="toast__close" aria-label="Dismiss"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  `;
  const dismiss = () => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 250); };
  toast.querySelector('.toast__close').addEventListener('click', dismiss);
  container.appendChild(toast);
  if (duration > 0) setTimeout(dismiss, duration);
}

// ── Debounce ──
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ── Config (reads from Vite env vars at build time) ──
export const CONFIG = {
  PRODUCTS_CSV_URL: import.meta.env.VITE_PRODUCTS_CSV_URL || '',
  SHIPPING_RATES_CSV_URL: import.meta.env.VITE_SHIPPING_RATES_CSV_URL || '',
  RAZORPAY_KEY_ID: import.meta.env.VITE_RAZORPAY_KEY_ID || '',
  API_BASE: '/api',
};

// ── CSV Helper ──
export async function fetchCSV(url) {
  const Papa = (await import('papaparse')).default;
  // Bypasses browser cache by adding a unique timestamp to the query string
  const cacheBusterUrl = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
  const response = await fetch(cacheBusterUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.status}`);
  const text = await response.text();
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

// ── Sample Products (with compare_price for discount display) ──
export function getSampleProducts() {
  return [
    {
      id: 'TOY-001', name: 'Dragon Figurine', category: 'toys',
      price: '499', compare_price: '699', weight_g: '120', stock: '5', made_to_order: 'no',
      image_urls: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=600&fit=crop',
      description: 'Detailed articulated dragon figurine with movable joints. Printed in high-quality PLA with a smooth finish.',
      material: 'PLA', dimensions: '15×8×10 cm', active: 'yes',
    },
    {
      id: 'TOY-002', name: 'Mecha Robot Action Figure', category: 'toys',
      price: '799', compare_price: '999', weight_g: '180', stock: '3', made_to_order: 'no',
      image_urls: 'https://images.unsplash.com/photo-1535378620166-273708d44e4c?w=600&h=600&fit=crop',
      description: 'Fully posable mecha robot with swappable weapons. Premium detailing with metallic PLA finish.',
      material: 'PLA', dimensions: '20×12×8 cm', active: 'yes',
    },
    {
      id: 'TOY-003', name: 'Puzzle Cube Set', category: 'toys',
      price: '349', compare_price: '', weight_g: '90', stock: '10', made_to_order: 'no',
      image_urls: 'https://images.unsplash.com/photo-1591991731833-b4807cf7ef94?w=600&h=600&fit=crop',
      description: 'Interlocking 3D printed puzzle cube set. Great brain teaser for kids and adults.',
      material: 'PLA', dimensions: '6×6×6 cm', active: 'yes',
    },
    {
      id: 'DEC-001', name: 'Geometric Vase', category: 'decor',
      price: '599', compare_price: '799', weight_g: '200', stock: '0', made_to_order: 'yes',
      image_urls: 'https://images.unsplash.com/photo-1581783898377-1c85bf937427?w=600&h=600&fit=crop',
      description: 'Modern geometric vase with intricate low-poly design. Perfect centerpiece for any room.',
      material: 'PLA', dimensions: '12×12×20 cm', active: 'yes',
    },
    {
      id: 'DEC-002', name: 'Moon Lamp', category: 'decor',
      price: '899', compare_price: '1199', weight_g: '250', stock: '2', made_to_order: 'no',
      image_urls: 'https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=600&h=600&fit=crop',
      description: 'Realistic textured moon lamp with warm LED lighting. Lithophane technology creates stunning effects.',
      material: 'PLA', dimensions: '15×15×15 cm', active: 'yes',
    },
    {
      id: 'DEC-003', name: 'Abstract Waves Wall Art', category: 'decor',
      price: '1299', compare_price: '1599', weight_g: '400', stock: '', made_to_order: 'yes',
      image_urls: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&h=600&fit=crop',
      description: 'Large 3D printed wall art panel featuring flowing wave patterns. Made to order in your choice of color.',
      material: 'PLA', dimensions: '40×30×3 cm', active: 'yes',
    },
    {
      id: 'ENG-001', name: 'Custom Engineering Part', category: 'engineering',
      price: '0', compare_price: '', weight_g: '0', stock: '', made_to_order: 'yes',
      image_urls: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&h=600&fit=crop',
      description: 'Upload your STL/STEP file and we\'ll print it to your exact specifications.',
      material: 'Various', dimensions: 'Custom', active: 'yes',
    },
    {
      id: 'TOY-004', name: 'Flexi Rex', category: 'toys',
      price: '299', compare_price: '399', weight_g: '75', stock: '0', made_to_order: 'no',
      image_urls: 'https://images.unsplash.com/photo-1587654780292-39c6a5a0631d?w=600&h=600&fit=crop',
      description: 'Flexible T-Rex printed in one piece — fully articulated and fidget-friendly!',
      material: 'PLA', dimensions: '18×5×8 cm', active: 'yes',
    },
  ];
}

// ── Sample Shipping Rates ──
export function getSampleShippingRates() {
  return [
    { method: 'normal', weight_tier: 'under_500g', price: '70' },
    { method: 'normal', weight_tier: '500g_or_more', price: '80' },
    { method: 'speed', weight_tier: 'under_500g', price: '120' },
    { method: 'speed', weight_tier: '500g_or_more', price: '150' },
  ];
}

export function getShippingCostPreview(rates, method, totalWeightG) {
  const tier = totalWeightG < 500 ? 'under_500g' : '500g_or_more';
  const rate = rates.find(r => r.method === method && r.weight_tier === tier);
  return rate ? Number(rate.price) : 0;
}

// ── Validation ──
export function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
export function isValidPhone(phone) { return /^[6-9]\d{9}$/.test(phone.replace(/[\s\-+]/g, '').replace(/^91/, '')); }

// ── Skeleton Loader ──
export function renderSkeletons(container, count = 8) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-card__image"></div>
      <div class="skeleton-card__body">
        <div class="skeleton skeleton-text skeleton-text--sm"></div>
        <div class="skeleton skeleton-text skeleton-text--lg"></div>
      </div>
    </div>
  `).join('');
}

// ── Indian PIN Code → State/District Lookup ──
// Common PIN prefixes → state mapping (first 2 digits)
const PIN_STATE_MAP = {
  '11': 'DL', '12': 'HR', '13': 'HR', '14': 'PB', '15': 'PB', '16': 'PB',
  '17': 'HP', '18': 'JK', '19': 'JK',
  '20': 'UP', '21': 'UP', '22': 'UP', '23': 'UP', '24': 'UP', '25': 'UP', '26': 'UP', '27': 'UP', '28': 'UP',
  '30': 'RJ', '31': 'RJ', '32': 'RJ', '33': 'RJ', '34': 'RJ',
  '36': 'GJ', '37': 'GJ', '38': 'GJ', '39': 'GJ',
  '40': 'MH', '41': 'MH', '42': 'MH', '43': 'MH', '44': 'MH', '45': 'MP',
  '46': 'MP', '47': 'MP', '48': 'MP', '49': 'CT',
  '50': 'TG', '51': 'TG', '52': 'AP', '53': 'AP',
  '56': 'KA', '57': 'KA', '58': 'KA', '59': 'KA',
  '60': 'TN', '61': 'TN', '62': 'TN', '63': 'TN', '64': 'TN',
  '67': 'KL', '68': 'KL', '69': 'KL',
  '70': 'WB', '71': 'WB', '72': 'WB', '73': 'WB', '74': 'WB',
  '75': 'OR', '76': 'OR', '77': 'OR',
  '78': 'AS', '79': 'AR',
  '80': 'BR', '81': 'BR', '82': 'BR', '83': 'BR', '84': 'BR', '85': 'BR',
  '86': 'JH', '90': 'MN', '91': 'MZ', '93': 'NL',
};

export function lookupPIN(pincode) {
  if (!pincode || pincode.length !== 6) return null;
  const prefix = pincode.substring(0, 2);
  const state = PIN_STATE_MAP[prefix];
  if (!state) return null;
  return { state };
}
