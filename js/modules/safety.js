import { apiFetch, esc, statusBadge, fmtDate, toast, initAttachmentUpload, buildMultipartForm, currentUser } from '../app.js';

// Lucide-style inline SVG icons
const ICONS = {
  safety: '<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  quality: '<svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  kaizen: '<svg viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  qc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  behavioral: '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

export async function renderSafetySubmit() {
  const el = document.getElementById('submit-content');
  if (!el) return;

  const role = currentUser?.role || 'Operator';
  // Manager/SIC/HR see ONLY Behavioral tab — they don't submit the other 4 types
  const isBehavioralOnly = ['Manager', 'SIC', 'HR'].includes(role);

  el.innerHTML = `
    <div class="page-header"><h1>New Submission</h1></div>
    <div class="tab-btns" id="submit-tabs">
      ${isBehavioralOnly ? '' : `<button class="tab-btn active" data-tab="safety">${ICONS.safety} Safety</button>`}
    ${isBehavioralOnly ? '' : `<button class="tab-btn" data-tab="quality">${ICONS.quality} Quality</button>`}
    ${isBehavioralOnly ? '' : `<button class="tab-btn" data-tab="kaizen">${ICONS.kaizen} Kaizen</button>`}
    ${isBehavioralOnly || role === 'HR' ? '' : `<button class="tab-btn" data-tab="qc">${ICONS.qc} QC Circle</button>`}
    ${role === 'Operator' ? '' : `<button class="tab-btn${isBehavioralOnly ? ' active' : ''}" data-tab="behavioral">${ICONS.behavioral} Behavioral</button>`}
    </div>
    <div id="submit-form-container"></div>
  `;

  el.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchSubmitTab(btn.dataset.tab);
    });
  });

  switchSubmitTab(isBehavioralOnly ? 'behavioral' : 'safety');
}

async function switchSubmitTab(type) {
  const container = document.getElementById('submit-form-container');
  if (!container) return;

  if (type === 'safety') renderSafetyForm(container);
  else if (type === 'quality') { const m = await import('./quality.js'); m.renderQualitySubmit(container); }
  else if (type === 'kaizen') { const m = await import('./kaizen.js'); m.renderKaizenSubmit(container); }
  else if (type === 'qc') renderQCForm(container);
  else if (type === 'behavioral') renderBehavioralForm(container);
}

async function renderSafetyForm(container) {
  let photoFile = null;
  let departments = [];
  let managers = [];
  try {
    const res = await apiFetch('/api/data');
    if (res.ok) {
      departments = res.data?.departments || [];
      managers = res.data?.managers || [];
    }
  } catch {}

  const deptOptions = departments.length
    ? departments.map(function(d) { return '<option value="' + (d.id) + '">' + (esc(d.name)) + ' (' + (esc(d.code)) + ')</option>'; }).join('')
    : '<option value="">No departments available</option>';
  const managerOptions = managers.length
    ? managers.map(function(m) { return '<option value="' + (m.id) + '">' + (esc(m.full_name)) + '</option>'; }).join('')
    : '<option value="">No managers available</option>';

  container.innerHTML = `
    <div class="module-header">
      <div class="module-icon safety">${ICONS.safety}</div>
      <div class="module-header-text"><h3>Safety Report</h3><p>Report hazards, near misses, or safety observations</p></div>
    </div>
    <form id="safety-form" class="card">
      <div class="form-row"><label>Subcategory *</label>
        <select name="subcategory" required>
          <option value="">Select type...</option>
          <option value="Hazard">Hazard</option>
          <option value="Near Miss">Near Miss</option>
          <option value="SUSA">SUSA (Safety Observation)</option>
        </select></div>
      <div class="form-row"><label>Date</label><input name="submission_date" type="date" value="${new Date().toISOString().split('T')[0]}" readonly /></div>
      <div class="form-row"><label>Title *</label><input name="title" required minlength="3" placeholder="Brief title of the incident"/></div>
      <div class="form-row"><label>Location *</label><input name="location" required placeholder="Where did this occur?"/></div>
      <div class="form-row"><label>Department</label>
        <select name="department_id">
          <option value="">Auto-assign to your department</option>
          ${deptOptions}
        </select></div>
      <div class="form-row"><label>Approver *</label>
        <select name="approver_id" required>
          <option value="">Select approver...</option>
          ${managerOptions}
        </select></div>
      <div class="form-row"><label>Description *</label><textarea name="description" required rows="3" placeholder="Describe what happened in detail"></textarea></div>
      <div class="susa-note" id="susa-note" style="display:none">
        <strong>SUSA</strong> — Safety Observation. Consequence and Likelihood are locked to 1 (observation only, not an incident).
      </div>
      <div class="form-row"><label>Consequence (1–5) *</label><input name="consequence" type="number" min="1" max="5" required id="safety-consequence" placeholder="1=minor, 5=catastrophic"/></div>
      <div class="form-row"><label>Likelihood (1–5) *</label><input name="likelihood" type="number" min="1" max="5" required id="safety-likelihood" placeholder="1=unlikely, 5=almost certain"/></div>
      <div class="form-row"><label>Immediate Action</label><textarea name="immediate_action" rows="2" placeholder="What was done right away?"></textarea></div>
      <div class="form-row"><label>Incident Date *</label><input name="incident_date" type="date" required/></div>

      <div class="form-row">
        <label>Attach Photo <span style="font-weight:400;color:var(--charcoal-xlight);text-transform:none;letter-spacing:0;font-size:11px"> · Optional · Max 1MB</span></label>
        <div class="photo-upload-zone" id="safety-photo-zone">
          <div class="zone-icon">
            <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="zone-text">Tap to attach a photo</span>
          <span class="zone-hint">JPG, PNG, WEBP · Max 1MB</span>
          <input type="file" class="photo-upload-input" accept="image/*" id="safety-photo-input"/>
        </div>
        <div class="photo-upload-error" id="safety-photo-error"></div>
        <div class="photo-preview" id="safety-photo-preview">
          <img src="" alt="Attachment preview"/>
          <button type="button" class="photo-remove-btn" id="safety-photo-remove">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <button type="submit" class="btn-primary">Submit Safety Report</button>
    </form>
    <p class="section-label" style="margin-top:24px">My Safety Reports</p>
    <div id="safety-list"></div>
  `;

  initAttachmentUpload(container, (file) => { photoFile = file; });

  const subcat = container.querySelector('[name="subcategory"]');
  const susaNote = container.querySelector('#susa-note');
  const consInput = container.querySelector('#safety-consequence');
  const likeInput = container.querySelector('#safety-likelihood');

  subcat.addEventListener('change', () => {
    if (subcat.value === 'SUSA') {
      susaNote.style.display = 'block';
      consInput.value = 1; consInput.readOnly = true;
      likeInput.value = 1; likeInput.readOnly = true;
    } else {
      susaNote.style.display = 'none';
      consInput.readOnly = false;
      likeInput.readOnly = false;
      if (consInput.value === '1' && likeInput.value === '1') {
        consInput.value = ''; likeInput.value = '';
      }
    }
  });

  container.querySelector('#safety-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());

    // Use multipart if photo is attached
    if (photoFile) {
      const formData = buildMultipartForm(data, photoFile);
      // Fetch with multipart
      const res = await fetch('/api/safety/submit', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('authToken') || '') },
        body: formData
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) { toast('Error: ' + (result?.error || 'Failed')); return; }
      toast('Safety report submitted! Risk Score: ' + result.risk_score);
    } else {
      const res = await apiFetch('/api/safety/submit', { method: 'POST', body: JSON.stringify(data) });
      if (!res.ok) { toast('Error: ' + (res.data?.error || 'Failed')); return; }
      toast('Safety report submitted! Risk Score: ' + res.data.risk_score);
    }

    e.target.reset();
    // Reset photo UI
    const preview = container.querySelector('#safety-photo-preview');
    const removeBtn = container.querySelector('#safety-photo-remove');
    const errorEl = container.querySelector('#safety-photo-error');
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    if (removeBtn) removeBtn.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
    photoFile = null;
    susaNote.style.display = 'none';
    consInput.readOnly = false; likeInput.readOnly = false;
    loadSafetyList();
  });

  loadSafetyList();
}

async function loadSafetyList() {
  const res = await apiFetch('/api/safety/submit');
  const container = document.getElementById('safety-list');
  if (!container) return;
  if (!res.ok) { container.innerHTML = '<div class="empty">Error loading</div>'; return; }
  const items = res.data?.submissions || [];
  if (!items.length) { container.innerHTML = '<div class="empty">No safety reports yet. Start by submitting one above.</div>'; return; }
  container.innerHTML = items.map(s => `
    <div class="sub-card ${s.status.toLowerCase()}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <h4 style="margin:0">${esc(s.title)}</h4>
        ${currentUser?.role === 'Admin' ? '<button class="btn btn-sm" style="background:#991b1b;color:#fff" onclick="adminDeleteSafety(' + (s.id) + ',\'' + (esc(s.title)) + '\')">Delete</button>' : ''}
      </div>
      <div class="sub-meta">${fmtDate(s.created_at)} · ${esc(s.subcategory)} · Risk: ${s.risk_score || (s.consequence * s.likelihood)} · ${statusBadge(s.status)}</div>
      <div class="sub-excerpt">${esc(s.description)}</div>
      ${s.attachment_url ? '<div style="margin-top:8px"><img src="/api/attachments/' + (s.attachment_url) + '" style="max-height:80px;border-radius:8px;border:1px solid var(--border)" alt="attachment"/></div>' : ''}
      ${s.reward_points > 0 ? '<div style="color:var(--green-light);font-size:13px;font-weight:600">+' + (s.reward_points) + ' pts earned</div>' : ''}
    </div>
  `).join('');
}

window.adminDeleteSafety = async function(id, title) {
  if (!confirm(`Delete safety report "${title}"? This cannot be undone.`)) return;
  const res = await apiDelete(`/api/safety/${id}`);
  if (res.ok) { toast('Deleted'); loadSafetyList(); }
  else { toast(res.data?.error || 'Delete failed'); }
};

async function renderQCForm(container) {
  let teamMembers = [];
  // managers (role_id=3) are the only role available with full_name for approvers via /api/data
  // SIC and Admin are not exposed in the managers/operators arrays, so use managers only
  let approverOptions = '<option value="">Loading...</option>';
  let evaluatorOptions = '<option value="">Loading...</option>';
  try {
    const res = await apiFetch('/api/data');
    if (res.ok) {
      const managers = res.data?.managers || [];
      approverOptions = managers.length
        ? managers.map(function(m) { return '<option value="' + (m.id) + '">' + (esc(m.full_name)) + '</option>'; }).join('')
        : '<option value="">No managers available</option>';
      const evaluators = res.data?.evaluators || [];
      evaluatorOptions = evaluators.length
        ? evaluators.map(function(ev) { return '<option value="' + (ev.id) + '">' + (esc(ev.full_name)) + ' (' + (esc(ev.dept_code || 'EVAL')) + ')</option>'; }).join('')
        : '<option value="">No evaluators available</option>';
    }
  } catch {}

  container.innerHTML = `
    <div class="module-header">
      <div class="module-icon qc">${ICONS.qc}</div>
      <div class="module-header-text"><h3>Quality Circle Project</h3><p>Team-based problem solving with structured 12-step methodology</p></div>
    </div>
    <form id="qc-form" class="card">
      <div class="form-row"><label>Project Title *</label><input name="title" required minlength="3" placeholder="Enter project title"/></div>
      <div class="form-row"><label>Date</label><input name="submission_date" type="date" value="${new Date().toISOString().split('T')[0]}" readonly /></div>
      <div class="form-row"><label>Problem Statement *</label><textarea name="problem_statement" required rows="3" placeholder="Describe the problem to be solved"></textarea></div>
      <div class="form-row"><label>Project Description</label><textarea name="project_description" rows="3" placeholder="Detailed description of the project"></textarea></div>
      <div class="form-row"><label>Root Cause</label><textarea name="root_cause" rows="2" placeholder="Identified root cause of the problem"></textarea></div>
      <div class="form-row"><label>Tangible Benefits</label><textarea name="tangible_benefits" rows="2" placeholder="Measurable benefits (cost savings, productivity, etc.)"></textarea></div>
      <div class="form-row"><label>Intangible Benefits</label><textarea name="intangible_benefits" rows="2" placeholder="Non-measurable benefits (morale, safety awareness, etc.)"></textarea></div>
      <div class="form-row"><label>Department ID</label><input name="department_id" type="number" placeholder="Leave blank to use your department"/></div>
      <div class="form-row"><label>Approver *</label>
        <select name="approver_id" required>
          <option value="">Select approver...</option>
          ${approverOptions}
        </select></div>
      <div class="form-row"><label>Evaluator *</label>
        <select name="evaluator_id" required>
          <option value="">Select evaluator...</option>
          ${evaluatorOptions}
        </select></div>
      <div class="form-row">
        <label>Team Members <small style="font-weight:400;color:var(--charcoal-xlight)">(min 3 – max 6)</small></label>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <select id="team-member-select" style="flex:1">
            <option value="">Select operator...</option>
          </select>
          <button type="button" id="add-team-member" class="btn-secondary" disabled>+ Add</button>
        </div>
        <div id="team-chips" style="display:flex;flex-wrap:wrap;gap:6px;min-height:32px"></div>
        <div id="team-counter" style="font-size:13px;color:var(--charcoal-xlight);margin-top:4px">Team Members: 0 / 6 (min 3)</div>
        <input name="team_members" id="team-members-input" type="hidden"/>
      </div>

      <div class="form-row">
        <label>Attach Photo <span style="font-weight:400;color:var(--charcoal-xlight);text-transform:none;letter-spacing:0;font-size:11px"> · Optional · Max 1MB</span></label>
        <div class="photo-upload-zone" id="qc-photo-zone">
          <div class="zone-icon"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <span class="zone-text">Tap to attach a photo</span>
          <span class="zone-hint">JPG, PNG, WEBP · Max 1MB</span>
          <input type="file" class="photo-upload-input" accept="image/*"/>
        </div>
        <div class="photo-upload-error" id="qc-photo-error"></div>
        <div class="photo-preview" id="qc-photo-preview">
          <img src="" alt="Attachment preview"/>
          <button type="button" class="photo-remove-btn" id="qc-photo-remove">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <button type="submit" class="btn-primary" id="qc-submit-btn" disabled>Submit QC Circle Project</button>
    </form>
  `;

  let photoFile = null;
  initAttachmentUpload(container, (file) => { photoFile = file; });

  const select = container.querySelector('#team-member-select');
  const addBtn = container.querySelector('#add-team-member');
  const chips = container.querySelector('#team-chips');
  const counter = container.querySelector('#team-counter');
  const hiddenInput = container.querySelector('#team-members-input');
  const submitBtn = container.querySelector('#qc-submit-btn');

  async function loadOperators() {
    const res = await apiFetch('/api/data');
    if (!res.ok) return;
    const { operators } = res.data;
    select.innerHTML = '<option value="">Select operator...</option>';
    operators.forEach(op => {
      const opt = document.createElement('option');
      opt.value = op.id;
      opt.textContent = `${op.full_name} (${op.employee_id})`;
      select.appendChild(opt);
    });
    addBtn.disabled = false;
  }

  function updateChips() {
    chips.innerHTML = '';
    teamMembers.forEach((id, idx) => {
      const name = select.querySelector(`option[value="${id}"]`)?.textContent || `User ${id}`;
      const chip = document.createElement('span');
      chip.style.cssText = 'background:var(--green-deep);color:#fff;padding:4px 10px;border-radius:16px;font-size:13px;display:inline-flex;align-items:center;gap:6px';
      chip.innerHTML = `${name}<span style="cursor:pointer;font-weight:700;margin-left:4px" data-idx="${idx}">×</span>`;
      chip.querySelector('span').onclick = () => removeMember(idx);
      chips.appendChild(chip);
    });
    const count = teamMembers.length;
    counter.textContent = `Team Members: ${count} / 6 (min 3)`;
    hiddenInput.value = JSON.stringify(teamMembers);
    submitBtn.disabled = count < 3;
    addBtn.style.display = count >= 6 ? 'none' : '';
  }

  function addMember(id) {
    if (!id || teamMembers.includes(id) || teamMembers.length >= 6) return;
    teamMembers.push(id);
    updateChips();
  }

  window.removeMember = function(idx) {
    teamMembers.splice(idx, 1);
    updateChips();
  };

  addBtn.onclick = () => addMember(parseInt(select.value));
  select.onchange = () => { if (select.value) addBtn.click(); };

  loadOperators();

  container.querySelector('#qc-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    const selectedMembers = JSON.parse(body.team_members || '[]');
    delete body.team_members;
    body.team_members = selectedMembers;
    body.submit = true;
    if (body.team_members.length < 3) { toast('Please add at least 3 team members'); return; }

    let qcResult;
    if (photoFile) {
      const formData = buildMultipartForm(body, photoFile);
      const rawRes = await fetch('/api/qc/submit', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('authToken') || '') },
        body: formData
      });
      qcResult = await rawRes.json().catch(() => ({}));
      if (!rawRes.ok) { toast('Error: ' + (qcResult?.error || 'Failed')); return; }
    } else {
      const res = await apiFetch('/api/qc/submit', { method: 'POST', body: JSON.stringify(body) });
      qcResult = res.data;
      if (!res.ok) { toast('Error: ' + (qcResult?.error || 'Failed')); return; }
    }
    toast(qcResult?.message || 'Quality Circle Project submitted!');
    e.target.reset();
    teamMembers = [];
    photoFile = null;
    updateChips();
    const preview = container.querySelector('#qc-photo-preview');
    const removeBtn = container.querySelector('#qc-photo-remove');
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    if (removeBtn) removeBtn.style.display = 'none';
  });
}

async function renderBehavioralForm(container) {
  const criteria = [
    { key: 'responsiveness', label: 'Responsiveness' },
    { key: 'preventive_value', label: 'Preventive Value' },
    { key: 'ownership', label: 'Ownership' },
    { key: 'attitude', label: 'Attitude' },
    { key: 'communication', label: 'Communication' },
    { key: 'problem_solving', label: 'Problem Solving' },
    { key: 'teamwork', label: 'Teamwork' },
    { key: 'standards_safety', label: 'Standards & Safety' }
  ];
  let operators = [];
  let hrUsers = [];
  try {
    const res = await apiFetch('/api/data');
    if (res.ok) {
      operators = res.data?.operators || [];
      hrUsers = res.data?.hrUsers || [];
    }
  } catch {}
  const operatorOptions = operators.length
    ? operators.map(function(o) { return '<option value="' + (o.id) + '">' + (esc(o.full_name)) + ' (' + (esc(o.employee_id)) + ')</option>'; }).join('')
    : '<option value="">No operators available</option>';
  const hrOptions = hrUsers.length
    ? hrUsers.map(function(h) { return '<option value="' + (h.id) + '">' + (esc(h.full_name)) + ' (' + (esc(h.employee_id)) + ')</option>'; }).join('')
    : '<option value="">No HR approvers available</option>';

  container.innerHTML = `
    <div class="module-header">
      <div class="module-icon behavioral">${ICONS.behavioral}</div>
      <div class="module-header-text"><h3>Behavioral Evaluation</h3><p>Monthly evaluation of soft skills and workplace behaviors</p></div>
    </div>
    <form id="behavioral-form" class="card">
      <div class="form-row"><label>Employee *</label><select name="user_id" required><option value="">Select operator...</option>${operatorOptions}</select></div>
      <div class="form-row"><label>Date</label><input name="submission_date" type="date" value="${new Date().toISOString().split('T')[0]}" readonly /></div>
      <div class="form-row"><label>HR Approver *</label><select name="selected_hr_id" id="beh-hr-select" required><option value="">Select HR approver...</option>${hrOptions}</select></div>
      <div class="form-row"><label>Month *</label><input name="month" type="number" min="1" max="12" required placeholder="1-12"/></div>
      <div class="form-row"><label>Year *</label><input name="year" type="number" min="2024" required placeholder="e.g. 2025"/></div>
      ${criteria.map(c => `
        <div class="form-row"><label>${c.label} (1–3) *</label>
          <input name="${c.key}" type="number" min="1" max="3" required placeholder="1=Needs Improvement, 2=Meets Expectation, 3=Exceeds"/>
        </div>
      `).join('')}
      <div class="form-row"><label>Comment *</label><textarea name="comment" required minlength="3" rows="2" placeholder="Overall feedback and observations"></textarea></div>

      <div class="form-row">
        <label>Attach Photo <span style="font-weight:400;color:var(--charcoal-xlight);text-transform:none;letter-spacing:0;font-size:11px"> · Optional · Max 1MB</span></label>
        <div class="photo-upload-zone" id="beh-photo-zone">
          <div class="zone-icon"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <span class="zone-text">Tap to attach a photo</span>
          <span class="zone-hint">JPG, PNG, WEBP · Max 1MB</span>
          <input type="file" class="photo-upload-input" accept="image/*"/>
        </div>
        <div class="photo-upload-error" id="beh-photo-error"></div>
        <div class="photo-preview" id="beh-photo-preview">
          <img src="" alt="Attachment preview"/>
          <button type="button" class="photo-remove-btn" id="beh-photo-remove">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <button type="submit" class="btn-primary">Submit Behavioral Evaluation</button>
    </form>
  `;

  let photoFile = null;
  initAttachmentUpload(container, (file) => { photoFile = file; });

  container.querySelector('#behavioral-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    ['user_id', 'month', 'year', ...criteria.map(c => c.key)].forEach(k => {
      if (body[k] !== undefined) body[k] = parseInt(body[k]);
    });

    let behResult;
    if (photoFile) {
      const formData = buildMultipartForm(body, photoFile);
      const rawRes = await fetch('/api/behavioral/evaluate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('authToken') || '') },
        body: formData
      });
      behResult = await rawRes.json().catch(() => ({}));
      if (!rawRes.ok) { toast('Error: ' + (behResult?.error || 'Failed')); return; }
    } else {
      const res = await apiFetch('/api/behavioral/evaluate', { method: 'POST', body: JSON.stringify(body) });
      behResult = res.data;
      if (!res.ok) { toast('Error: ' + (behResult?.error || 'Failed')); return; }
    }
    toast('Behavioral evaluation submitted!');
    e.target.reset();
    photoFile = null;
    const preview = container.querySelector('#beh-photo-preview');
    const removeBtn = container.querySelector('#beh-photo-remove');
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    if (removeBtn) removeBtn.style.display = 'none';
  });
}