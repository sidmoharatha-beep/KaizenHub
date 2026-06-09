import { apiFetch, esc, statusBadge, fmtDate, toast, initAttachmentUpload, buildMultipartForm } from '../app.js';

const ICONS = {
  kaizen: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>'
};

// Check if user has an Approved kaizen that needs implementation
async function getApprovedKaizenForUser() {
  try {
    const res = await apiFetch('/api/kaizen/submit?status=Approved');
    if (res.ok && res.data?.submissions?.length > 0) {
      const myApproved = res.data.submissions.filter(k => k.user_id === res.data.currentUserId);
      return myApproved.length > 0 ? myApproved[0] : null;
    }
  } catch {}
  return null;
}

export async function renderKaizenSubmit(container) {
  let photoFile = null;

  let managers = [];
  let operators = [];
  let evaluators = [];
  try {
    const res = await apiFetch('/api/data');
    if (res.ok) {
      managers = res.data?.managers || [];
      operators = res.data?.operators || [];
      evaluators = res.data?.evaluators || [];
    }
  } catch {}

  const managerOptions = managers.length
    ? managers.map(function(m) { return '<option value="' + (m.id) + '">' + (esc(m.full_name)) + '</option>'; }).join('')
    : '<option value="">No managers available</option>';
  const coImplOptions = operators.length
    ? operators.map(function(o) { return '<option value="' + (o.id) + '">' + (esc(o.full_name)) + '</option>'; }).join('')
    : '<option value="">No operators available</option>';
  const evalOptions = evaluators.length
    ? evaluators.map(e => `<option value="${e.id}">${esc(e.full_name)}${e.department_name ? ' (' + (esc(e.department_name)) + ')' : ''}</option>`).join('')
    : '<option value="">No evaluators available</option>';

  // Check if user has an Approved kaizen → show implementation form
  const approvedKaizen = await getApprovedKaizenForUser();

  if (approvedKaizen) {
    renderImplementationForm(container, approvedKaizen, coImplOptions, evalOptions);
    return;
  }

  // Stage 1: Submit new kaizen
  renderNewKaizenForm(container, managerOptions);
}

function renderNewKaizenForm(container, managerOptions) {
  container.innerHTML = `
    <div class="module-header">
      <div class="module-icon kaizen">${ICONS.kaizen}</div>
      <div class="module-header-text"><h3>Kaizen Idea</h3><p>Continuous improvement — small changes, big impact</p></div>
    </div>
    <form id="kaizen-form" class="card">
      <div class="form-row"><label>Title *</label><input name="title" required minlength="3" placeholder="Brief title of your improvement idea"/></div>
      <div class="form-row"><label>Date</label><input name="submission_date" type="date" value="${new Date().toISOString().split('T')[0]}" readonly /></div>
      <div class="form-row"><label>Description *</label><textarea name="description" required rows="4" placeholder="Describe your improvement idea in detail."></textarea></div>
      <div class="form-row"><label>Category *</label>
        <select name="category" required>
          <option value="">Select category...</option>
          <option value="process">Process Improvement</option>
          <option value="quality">Quality Enhancement</option>
          <option value="safety">Safety Improvement</option>
          <option value="cost">Cost Reduction</option>
          <option value="efficiency">Efficiency Gains</option>
          <option value="other">Other</option>
        </select></div>
      <div class="form-row"><label>Before / After *</label><textarea name="before_after" required rows="3" placeholder="Describe the current state (Before) and expected new state (After)."></textarea></div>
      <div class="form-row"><label>Expected Impact *</label><textarea name="expected_impact" required rows="2" placeholder="What measurable impact will this make? (e.g. time savings, cost reduction, yield improvement)"></textarea></div>
      <div class="form-row"><label>Tangible Benefits</label><textarea name="tangible_benefits" rows="2" placeholder="Measurable benefits (cost savings, productivity gains, efficiency, etc.)"></textarea></div>
      <div class="form-row"><label>Intangible Benefits</label><textarea name="intangible_benefits" rows="2" placeholder="Non-measurable benefits (morale, safety culture, teamwork, etc.)"></textarea></div>
      <div class="form-row"><label>Approver *</label>
        <select name="approver_id" required>
          <option value="">Select approver...</option>
          ${managerOptions}
        </select></div>
      <button type="submit" class="btn-primary">Submit Kaizen Idea</button>
    </form>
  `;

  document.getElementById('kaizen-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.approver_id = parseInt(body.approver_id);

    const res = await apiFetch('/api/kaizen/submit', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) { toast('Error: ' + (res.data?.error || 'Failed')); return; }
    toast(res.data.message);
    e.target.reset();
    // Re-render to check for approved kaizen
    renderKaizenSubmit(container);
  });
}

function renderImplementationForm(container, kaizen, coImplOptions, evalOptions) {
  photoFile = null;

  container.innerHTML = `
    <div class="module-header">
      <div class="module-icon kaizen">${ICONS.kaizen}</div>
      <div class="module-header-text"><h3>Kaizen Implementation</h3><p>Your kaizen was approved! Submit your implementation evidence.</p></div>
    </div>
    <div class="card" style="margin-bottom:16px;background:var(--success-bg);border:1px solid var(--success);">
      <div style="font-weight:600;color:var(--success);margin-bottom:8px;">✓ Kaizen Approved</div>
      <div><strong>${esc(kaizen.title)}</strong></div>
      <div style="font-size:13px;color:var(--charcoal-light);">Submitted: ${fmtDate(kaizen.created_at)}</div>
    </div>
    <form id="kaizen-impl-form" class="card">
      <input type="hidden" name="kaizen_id" value="${kaizen.id}"/>
      <div class="form-row"><label>Date</label><input name="submission_date" type="date" value="${new Date().toISOString().split('T')[0]}" readonly /></div>
      <div class="form-row"><label>Implementation Mode *</label>
        <select name="implementation_mode" id="kaizen-impl-mode" required>
          <option value="self">Self Implementation</option>
          <option value="co">With Co-Implementor(s)</option>
        </select></div>
      <div class="form-row" id="kaizen-co-row" style="display:none">
        <label>Co-Implementor(s) *</label>
        <select name="co_implementor_id" id="kaizen-co-select">
          <option value="">Select co-implementor...</option>
          ${coImplOptions}
        </select></div>
      <div class="form-row"><label>Evaluator *</label>
        <select name="selected_evaluator_id" id="kaizen-eval-select" required>
          <option value="">Select evaluator (MANEX / Quality / Maintenance / Safety)</option>
          ${evalOptions}
        </select></div>
      <div class="form-row"><label>Tangible Benefits</label><textarea name="tangible_benefits" rows="2" placeholder="Measurable benefits achieved (cost savings, productivity, etc.)"></textarea></div>
      <div class="form-row"><label>Intangible Benefits</label><textarea name="intangible_benefits" rows="2" placeholder="Non-measurable benefits (morale, safety culture, teamwork, etc.)"></textarea></div>
      <div class="form-row">
        <label>Photo Evidence <span style="font-weight:400;color:var(--charcoal-xlight);text-transform:none;letter-spacing:0;font-size:11px"> · Required · Max 1MB</span></label>
        <div class="photo-upload-zone" id="kaizen-photo-zone">
          <div class="zone-icon"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <span class="zone-text">Tap to attach a photo</span>
          <span class="zone-hint">JPG, PNG, WEBP · Max 1MB</span>
          <input type="file" class="photo-upload-input" accept="image/*"/>
        </div>
        <div class="photo-upload-error" id="kaizen-photo-error"></div>
        <div class="photo-preview" id="kaizen-photo-preview">
          <img src="" alt="Attachment preview"/>
          <button type="button" class="photo-remove-btn" id="kaizen-photo-remove">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <button type="submit" class="btn-primary">Submit for Evaluation</button>
    </form>
  `;

  initAttachmentUpload(container, (file) => { photoFile = file; });

  // Toggle co-implementor
  const implMode = document.getElementById('kaizen-impl-mode');
  const coRow = document.getElementById('kaizen-co-row');
  const coSelect = document.getElementById('kaizen-co-select');
  if (implMode && coRow) {
    implMode.addEventListener('change', () => {
      if (implMode.value === 'co') {
        coRow.style.display = '';
        coSelect.setAttribute('required', '');
      } else {
        coRow.style.display = 'none';
        coSelect.removeAttribute('required');
        coSelect.value = '';
      }
    });
  }

  document.getElementById('kaizen-impl-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    if (body.co_implementor_id) body.co_implementor_id = parseInt(body.co_implementor_id);
    if (body.selected_evaluator_id) body.selected_evaluator_id = parseInt(body.selected_evaluator_id);
    body.kaizen_id = parseInt(body.kaizen_id);

    if (!photoFile) {
      toast('Photo evidence is required');
      return;
    }

    let res;
    const formData = buildMultipartForm(body, photoFile);
    res = await fetch('/api/kaizen/submit', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('authToken') || '') },
      body: formData
    });

    let result;
    if (res.ok) {
      try { result = await res.json(); } catch { result = {}; }
    }
    if (!res.ok) { toast('Error: ' + (result?.error || 'Failed')); return; }
    toast(result.message);
    photoFile = null;
    const preview = container.querySelector('#kaizen-photo-preview');
    const removeBtn = container.querySelector('#kaizen-photo-remove');
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    if (removeBtn) removeBtn.style.display = 'none';
    // Re-render
    renderKaizenSubmit(container);
  });
}