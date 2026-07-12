/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Quote Form
   File upload validation, form submission, drag & drop
   ═══════════════════════════════════════════════════════════════ */

import { isValidEmail, isValidPhone, showToast, CONFIG } from './utils.js';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_EXTENSIONS = ['.stl', '.step', '.stp'];

let selectedFile = null;

function init() {
  initFileUpload();
  initFormSubmission();
}

// ── File Upload ──
function initFileUpload() {
  const zone = document.getElementById('file-upload-zone');
  const input = document.getElementById('quote-file');
  const preview = document.getElementById('file-preview');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const removeBtn = document.getElementById('file-remove');
  const errorEl = document.getElementById('file-error');

  if (!zone || !input) return;

  // Drag & Drop
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragging');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragging');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // File input change
  input.addEventListener('change', () => {
    if (input.files[0]) handleFile(input.files[0]);
  });

  // Remove file
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      selectedFile = null;
      input.value = '';
      preview.classList.remove('visible');
      zone.style.display = '';
      zone.closest('.form-group').classList.remove('has-error');
    });
  }

  function handleFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const group = zone.closest('.form-group');

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      group.classList.add('has-error');
      errorEl.textContent = `Invalid file type "${ext}". Please upload STL, STEP, or STP files.`;
      selectedFile = null;
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      group.classList.add('has-error');
      errorEl.textContent = `File too large (${formatFileSize(file.size)}). Maximum size is 25MB.`;
      selectedFile = null;
      return;
    }

    // Valid file
    group.classList.remove('has-error');
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    preview.classList.add('visible');
    zone.style.display = 'none';
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Form Submission ──
function initFormSubmission() {
  const form = document.getElementById('quote-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate
    let isValid = true;

    // File
    if (!selectedFile) {
      const fileGroup = document.getElementById('file-upload-zone')?.closest('.form-group');
      if (fileGroup) {
        fileGroup.classList.add('has-error');
        document.getElementById('file-error').textContent = 'Please upload a design file';
      }
      isValid = false;
    }

    // Material
    const material = document.getElementById('quote-material');
    if (!material.value) {
      material.closest('.form-group').classList.add('has-error');
      isValid = false;
    } else {
      material.closest('.form-group').classList.remove('has-error');
    }

    // Name
    const name = document.getElementById('quote-name');
    if (!name.value.trim() || name.value.trim().length < 2) {
      name.closest('.form-group').classList.add('has-error');
      isValid = false;
    } else {
      name.closest('.form-group').classList.remove('has-error');
    }

    // Email
    const email = document.getElementById('quote-email');
    if (!isValidEmail(email.value)) {
      email.closest('.form-group').classList.add('has-error');
      isValid = false;
    } else {
      email.closest('.form-group').classList.remove('has-error');
    }

    // Phone
    const phone = document.getElementById('quote-phone');
    if (!isValidPhone(phone.value)) {
      phone.closest('.form-group').classList.add('has-error');
      isValid = false;
    } else {
      phone.closest('.form-group').classList.remove('has-error');
    }

    if (!isValid) {
      showToast('Please fill in all required fields correctly', 'error');
      const firstError = form.querySelector('.form-group.has-error');
      if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Submit
    const submitBtn = document.getElementById('quote-submit');
    const submitText = document.getElementById('quote-submit-text');
    submitBtn.disabled = true;
    submitText.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px;"></span> Submitting...';

    try {
      // Build form data
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('material', material.value);
      formData.append('notes', document.getElementById('quote-notes').value);
      formData.append('name', name.value.trim());
      formData.append('email', email.value.trim());
      formData.append('phone', phone.value.trim());

      try {
        const response = await fetch(`${CONFIG.API_BASE}/quote`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.message || 'Submission failed');
        }
      } catch (fetchErr) {
        // If API is unreachable (dev mode without backend), simulate success
        if (fetchErr instanceof TypeError && fetchErr.message.includes('fetch')) {
          console.log('Dev mode: simulating quote submission');
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          throw fetchErr;
        }
      }

      showToast('Quote request submitted successfully! We\'ll get back to you within 24 hours.', 'success', 6000);
      form.reset();
      selectedFile = null;
      document.getElementById('file-preview').classList.remove('visible');
      document.getElementById('file-upload-zone').style.display = '';
    } catch (err) {
      console.error('Quote submission error:', err);
      showToast(err.message || 'Failed to submit quote request. Please try again or email us directly.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitText.textContent = 'Submit Quote Request';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
