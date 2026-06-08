const API_BASE = '';
export let authToken = localStorage.getItem('authToken');
export let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

export function setAuth(token, user) {
  authToken = token; currentUser = user;
  if (token) { localStorage.setItem('authToken', token); localStorage.setItem('currentUser', JSON.stringify(user)); }
  else { localStorage.removeItem('authToken'); localStorage.removeItem('currentUser'); }
}

export async function apiFetch(path, opts = {}) {
  const url = (path.startsWith('http') ? '' : API_BASE) + path;
  const headers = {
    ...(authToken ? { 'Authorization': 'Bearer ' + authToken } : {}),
    ...opts.headers
  };
  // Only set Content-Type for methods that typically have a body
  if (!['GET', 'HEAD', 'DELETE'].includes(opts.method?.toUpperCase())) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    ...opts,
    headers
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}

export async function apiPost(path, body, opts = {}) {
  return apiFetch(path, { ...opts, method: 'POST', body: JSON.stringify(body) });
}

export async function apiPut(path, body, opts = {}) {
  return apiFetch(path, { ...opts, method: 'PUT', body: JSON.stringify(body) });
}

export async function apiDelete(path, opts = {}) {
  return apiFetch(path, { ...opts, method: 'DELETE', body: opts.body });
}

export function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === pageId));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === pageId.replace('page-', '')));
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

export function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function statusBadge(status) {
  const cls = {
    'Submitted': 'badge-pending', 'Pending': 'badge-pending',
    'Approved': 'badge-approved', 'Screened': 'badge-screened',
    'Implemented': 'badge-implemented', 'Evaluated': 'badge-evaluated',
    'Closed': 'badge-approved', 'Rejected': 'badge-rejected',
    'Draft': 'badge-pending', 'Panel Review': 'badge-screened',
    'HR Approval': 'badge-pending', 'Reward Released': 'badge-approved'
  };
  return `<span class="badge ${cls[status] || 'badge-pending'}">${status}</span>`;
}

export function renderPagination(p, containerId, onPageChange) {
  if (!p || p.total_pages <= 1) return '';
  let html = '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px">';
  if (p.page > 1) html += `<button class="btn-secondary" onclick="${onPageChange}(${p.page - 1})">&larr; Prev</button>`;
  html += `<span style="font-size:13px;padding:8px">Page ${p.page}/${p.total_pages}</span>`;
  if (p.page < p.total_pages) html += `<button class="btn-secondary" onclick="${onPageChange}(${p.page + 1})">Next &rarr;</button>`;
  html += '</div>';
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = html;
}

export function can(roleLike) {
  if (!currentUser) return false;
  const map = {
    'admin': 'Admin', 'manager': 'Manager', 'operator': 'Operator',
    'hr': 'HR', 'sic': 'SIC', 'qc': 'QC Panel Member'
  };
  return currentUser.role === (map[roleLike] || roleLike);
}

// ============================================
// Photo Attachment Helper
// Reusable across all submit forms
// ============================================

const MAX_PHOTO_SIZE = 1048576; // 1MB

export function initAttachmentUpload(container, onFileChange) {
  const zone = container.querySelector('.photo-upload-zone');
  const input = container.querySelector('.photo-upload-input');
  const preview = container.querySelector('.photo-preview');
  const errorEl = container.querySelector('.photo-upload-error');
  const removeBtn = container.querySelector('.photo-remove-btn');

  if (!zone || !input) return null;

  // Click zone to trigger file input
  zone.addEventListener('click', (e) => {
    if (e.target !== zone && !zone.contains(e.target)) return;
    if (e.target !== input) input.click();
  });

  // Drag-and-drop
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files) handleFile(files[0]);
  });

  // File input change
  input.addEventListener('change', () => {
    if (input.files?.length) handleFile(input.files[0]);
  });

  function handleFile(file) {
    // Validate size
    if (file.size > MAX_PHOTO_SIZE) {
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.textContent = `Photo is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum allowed is 1MB.`;
      }
      input.value = '';
      return;
    }
    // Validate type
    if (!file.type.startsWith('image/')) {
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.textContent = 'Only image files are allowed (JPG, PNG, WEBP, GIF).';
      }
      input.value = '';
      return;
    }

    // Clear error
    if (errorEl) errorEl.style.display = 'none';

    // Show preview
    const url = URL.createObjectURL(file);
    if (preview) {
      preview.innerHTML = `<img src="${url}" alt="Attachment preview"/>`;
      preview.style.display = 'block';
    }
    if (removeBtn) removeBtn.style.display = 'flex';

    // Notify parent
    if (onFileChange) onFileChange(file);
  }

  // Remove button
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      input.value = '';
      if (preview) preview.innerHTML = '';
      if (errorEl) errorEl.style.display = 'none';
      removeBtn.style.display = 'none';
      if (onFileChange) onFileChange(null);
    });
  }

  return { input, zone };
}

export async function uploadPhoto(file, module) {
  // No separate upload endpoint — photos are uploaded inline during form submit
  // via multipart/form-data. The attachment_url is returned in the submit response.
  // This function is kept for symmetry; it returns null and the calling form
  // handles the multipart submission directly.
  return null;
}

// Convenience: build FormData with optional photo attachment
// Returns fd ready for fetch with multipart encoding
export function buildMultipartForm(data, photoFile) {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    if (v !== null && v !== undefined) fd.append(k, v);
  });
  if (photoFile) fd.append('attachment', photoFile);
  return fd;
}
