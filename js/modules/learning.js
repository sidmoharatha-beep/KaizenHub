import { apiFetch, esc, fmtDate, toast, currentUser } from '../app.js';

const ICONS = {
  learning: '<svg viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const CATEGORIES = ['Safety', 'Quality', 'Kaizen', 'QC Circle', 'Behavioral', 'General'];

export async function renderLearning(container) {
  const role = currentUser?.role || '';
  const isAdmin = role === 'Admin';

  container.innerHTML = `
    <div class="module-header">
      <div class="module-icon learning">${ICONS.learning}</div>
      <div class="module-header-text"><h3>Learning Hub</h3><p>Training materials, SOPs, and resources</p></div>
    </div>
    <div id="learning-upload-panel" ${!isAdmin ? 'style="display:none"' : ''} class="card" style="margin-bottom:20px">
      <h4 style="margin-bottom:12px">Upload Training Material</h4>
      <form id="learning-upload-form">
        <div class="form-row"><label>Title *</label><input name="title" required minlength="3" placeholder="Material title"/></div>
        <div class="form-row"><label>Material Type *</label>
          <select name="category" required>
            <option value="">Select type...</option>
            ${CATEGORIES.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('')}
          </select></div>
        <div class="form-row"><label>Description</label><textarea name="description" rows="2" placeholder="Optional description"></textarea></div>
        <div class="form-row">
          <label>File * <span style="font-weight:400;color:var(--charcoal-xlight);font-size:11px">Max 5MB</span></label>
          <input type="file" name="file" id="learning-file-input" required accept=".pdf,.jpg,.jpeg,.png,.mp4,.mov,.avi,.doc,.docx,.xls,.xlsx,.ppt,.pptx"/>
        </div>
        <div style="margin-top:6px;font-size:12px;color:var(--charcoal-xlight)" id="learning-file-name"></div>
        <button type="submit" class="btn-primary" style="margin-top:12px">Upload Material</button>
      </form>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px" id="learning-filter-btns">
      <button class="tab-btn active" data-cat="">All</button>
      ${CATEGORIES.map(function(c) { return '<button class="tab-btn" data-cat="' + c + '">' + c + '</button>'; }).join('')}
    </div>
    <div id="learning-list"><div class="loading">Loading materials...</div></div>
  `;

  // Category filter
  container.querySelectorAll('#learning-filter-btns .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#learning-filter-btns .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadMaterials(btn.dataset.cat);
    });
  });

  // Show file name on select
  const fileInput = container.querySelector('#learning-file-input');
  const fileNameEl = container.querySelector('#learning-file-name');
  if (fileInput && fileNameEl) {
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      fileNameEl.textContent = f ? `Selected: ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)` : '';
    });
  }

  // Upload form submit
  container.querySelector('#learning-upload-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const file = fileInput?.files[0];
    if (!file) { toast('Please select a file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('File too large (max 5MB)'); return; }

    const formData = new FormData();
    formData.append('title', fd.get('title'));
    formData.append('category', fd.get('category'));
    formData.append('description', fd.get('description') || '');
    formData.append('file', file);

    const res = await fetch('/api/learning/submit', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('authToken') || '') },
      body: formData
    });
    const result = res.ok ? await res.json() : null;
    if (!res.ok) { toast('Error: ' + (result?.error || 'Failed')); return; }
    toast('Material uploaded!');
    e.target.reset();
    if (fileNameEl) fileNameEl.textContent = '';
    loadMaterials(currentCategory);
  });

  let currentCategory = '';
  window.loadMaterials = loadMaterials;

  async function loadMaterials(category) {
    currentCategory = category;
    const listEl = document.getElementById('learning-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading">Loading...</div>';

    const url = category ? `/api/learning?category=${encodeURIComponent(category)}` : '/api/learning';
    const res = await apiFetch(url);
    if (!res.ok) { listEl.innerHTML = '<div class="empty">Error loading materials</div>'; return; }

    const items = res.data?.materials || [];
    if (!items.length) {
      listEl.innerHTML = '<div class="empty">No materials found. ' + (isAdmin ? 'Upload one above.' : 'Check back later.') + '</div>';
      return;
    }

    listEl.innerHTML = items.map(m => {
      const isImage = (m.file_type || '').toLowerCase().includes('image');
      const isPdf = (m.file_type || '').toLowerCase() === 'pdf';
      const isVideo = (m.file_type || '').toLowerCase().includes('video');
      const downloadUrl = `/api/attachments/${esc(m.file_url)}`;

      return `
        <div class="sub-card" style="position:relative">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="flex:1;min-width:0">
              <h4 style="margin:0 0 4px;font-size:16px">${esc(m.title)}</h4>
              <div class="sub-meta">${fmtDate(m.created_at)} · ${esc(m.category)} · ${formatSize(m.file_size)}</div>
              ${m.description ? '<div class="sub-excerpt" style="margin-top:4px">' + esc(m.description) + '</div>' : ''}
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                <a href="${downloadUrl}" download="${esc(m.file_name || m.title)}" class="btn-primary" style="padding:6px 14px;font-size:13px;text-decoration:none;display:inline-block">
                  Download ${isPdf ? 'PDF' : isImage ? 'Image' : isVideo ? 'Video' : 'File'}
                </a>
                <span style="font-size:12px;color:var(--charcoal-xlight)">${esc(m.file_name || '')}</span>
              </div>
            </div>
            ${isImage ? '<div style="flex-shrink:0"><a href="' + downloadUrl + '" target="_blank" download><img src="' + downloadUrl + '" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer"/></a></div>' : ''}
          </div>
          ${isAdmin ? '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px"><button class="btn btn-sm" style="background:' + (m.is_active==1 ? '#991b1b' : '#1d4ed8') + ';color:#fff" onclick="adminToggleLearning(' + m.id + ',' + m.is_active + ')">' + (m.is_active==1 ? 'Deactivate' : 'Activate') + '</button><button class="btn btn-sm" style="background:#991b1b;color:#fff" onclick="adminDeleteLearning(' + m.id + ',\'' + esc(m.title) + '\')">Delete</button></div>' : ''}
        </div>
      `;
    }).join('');
  }

  loadMaterials('');
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

window.adminDeleteLearning = async function(id, title) {
  if (!confirm(`Delete "${title}" permanently?`)) return;
  const res = await apiFetch(`/api/learning/${id}`, { method: 'DELETE' });
  if (res.ok) { toast('Deleted'); window.loadMaterials && window.loadMaterials(''); }
  else toast(res.data?.error || 'Delete failed');
};

window.adminToggleLearning = async function(id, currentStatus) {
  const newStatus = currentStatus == 1 ? 0 : 1;
  const res = await apiFetch(`/api/learning/${id}`, { method: 'PUT', body: JSON.stringify({ is_active: newStatus }) });
  if (res.ok) { toast(newStatus == 1 ? 'Activated' : 'Deactivated'); window.loadMaterials && window.loadMaterials(''); }
  else toast(res.data?.error || 'Toggle failed');
};
