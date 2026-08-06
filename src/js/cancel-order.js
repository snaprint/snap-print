/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Cancel Order Page JS
   Form validation, screenshot upload, base64 encoding, API call
   ═══════════════════════════════════════════════════════════════ */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// ── DOM refs ──
const form = document.getElementById('cancel-form');
const submitBtn = document.getElementById('cancel-submit');
const submitText = document.getElementById('cancel-submit-text');
const toast = document.getElementById('cancel-toast');

const fields = {
  orderId:    document.getElementById('cancel-order-id'),
  name:       document.getElementById('cancel-name'),
  email:      document.getElementById('cancel-email'),
  phone:      document.getElementById('cancel-phone'),
  reason:     document.getElementById('cancel-reason'),
};

const screenshotZone  = document.getElementById('screenshot-zone');
const screenshotInput = document.getElementById('screenshot-input');
const screenshotThumb = document.getElementById('screenshot-thumb');
const screenshotName  = document.getElementById('screenshot-filename');
const screenshotSize  = document.getElementById('screenshot-filesize');
const screenshotRemove = document.getElementById('screenshot-remove');

let selectedFile = null;
let fileBase64 = null;

// ═══════════════════════════════════════════════════════════════
// Screenshot Drag & Drop + File Selection
// ═══════════════════════════════════════════════════════════════

function initFileUpload() {
  // Click to upload (handled by the hidden <input>)
  screenshotInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  // Drag & drop
  screenshotZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    screenshotZone.classList.add('dragover');
  });

  screenshotZone.addEventListener('dragleave', () => {
    screenshotZone.classList.remove('dragover');
  });

  screenshotZone.addEventListener('drop', (e) => {
    e.preventDefault();
    screenshotZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  // Remove file
  screenshotRemove.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearFile();
  });
}

function handleFile(file) {
  // Validate type
  if (!ALLOWED_TYPES.includes(file.type)) {
    showToast('Please upload a PNG, JPG, or WebP image.', true);
    return;
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    showToast('Screenshot must be under 5 MB.', true);
    return;
  }

  selectedFile = file;
  clearFieldError('group-screenshot');

  // Show preview
  screenshotZone.classList.add('has-file');
  screenshotName.textContent = file.name;
  screenshotSize.textContent = formatFileSize(file.size);

  // Generate thumbnail
  const reader = new FileReader();
  reader.onload = (e) => {
    screenshotThumb.src = e.target.result;
    // Extract base64 data (strip the data:...;base64, prefix)
    fileBase64 = e.target.result.split(',')[1];
  };
  reader.readAsDataURL(file);
}

function clearFile() {
  selectedFile = null;
  fileBase64 = null;
  screenshotZone.classList.remove('has-file');
  screenshotInput.value = '';
  screenshotThumb.src = '';
  screenshotName.textContent = '';
  screenshotSize.textContent = '';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ═══════════════════════════════════════════════════════════════
// Form Validation
// ═══════════════════════════════════════════════════════════════

function validateForm() {
  let isValid = true;

  // Order ID
  if (!fields.orderId.value.trim()) {
    setFieldError('group-order-id');
    isValid = false;
  } else {
    clearFieldError('group-order-id');
  }

  // Name
  if (!fields.name.value.trim()) {
    setFieldError('group-name');
    isValid = false;
  } else {
    clearFieldError('group-name');
  }

  // Email
  const emailVal = fields.email.value.trim();
  if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    setFieldError('group-email');
    isValid = false;
  } else {
    clearFieldError('group-email');
  }

  // Phone
  if (!fields.phone.value.trim()) {
    setFieldError('group-phone');
    isValid = false;
  } else {
    clearFieldError('group-phone');
  }

  // Reason
  if (!fields.reason.value.trim()) {
    setFieldError('group-reason');
    isValid = false;
  } else {
    clearFieldError('group-reason');
  }

  // Screenshot
  if (!selectedFile || !fileBase64) {
    setFieldError('group-screenshot');
    isValid = false;
  } else {
    clearFieldError('group-screenshot');
  }

  return isValid;
}

function setFieldError(groupId) {
  document.getElementById(groupId)?.classList.add('has-error');
}

function clearFieldError(groupId) {
  document.getElementById(groupId)?.classList.remove('has-error');
}

// Clear errors on input
function initFieldListeners() {
  Object.entries(fields).forEach(([key, input]) => {
    if (input) {
      const groupId = input.closest('.form-group')?.id;
      input.addEventListener('input', () => {
        if (groupId) clearFieldError(groupId);
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// Form Submission
// ═══════════════════════════════════════════════════════════════

async function handleSubmit(e) {
  e.preventDefault();

  if (!validateForm()) {
    // Scroll to first error
    const firstError = document.querySelector('.has-error');
    if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  setLoading(true);

  try {
    const payload = {
      orderId: fields.orderId.value.trim(),
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      reason: fields.reason.value.trim(),
      screenshot: {
        data: fileBase64,
        filename: selectedFile.name,
        contentType: selectedFile.type,
      },
    };

    const response = await fetch('/api/cancel-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showToast(data.message || 'Something went wrong. Please try again.', true);
      setLoading(false);
      return;
    }

    showToast('Cancellation request submitted! Check your email for confirmation.');
    
    // Reset form after short delay
    setTimeout(() => {
      form.reset();
      clearFile();
    }, 1500);

  } catch (err) {
    console.error('Cancel order error:', err);
    showToast('Something went wrong. Please try again.', true);
  } finally {
    setLoading(false);
  }
}

// ═══════════════════════════════════════════════════════════════
// UI Helpers
// ═══════════════════════════════════════════════════════════════

function setLoading(on) {
  submitBtn.disabled = on;
  submitText.textContent = on ? 'Submitting…' : 'Submit Cancellation Request';
}

let toastTimer = null;
function showToast(message, isError = false) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `cancel-toast visible${isError ? ' error' : ''}`;
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 5000);
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════

function init() {
  initFileUpload();
  initFieldListeners();
  if (form) form.addEventListener('submit', handleSubmit);
}

document.addEventListener('DOMContentLoaded', init);
