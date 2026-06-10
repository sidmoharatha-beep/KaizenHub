import { apiFetch, esc, statusBadge, fmtDate, toast, initAttachmentUpload, buildMultipartForm, currentUser } from '../app.js';

const ICONS = {
  kaizen: '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>'
};

// Full status flow:
// Submitted → Screened → Approved → [Operator Implements] → Pending Evaluation → [Evaluator Scores] → Evaluated → [Manager Final Review] → Closed
// Rejected at any stage

export async function renderKaizenSubmit(container) {
  let photoFile = null;

  // Load lookup data
  let managers = [], operators = [], evaluators = [];
  try {
    const res = await apiFetch('/api/data');
    if (res.ok) {
      managers   = res.data?.managers   || [];
      operators  = res.data?.operators  || [];
      evaluators = res.data?.evaluators || [];
    }
  } catch {}

  const managerOptions  = managers.map(function(m)  { return '<option value="' + m.id + '">' + esc(m.full_name) + '</option>'; }).join('') || '<option value="">No managers available</option>';
  const coImplOptions   = operators.map(function(o)  { return '<option value="' + o.id + '">' + esc(o.full_name) + '</option>'; }).join('') || '<option value="">No operators available</option>';
  const evalOptions     = evaluators.map(function(e)  { return '<option value="' + e.id + '">' + esc(e.full_name) + (e.department_name ? ' (' + esc(e.department_name) + ')' : '') + '</option>'; }).join('') || '<option value="">No evaluators available</option>';

  // Fetch all kaizens belonging to this user
  const res = await apiFetch('/api/kaizen/submit');
  const myKaizens = (res.ok ? (res.data?.submissions || []) : []).filter(function(k) { return k.user_id === currentUser?.id; });

  // Check current active kaizen states
  const approved      = myKaizens.find(function(k) { return k.status === 'Approved'; });
  const screened      = myKaizens.find(function(k) { return k.status === 'Screened'; });
  const submitted     = myKaizens.find(function(k) { return k.status === 'Submitted'; });
  const pendingEval   = myKaizens.find(function(k) { return k.status === 'Pending Evaluation'; });
  const evaluated     = myKaizens.find(function(k) { return k.status === 'Evaluated' || k.status === 'Closed'; });

  // Show status tracker for any in-progress kaizen
  const inProgress = approved || screened || submitted || pendingEval || evaluated;

  container.innerHTML = '';

  // ── Header ──
  const header = document.createElement('div');
  header.innerHTML = '<div class="module-header"><div class="module-icon kaizen">' + ICONS.kaizen + '</div><div class="module-header-text"><h3>Kaizen</h3><p>Submit, track and implement improvement ideas</p></div></div>';
  container.appendChild(header);

  // ── Status Tracker (if any kaizen in progress) ──
  if (inProgress) {
    renderStatusTracker(container, myKaizens);
  }

  // ── Action Area based on current state ──
  if (approved) {
    // Operator needs to submit implementation
    renderImplementationForm(container, approved, coImplOptions, evalOptions, function(f) { photoFile = f; });
  } else if (pendingEval) {
    // Waiting for evaluator
    renderWaitingCard(container, pendingEval, '⏳', 'Pending Evaluation', 'Your implementation has been sent directly to the evaluator for scoring.', 'var(--navy)');
  } else if (evaluated) {
    // Waiting for manager final review
    renderWaitingCard(container, evaluated, '✅', 'Awaiting Final Review', 'Your kaizen has been evaluated! Your manager will do a final review and close it with points.', 'var(--green)');
  } else if (screened) {
    // Waiting for manager approval
    renderWaitingCard(container, screened, '🔍', 'Screened — Awaiting Approval', 'Your kaizen passed screening and is waiting for your manager\'s final approval.', 'var(--navy)');
  } else if (submitted) {
    // Waiting for manager screening
    renderWaitingCard(container, submitted, '📤', 'Submitted — Awaiting Screening', 'Your kaizen idea has been submitted. Your manager will screen it soon.', 'var(--charcoal)');
  } else {
    // No active kaizen — show submit form
    renderNewKaizenForm(container, managerOptions);
  }

  // ── Past Kaizens (closed/rejected) ──
  const pastKaizens = myKaizens.filter(function(k) { return k.status === 'Closed' || k.status === 'Rejected'; });
  if (pastKaizens.length > 0) {
    renderPastKaizens(container, pastKaizens);
  }
}

/* ── Status Tracker ── */
function renderStatusTracker(container, kaizens) {
  const active = kaizens.find(function(k) { return !['Closed','Rejected'].includes(k.status); });
  if (!active) return;

  const steps = [
    { key: 'Submitted',           label: 'Submitted',       icon: '📝' },
    { key: 'Screened',            label: 'Screened',        icon: '🔍' },
    { key: 'Approved',            label: 'Approved',        icon: '✅' },
    { key: 'Implemented',         label: 'Implemented',     icon: '🔧' },
    { key: 'Evaluated',           label: 'Pending Eval',    icon: '⭐' },
    { key: 'Closed',              label: 'Closed',          icon: '🏆' },
  ];

  const order = steps.map(function(s) { return s.key; });
  const currentIdx = order.indexOf(active.status);

  const el = document.createElement('div');
  el.className = 'card';
  el.style.cssText = 'margin-bottom:16px;padding:16px';

  let html = '<div style="font-weight:700;font-size:13px;color:var(--navy);margin-bottom:12px">📊 Your Kaizen: <em>' + esc(active.title) + '</em></div>';
  html += '<div style="display:flex;align-items:center;gap:0;overflow-x:auto;padding-bottom:4px">';

  steps.forEach(function(step, i) {
    const isDone    = i < currentIdx;
    const isCurrent = i === currentIdx;
    const isRejected = active.status === 'Rejected';

    const bgColor  = isDone ? 'var(--green)' : isCurrent ? (isRejected ? '#dc2626' : 'var(--navy)') : 'var(--surface)';
    const txtColor = (isDone || isCurrent) ? '#fff' : 'var(--muted)';

    html += '<div style="display:flex;flex-direction:column;align-items:center;min-width:60px">';
    html += '<div style="width:32px;height:32px;border-radius:50%;background:' + bgColor + ';color:' + txtColor + ';display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">' + (isDone ? '✓' : step.icon) + '</div>';
    html += '<div style="font-size:10px;margin-top:4px;text-align:center;color:' + (isCurrent ? 'var(--navy)' : 'var(--muted)') + ';font-weight:' + (isCurrent ? '700' : '400') + '">' + step.label + '</div>';
    html += '</div>';

    if (i < steps.length - 1) {
      html += '<div style="flex:1;min-width:12px;height:2px;background:' + (isDone ? 'var(--green)' : 'var(--border)') + ';margin-bottom:16px"></div>';
    }
  });

  html += '</div>';
  el.innerHTML = html;
  container.appendChild(el);
}

/* ── Waiting Card ── */
function renderWaitingCard(container, kaizen, icon, title, message, color) {
  const el = document.createElement('div');
  el.className = 'card';
  el.style.cssText = 'margin-bottom:16px;border-left:4px solid ' + color;
  el.innerHTML = '<div style="display:flex;gap:12px;align-items:flex-start">' +
    '<div style="font-size:28px">' + icon + '</div>' +
    '<div><div style="font-weight:700;font-size:15px;color:' + color + '">' + title + '</div>' +
    '<div style="font-weight:600;margin:4px 0 2px">' + esc(kaizen.title) + '</div>' +
    '<div style="font-size:13px;color:var(--charcoal-light)">' + message + '</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-top:6px">Submitted: ' + fmtDate(kaizen.created_at) + '</div></div></div>';
  container.appendChild(el);
}

/* ── New Kaizen Form ── */
function renderNewKaizenForm(container, managerOptions) {
  const el = document.createElement('div');
  el.innerHTML = `
    <form id="kaizen-form" class="card">
      <p class="section-label" style="margin-top:0">New Kaizen Idea</p>
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
      <div class="form-row"><label>Before / After *</label><textarea name="before_after" required rows="3" placeholder="Current state (Before) and expected new state (After)."></textarea></div>
      <div class="form-row"><label>Expected Impact *</label><textarea name="expected_impact" required rows="2" placeholder="Measurable impact (time savings, cost reduction, yield improvement)"></textarea></div>
      <div class="form-row"><label>Tangible Benefits</label><textarea name="tangible_benefits" rows="2" placeholder="Measurable benefits (cost savings, productivity gains, etc.)"></textarea></div>
      <div class="form-row"><label>Intangible Benefits</label><textarea name="intangible_benefits" rows="2" placeholder="Non-measurable benefits (morale, safety culture, teamwork, etc.)"></textarea></div>
      <div class="form-row"><label>Approver *</label>
        <select name="approver_id" required>
          <option value="">Select approver...</option>
          ${managerOptions}
        </select></div>
      <button type="submit" class="btn-primary">Submit Kaizen Idea</button>
    </form>
  `;
  container.appendChild(el);

  el.querySelector('#kaizen-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.approver_id = parseInt(body.approver_id);
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Submitting...';
    const res = await apiFetch('/api/kaizen/submit', { method: 'POST', body: JSON.stringify(body) });
    btn.disabled = false; btn.textContent = 'Submit Kaizen Idea';
    if (!res.ok) { toast('Error: ' + (res.data?.error || 'Failed')); return; }
    toast(res.data?.message || 'Kaizen submitted!');
    renderKaizenSubmit(container);
  });
}

/* ── Implementation Form ── */
function renderImplementationForm(container, kaizen, coImplOptions, evalOptions, onPhoto) {
  let photoFile = null;

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;background:#f0fdf4;border:1.5px solid #22c55e">
      <div style="font-weight:700;color:#15803d;margin-bottom:6px">✅ Kaizen Approved — Submit Your Implementation</div>
      <div style="font-weight:600">${esc(kaizen.title)}</div>
      <div style="font-size:12px;color:var(--muted)">Approved on: ${fmtDate(kaizen.created_at)}</div>
    </div>
    <form id="kaizen-impl-form" class="card">
      <p class="section-label" style="margin-top:0">Implementation Evidence</p>
      <input type="hidden" name="kaizen_id" value="${kaizen.id}"/>
      <div class="form-row"><label>Date</label><input name="submission_date" type="date" value="${new Date().toISOString().split('T')[0]}" readonly /></div>
      <div class="form-row"><label>Implementation Mode *</label>
        <select name="implementation_mode" id="kaizen-impl-mode" required>
          <option value="self">Self Implementation</option>
          <option value="co">With Co-Implementor</option>
        </select></div>
      <div class="form-row" id="kaizen-co-row" style="display:none">
        <label>Co-Implementor *</label>
        <select name="co_implementor_id" id="kaizen-co-select">
          <option value="">Select co-implementor...</option>
          ${coImplOptions}
        </select></div>
      <div class="form-row"><label>Evaluator *</label>
        <select name="selected_evaluator_id" required>
          <option value="">Select evaluator (MANEX / Quality / Maintenance / Safety)</option>
          ${evalOptions}
        </select></div>
      <div class="form-row"><label>Tangible Benefits Achieved</label><textarea name="tangible_benefits" rows="2" placeholder="Measurable benefits achieved"></textarea></div>
      <div class="form-row"><label>Intangible Benefits Achieved</label><textarea name="intangible_benefits" rows="2" placeholder="Non-measurable benefits achieved"></textarea></div>
      <div class="form-row">
        <label>Photo Evidence <span style="font-weight:400;font-size:11px;color:var(--muted)">Required · Max 1MB</span></label>
        <div class="photo-upload-zone" id="kaizen-photo-zone">
          <div class="zone-icon"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <span class="zone-text">Tap to attach a photo</span>
          <span class="zone-hint">JPG, PNG, WEBP · Max 1MB</span>
          <input type="file" class="photo-upload-input" accept="image/*"/>
        </div>
        <div class="photo-upload-error" id="kaizen-photo-error"></div>
        <div class="photo-preview" id="kaizen-photo-preview">
          <img src="" alt="preview"/>
          <button type="button" class="photo-remove-btn" id="kaizen-photo-remove">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
      <button type="submit" class="btn-primary">Submit Implementation for Review</button>
    </form>
  `;
  container.appendChild(el);

  initAttachmentUpload(el, function(f) { photoFile = f; });

  // Toggle co-implementor
  const implMode = el.querySelector('#kaizen-impl-mode');
  const coRow    = el.querySelector('#kaizen-co-row');
  const coSelect = el.querySelector('#kaizen-co-select');
  implMode.addEventListener('change', function() {
    const isCo = implMode.value === 'co';
    coRow.style.display = isCo ? '' : 'none';
    isCo ? coSelect.setAttribute('required','') : coSelect.removeAttribute('required');
    if (!isCo) coSelect.value = '';
  });

  el.querySelector('#kaizen-impl-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!photoFile) { toast('Photo evidence is required'); return; }

    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    if (body.co_implementor_id) body.co_implementor_id = parseInt(body.co_implementor_id);
    if (body.selected_evaluator_id) body.selected_evaluator_id = parseInt(body.selected_evaluator_id);
    body.kaizen_id = parseInt(body.kaizen_id);

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Submitting...';

    const formData = buildMultipartForm(body, photoFile);
    const res = await fetch('/api/kaizen/submit', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('authToken') || '') },
      body: formData
    });

    const result = await res.json().catch(function() { return {}; });
    btn.disabled = false; btn.textContent = 'Submit Implementation for Review';

    if (!res.ok) { toast('Error: ' + (result?.error || 'Failed')); return; }
    toast(result?.message || 'Implementation submitted!');
    photoFile = null;
    renderKaizenSubmit(container);
  });
}

/* ── Past Kaizens ── */
function renderPastKaizens(container, kaizens) {
  const el = document.createElement('div');
  el.innerHTML = '<p class="section-label">Past Kaizens</p>' +
    kaizens.map(function(k) {
      return '<div class="sub-card ' + k.status.toLowerCase() + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<h4 style="margin:0">' + esc(k.title) + '</h4>' + statusBadge(k.status) + '</div>' +
        '<div class="sub-meta">' + fmtDate(k.created_at) + ' · ' + esc(k.category || '') + '</div>' +
        (k.approval_reward ? '<div style="color:var(--green);font-size:13px;font-weight:600;margin-top:4px">+' + k.approval_reward + ' pts earned</div>' : '') +
        '</div>';
    }).join('');
  container.appendChild(el);
}
