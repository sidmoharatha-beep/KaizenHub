import { apiFetch, esc, statusBadge, fmtDate, toast, initAttachmentUpload, buildMultipartForm } from '../app.js';

const ICONS = {
  quality: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>'
};

export const renderQualitySubmit = async (container) => {
  let photoFile = null;
  let managers = [];
  try {
    const res = await apiFetch('/api/data');
    if (res.ok) {
      managers = res.data?.managers || [];
    }
  } catch {}
  const managerOptions = managers.length
    ? managers.map(m => `<option value="${m.id}">${esc(m.full_name)}</option>`).join('')
    : '<option value="">No managers available</option>';

  container.innerHTML = `
    <div class="module-header">
      <div class="module-icon quality">${ICONS.quality}</div>
      <div class="module-header-text"><h3>Quality Report</h3><p>Report quality hazards or quality safety observations</p></div>
    </div>
    <form id="quality-form" class="card">
      <div class="form-row"><label>Subcategory *</label>`
        <select name="subcategory" required>
          <option value="">Select type...</option>
          <option value="Quality Hazard">Quality Hazard</option>
          <option value="Quality SUSA">Quality SUSA</option>
        </select></div>
      <div class="form-row"><label>Date</label><input name="submission_date" type="date" value="${new Date().toISOString().split('T')[0]}" readonly /></div>
      <div class="form-row"><label>Title *</label><input name="title" required minlength="3" placeholder="Brief title of the quality issue"/></div>
      <div class="form-row"><label>Description *</label><textarea name="description" required rows="3" placeholder="Describe the quality issue in detail"></textarea></div>
      <div class="form-row"><label>Severity (1–5) *</label><input name="severity" type="number" min="1" max="5" required placeholder="1=minor, 5=critical"/></div>
      <div class="form-row"><label>Detection (1–5) *</label><input name="detection" type="number" min="1" max="5" required placeholder="1=easy, 5=very hard to detect"/></div>
      <div class="form-row"><label>Customer Risk (1–5) *</label><input name="customer_risk" type="number" min="1" max="5" required placeholder="1=low, 5=high customer impact"/></div>
      <div class="form-row"><label>Approver *</label>
        <select name="approver_id" required>
          <option value="">Select approver...</option>
          ${managerOptions}
        </select></div>

      <div class="form-row">
        <label>Attach Photo <span style="font-weight:400;color:var(--charcoal-xlight);text-transform:none;letter-spacing:0;font-size:11px"> · Optional · Max 1MB</span></label>
        <div class="photo-upload-zone" id="quality-photo-zone">
          <div class="zone-icon"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <span class="zone-text">Tap to attach a photo</span>
          <span class="zone-hint">JPG, PNG, WEBP · Max 1MB</span>
          <input type="file" class="photo-upload-input" accept="image/*" id="quality-photo-input"/>
        </div>
        <div class="photo-upload-error" id="quality-photo-error"></div>
        <div class="photo-preview" id="quality-photo-preview">
          <img src="" alt="Attachment preview"/>
          <button type="button" class="photo-remove-btn" id="quality-photo-remove">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <button type="submit" class="btn-primary">Submit Quality Report</button>
    </form>
    <p class="section-label" style="margin-top:24px">My Quality Reports</p>
    <div id="quality-list"></div>
  `;

  initAttachmentUpload(container, (file) => { photoFile = file; });

  container.querySelector('#quality-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());

    let result;
    if (photoFile) {
      const formData = buildMultipartForm(body, photoFile);
      const rawRes = await fetch('/api/quality/submit', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('authToken') || '') },
        body: formData
      });
      result = await rawRes.json().catch(() => ({}));
      if (!rawRes.ok) {
        toast('Error: ' + (result?.error || 'Failed to submit'));
        return;
      }
    } else {
      const res = await apiFetch('/api/quality/submit', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      result = res.data;
      if (!res.ok) {
        toast('Error: ' + (result?.error || 'Failed to submit'));
        return;
      }
    }

    toast('Quality report submitted! Score: ' + result.quality_score);
    e.target.reset();
    photoFile = null;
    const preview = container.querySelector('#quality-photo-preview');
    const removeBtn = container.querySelector('#quality-photo-remove');
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    if (removeBtn) removeBtn.style.display = 'none';
    loadQualityList();
  });

  loadQualityList();
}

async function loadQualityList() {
  const res = await apiFetch('/api/quality/submit');
  const container = document.getElementById('quality-list');
  if (!container) return;
  if (!res.ok) { container.innerHTML = '<div class="empty">Error loading</div>'; return; }
  const items = res.data?.submissions || [];
  if (!items.length) { container.innerHTML = '<div class="empty">No quality reports yet. Start by submitting one above.</div>'; return; }
  container.innerHTML = items.map(q => `
    <div class="sub-card ${q.status.toLowerCase()}">
      <h4>${esc(q.title)}</h4>
      <div class="sub-meta">${fmtDate(q.created_at)} · ${esc(q.subcategory)} · Score: ${q.severity + q.detection + q.customer_risk} · ${statusBadge(q.status)}</div>
      <div class="sub-excerpt">${esc(q.description)}</div>
      ${q.attachment_url ? `<div style="margin-top:8px"><img src="/api/attachments/${q.attachment_url}" style="max-height:80px;border-radius:8px;border:1px solid var(--border)" alt="attachment"/></div>` : ''}
      ${q.reward_points > 0 ? `<div style="color:var(--green-light);font-size:13px;font-weight:600">+${q.reward_points} pts earned</div>` : ''}
    </div>
  `).join('');
}
