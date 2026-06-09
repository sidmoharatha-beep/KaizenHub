import { apiFetch, esc, statusBadge, fmtDate, toast, currentUser } from '../app.js';

export async function renderReviewQueue() {
  const el = document.getElementById('review-content');
  if (!el) return;

  const role = currentUser?.role || 'Operator';

  // Determine which tabs are visible based on role
  // Managers/SIC: Safety, Quality, Kaizen, QC, Behavioral
  // HR: Behavioral only
  // Admin: all
  const canReviewSafety = ['Manager', 'Admin'].includes(role);
  const canReviewQuality = ['Manager', 'Admin'].includes(role);
  const canReviewKaizen = ['Manager', 'Admin'].includes(role);
  const canReviewQC = ['Manager', 'QC Panel Member', 'Admin'].includes(role);
  const canReviewBehavioral = ['Manager', 'SIC', 'HR', 'Admin'].includes(role);

  const tabs = [
    canReviewSafety && { id: 'safety', label: 'Safety' },
    canReviewQuality && { id: 'quality', label: 'Quality' },
    canReviewKaizen && { id: 'kaizen', label: 'Kaizen' },
    canReviewQC && { id: 'qc', label: 'Quality Circle Project' },
    canReviewBehavioral && { id: 'behavioral', label: 'Behavioral' },
  ].filter(Boolean);

  if (!tabs.length) {
    el.innerHTML = '<div class="empty">No review permissions for your role.</div>';
    return;
  }

  el.innerHTML = `
    <div class="page-header"><h1>Review Queue</h1></div>
    <div class="tab-btns" id="review-tabs">
      ${tabs.map((t, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div id="review-tab-content"><div class="loading">Loading...</div></div>
  `;

  el.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadReviewTab(btn.dataset.tab);
    });
  });

  // Load first tab
  loadReviewTab(tabs[0].id);
}

async function loadReviewTab(type) {
  const container = document.getElementById('review-tab-content');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading...</div>';

  if (type === 'safety') await loadSafetyReview(container);
  else if (type === 'quality') await loadQualityReview(container);
  else if (type === 'kaizen') await loadKaizenReview(container);
  else if (type === 'qc') await loadQCReview(container);
  else if (type === 'behavioral') await loadBehavioralReview(container);
}

async function loadSafetyReview(container) {
  const res = await apiFetch('/api/safety/review');
  const items = res.ok ? (res.data.submissions || []) : [];
  if (!items.length) { container.innerHTML = '<div class="empty">No pending safety reports.</div>'; return; }

  container.innerHTML = items.map(item => `
    <div class="sub-card pending" data-id="${item.id}">
      <h4>${esc(item.title)}</h4>
      <div class="sub-meta">${esc(item.submitter_name)} · ${esc(item.subcategory)} · Risk: ${item.consequence * item.likelihood} · ${fmtDate(item.created_at)} · ${statusBadge(item.status)}</div>
      <div class="sub-excerpt">${esc(item.description)}</div>
      <textarea id="fb-safety-${item.id}" class="feedback-box" rows="2" placeholder="Manager comment (required)..."></textarea>
      <div class="action-row">
        <button class="btn-approve" onclick="reviewAction('safety',${item.id},'Approved')">Approve</button>
        <button class="btn-reject" onclick="reviewAction('safety',${item.id},'Rejected')">Reject</button>
      </div>
    </div>
  `).join('');
}

async function loadQualityReview(container) {
  const res = await apiFetch('/api/quality/review');
  const items = res.ok ? (res.data.submissions || []) : [];
  if (!items.length) { container.innerHTML = '<div class="empty">No pending quality reports.</div>'; return; }

  container.innerHTML = items.map(item => `
    <div class="sub-card pending" data-id="${item.id}">
      <h4>${esc(item.title)}</h4>
      <div class="sub-meta">${esc(item.submitter_name || item.employee_name)} · ${fmtDate(item.created_at)} · ${statusBadge(item.status)}</div>
      <div class="sub-excerpt">${esc(item.description || '')}</div>
      <textarea id="fb-quality-${item.id}" class="feedback-box" rows="2" placeholder="Manager comment (required)..."></textarea>
      <div class="action-row">
        <button class="btn-approve" onclick="reviewAction('quality',${item.id},'Approved')">Approve</button>
        <button class="btn-reject" onclick="reviewAction('quality',${item.id},'Rejected')">Reject</button>
      </div>
    </div>
  `).join('');
}

async function loadKaizenReview(container) {
  // Show both Submitted (needs screening) and Screened (needs approval)
  const [submitted, screened] = await Promise.all([
    apiFetch('/api/kaizen/submit?status=Submitted'),
    apiFetch('/api/kaizen/submit?status=Screened')
  ]);
  const submittedItems = submitted.ok ? (submitted.data.submissions || []) : [];
  const screenedItems = screened.ok ? (screened.data.submissions || []) : [];

  if (!submittedItems.length && !screenedItems.length) {
    container.innerHTML = '<div class="empty">No pending kaizen ideas.</div>';
    return;
  }

  const renderGroup = (items, title, action1Label, action1, action2Label, action2, type) =>
    items.length ? `
      <p class="section-label">${title} (${items.length})</p>
      ${items.map(item => `
        <div class="sub-card pending" data-id="${item.id}">
          <h4>${esc(item.title)}</h4>
          <div class="sub-meta">${esc(item.submitter_name)} · ${fmtDate(item.created_at)} · ${statusBadge(item.status)}</div>
          <div class="sub-excerpt">${esc(item.problem || item.description || '')}</div>
          <textarea id="fb-${type}-${item.id}" class="feedback-box" rows="2" placeholder="Comment (optional)..."></textarea>
          <div class="action-row">
            <button class="btn-approve" onclick="reviewAction('${type}',${item.id},'${action1}')">${action1Label}</button>
            <button class="btn-reject" onclick="reviewAction('${type}',${item.id},'${action2}')">${action2Label}</button>
          </div>
        </div>
      `).join('')}
    ` : '';

  container.innerHTML =
    renderGroup(submittedItems, 'Awaiting Screening', 'Screen', 'screen', 'Reject', 'reject', 'kaizen-screen') +
    renderGroup(screenedItems, 'Awaiting Approval', 'Approve', 'approve', 'Reject', 'reject', 'kaizen');
}

async function loadQCReview(container) {
  const res = await apiFetch('/api/qc/submit?status=Submitted');
  const items = res.ok ? (res.data.projects || []) : [];
  if (!items.length) { container.innerHTML = '<div class="empty">No pending Quality Circle Projects.</div>'; return; }

  container.innerHTML = items.map(item => `
    <div class="sub-card pending" data-id="${item.id}">
      <h4>${esc(item.title)}</h4>
      <div class="sub-meta">${esc(item.owner_name)} · ${esc(item.department_name)} · ${item.member_count} members · ${fmtDate(item.created_at)} · ${statusBadge(item.status)}</div>
      <div class="sub-excerpt">${esc(item.problem_statement || '')}</div>
      <p style="font-size:12px;color:var(--muted);margin:6px 0 4px">Quality Circle Project screening requires 12 step-scores (0-5 each). Use the full admin panel for detailed scoring.</p>
      <div class="action-row">
        <button class="btn-secondary" onclick="openQCScreen(${item.id})">Screen (12-Step)</button>
      </div>
    </div>
  `).join('');
}

async function loadBehavioralReview(container) {
  const res = await apiFetch('/api/behavioral/list?status=HR+Approval');
  const items = res.ok ? (res.data.evaluations || []) : [];
  if (!items.length) { container.innerHTML = '<div class="empty">No behavioral evaluations pending HR approval.</div>'; return; }

  container.innerHTML = items.map(item => `
    <div class="sub-card pending" data-id="${item.id}">
      <h4>${esc(item.employee_name)} — ${item.month}/${item.year}</h4>
      <div class="sub-meta">Evaluated by: ${esc(item.evaluator_name)} · Recognition: <strong>${item.recognition || 'None'}</strong> · ${statusBadge(item.status)}</div>
      <div class="sub-excerpt">${esc(item.comment || '')}</div>
      <div class="action-row">
        <button class="btn-approve" onclick="reviewAction('behavioral',${item.id},'Approved')">Approve</button>
        <button class="btn-reject" onclick="reviewAction('behavioral',${item.id},'Rejected')">Reject</button>
      </div>
    </div>
  `).join('');
}

window.reviewAction = async function(type, id, action) {
  const commentEl = document.getElementById('fb-' + type + '-' + id);
  const manager_comment = commentEl?.value?.trim() || '';

  const endpoints = {
    safety: '/api/safety/review',
    quality: '/api/quality/review',
    kaizen: '/api/kaizen/approve',
    'kaizen-screen': '/api/kaizen/screen',
    behavioral: '/api/behavioral/approve'
  };

  const endpoint = endpoints[type];
  if (!endpoint) { toast('Unknown review type'); return; }

  let body;
  if (type === 'kaizen' || type === 'kaizen-screen') {
    body = { id, action: action.toLowerCase(), comment: manager_comment || null };
  } else if (type === 'behavioral') {
    body = { id, approved: action === 'Approved', comment: manager_comment || null };
  } else {
    if (!manager_comment || manager_comment.length < 3) {
      toast('Manager comment is required (min 3 chars)');
      if (commentEl) commentEl.focus();
      return;
    }
    body = { id, status: action, manager_comment };
  }

  const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) { toast('Error: ' + (res.data?.error || 'Failed')); return; }

  const toastMsg = {
    'Approved': 'Approved! ✅',
    'approve': 'Approved! ✅',
    'screen': 'Screened ✅ — awaiting approval',
    'Rejected': 'Rejected',
    'reject': 'Rejected',
  }[action] || action;
  toast(toastMsg);
  // Reload the active tab
  const activeTab = document.querySelector('#review-tabs .tab-btn.active');
  if (activeTab) activeTab.click();
  else renderReviewQueue();
};

window.openQCScreen = function(projectId) {
  toast('Quality Circle Project 12-Step screening: use Admin panel for detailed scoring. Project ID: ' + projectId);
};
