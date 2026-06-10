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
  const canReviewKaizenImpl = ['Manager', 'Admin'].includes(role);
  const canEvaluateKaizen = ['Manager', 'Admin'].includes(role);
  const canReviewQC = ['Manager', 'QC Panel Member', 'Admin'].includes(role);
  const canReviewBehavioral = ['Manager', 'SIC', 'HR', 'Admin'].includes(role);

  const tabs = [
    canReviewSafety && { id: 'safety', label: 'Safety' },
    canReviewQuality && { id: 'quality', label: 'Quality' },
    canReviewKaizen && { id: 'kaizen', label: 'Kaizen Ideas' },
    canReviewKaizenImpl && { id: 'kaizen-impl', label: 'Kaizen Implementations' },
    canEvaluateKaizen && { id: 'kaizen-eval', label: 'Kaizen Evaluation' },
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
  else if (type === 'kaizen-impl') await loadKaizenImplReview(container);
  else if (type === 'kaizen-eval') await loadKaizenEvaluation(container);
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



async function loadKaizenEvaluation(container) {
  const res = await apiFetch('/api/kaizen/evaluate');
  const items = res.ok ? (res.data.submissions || []) : [];
  if (!items.length) {
    container.innerHTML = '<div class="empty">No kaizens assigned to you for evaluation.</div>';
    return;
  }

  const scoreLabel = { 1: '1 - Low', 2: '2 - Medium', 3: '3 - High' };

  container.innerHTML = items.map(function(item) {
    return '<div class="sub-card pending" data-id="' + item.id + '">' +
      '<h4>' + esc(item.title) + '</h4>' +
      '<div class="sub-meta">' + esc(item.submitter_name) + ' · ' + fmtDate(item.created_at) + ' · ' + statusBadge(item.status) + '</div>' +
      '<div class="sub-excerpt">' + esc(item.description || '') + '</div>' +
      (item.attachment_url ? '<div style="margin:8px 0"><img src="/api/attachments/' + item.attachment_url + '" style="max-height:120px;border-radius:8px;border:1px solid var(--border)" alt="evidence"/></div>' : '') +
      '<div style="margin:12px 0">' +
        '<p style="font-weight:600;font-size:13px;margin-bottom:8px">Score each criterion (1=Low, 2=Medium, 3=High):</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<div class="form-row" style="margin:0"><label style="font-size:12px">Ease of Implementation</label>' +
          '<select id="eval-ease-' + item.id + '" style="width:100%"><option value="">-</option><option value="1">1 - Easy</option><option value="2">2 - Medium</option><option value="3">3 - Complex</option></select></div>' +
          '<div class="form-row" style="margin:0"><label style="font-size:12px">Quality Impact</label>' +
          '<select id="eval-quality-' + item.id + '" style="width:100%"><option value="">-</option><option value="1">1 - Low</option><option value="2">2 - Medium</option><option value="3">3 - High</option></select></div>' +
          '<div class="form-row" style="margin:0"><label style="font-size:12px">Safety Impact</label>' +
          '<select id="eval-safety-' + item.id + '" style="width:100%"><option value="">-</option><option value="1">1 - Low</option><option value="2">2 - Medium</option><option value="3">3 - High</option></select></div>' +
          '<div class="form-row" style="margin:0"><label style="font-size:12px">Yield Impact</label>' +
          '<select id="eval-yield-' + item.id + '" style="width:100%"><option value="">-</option><option value="1">1 - Low</option><option value="2">2 - Medium</option><option value="3">3 - High</option></select></div>' +
          '<div class="form-row" style="margin:0"><label style="font-size:12px">Cost Saving</label>' +
          '<select id="eval-cost-' + item.id + '" style="width:100%"><option value="">-</option><option value="1">1 - Low</option><option value="2">2 - Medium</option><option value="3">3 - High</option></select></div>' +
        '</div>' +
        '<div class="form-row" style="margin-top:8px"><label style="font-size:12px">Comment</label>' +
        '<textarea id="eval-comment-' + item.id + '" rows="2" class="feedback-box" placeholder="Evaluation notes..."></textarea></div>' +
      '</div>' +
      '<div class="action-row">' +
        '<button class="btn-approve" onclick="submitKaizenEval(' + item.id + ')">Submit Evaluation</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function loadKaizenImplReview(container) {
  const res = await apiFetch('/api/kaizen/submit?status=Implemented');
  const items = res.ok ? (res.data.submissions || []) : [];
  if (!items.length) { container.innerHTML = '<div class="empty">No implementations pending your review.</div>'; return; }

  container.innerHTML = items.map(item => `
    <div class="sub-card pending" data-id="${item.id}">
      <h4>${esc(item.title)}</h4>
      <div class="sub-meta">${esc(item.submitter_name)} · ${fmtDate(item.created_at)} · ${statusBadge(item.status)}</div>
      <div class="sub-excerpt">${esc(item.description || item.problem || '')}</div>
      ${item.attachment_url ? '<div style="margin:8px 0"><img src="/api/attachments/' + item.attachment_url + '" style="max-height:120px;border-radius:8px;border:1px solid var(--border)" alt="evidence"/></div>' : ''}
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
        Mode: ${esc(item.implementation_mode || 'self')}
        ${item.tangible_benefits ? ' · Tangible: ' + esc(item.tangible_benefits) : ''}
      </div>
      <textarea id="fb-kaizen-impl-${item.id}" class="feedback-box" rows="2" placeholder="Review comment (optional)..."></textarea>
      <div class="action-row">
        <button class="btn-approve" onclick="reviewImplAction(${item.id},'approve')">✅ Approve & Send to Evaluator</button>
        <button class="btn-reject" onclick="reviewImplAction(${item.id},'reject')">❌ Reject Implementation</button>
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

  // Show correct message based on action (handles both lowercase and Capitalized)
  const actionLower = action.toLowerCase();
  let msg = res.data?.message;
  if (!msg) {
    if (actionLower === 'screen')   msg = '✅ Kaizen screened successfully!';
    else if (actionLower === 'approve' || action === 'Approved') msg = '✅ Approved!';
    else if (actionLower === 'reject' || action === 'Rejected')  msg = '❌ Rejected';
    else msg = action + ' successful';
  }
  toast(msg);
  // Reload the active tab
  const activeTab = document.querySelector('#review-tabs .tab-btn.active');
  if (activeTab) activeTab.click();
  else renderReviewQueue();
};

window.openQCScreen = function(projectId) {
  toast('Quality Circle Project 12-Step screening: use Admin panel for detailed scoring. Project ID: ' + projectId);
};

window.reviewImplAction = async function(id, action) {
  const commentEl = document.getElementById('fb-kaizen-impl-' + id);
  const comment = commentEl?.value?.trim() || '';
  if (action === 'reject' && !comment) { toast('Please provide a rejection reason'); commentEl?.focus(); return; }
  const res = await apiFetch('/api/kaizen/review-impl', { method: 'POST', body: JSON.stringify({ id, action, comment }) });
  if (!res.ok) { toast('Error: ' + (res.data?.error || 'Failed')); return; }
  toast(res.data?.message || (action === 'approve' ? 'Approved!' : 'Rejected'));
  const activeTab = document.querySelector('#review-tabs .tab-btn.active');
  if (activeTab) activeTab.click();
};


window.submitKaizenEval = async function(id) {
  const ease    = document.getElementById('eval-ease-'    + id)?.value;
  const quality = document.getElementById('eval-quality-' + id)?.value;
  const safety  = document.getElementById('eval-safety-'  + id)?.value;
  const yld     = document.getElementById('eval-yield-'   + id)?.value;
  const cost    = document.getElementById('eval-cost-'    + id)?.value;
  const comment = document.getElementById('eval-comment-' + id)?.value || '';

  if (!ease || !quality || !safety || !yld || !cost) {
    toast('Please score all 5 criteria before submitting');
    return;
  }

  const body = {
    kaizen_id: id,
    ease_implementation: parseInt(ease),
    impact_quality: parseInt(quality),
    impact_safety: parseInt(safety),
    impact_yield: parseInt(yld),
    cost_saving: parseInt(cost),
    comment
  };

  const res = await apiFetch('/api/kaizen/evaluate', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) { toast('Error: ' + (res.data?.error || 'Failed')); return; }
  toast(res.data?.message || 'Evaluation submitted! Kaizen closed with points.');
  const activeTab = document.querySelector('#review-tabs .tab-btn.active');
  if (activeTab) activeTab.click();
};
