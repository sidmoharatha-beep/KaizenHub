import { apiFetch, esc, statusBadge, fmtDate, fmtDateTime, initials, toast } from '../app.js';

export async function renderDashboard() {
  const el = document.getElementById('home-content');
  if (!el) return;
  el.innerHTML = '<div class="loading">Loading dashboard...</div>';

  const res = await apiFetch('/api/dashboard');
  if (!res.ok) { el.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Error loading dashboard</div>'; return; }

  const { kpi, leaderboard, pending_reviews } = res.data;

  // Icon SVGs for KPI cards
  const kpiIcons = {
    safety: '<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>',
    quality: '<svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>',
    kaizen: '<svg viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>',
    qc: '<svg viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    behavioral: '<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'
  };

  el.innerHTML = `
    <div class="page-header"><h1>Dashboard</h1></div>

    <p class="section-label">Your Performance</p>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-icon">${kpiIcons.safety}</div>
        <div class="kpi-val">${kpi.safety.approved || 0}</div>
        <div class="kpi-label">Safety Ideas</div>
        <div class="kpi-desc">${kpi.safety.points || 0} pts earned</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${kpiIcons.quality}</div>
        <div class="kpi-val">${kpi.quality.approved || 0}</div>
        <div class="kpi-label">Quality Ideas</div>
        <div class="kpi-desc">${kpi.quality.points || 0} pts earned</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${kpiIcons.kaizen}</div>
        <div class="kpi-val">${kpi.kaizen.closed || 0}</div>
        <div class="kpi-label">Kaizen Closed</div>
        <div class="kpi-desc" style="color:var(--orange)">${kpi.kaizen.points || 0} pts earned</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${kpiIcons.qc}</div>
        <div class="kpi-val">${kpi.qc.closed || 0}</div>
        <div class="kpi-label">QC Circles</div>
        <div class="kpi-desc">${kpi.qc.in_progress || 0} in progress</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon">${kpiIcons.behavioral}</div>
        <div class="kpi-val">${kpi.behavioral.approved || 0}</div>
        <div class="kpi-label">Behavioral Evals</div>
        <div class="kpi-desc">${kpi.behavioral.points || 0} pts earned</div>
      </div>
    </div>

    ${pending_reviews && pending_reviews.total > 0 ? `
    <div class="alert-card">
      <div class="alert-icon">🔔</div>
      <div>
        <h4>${pending_reviews.total} items awaiting review</h4>
        <p>Safety: ${pending_reviews.safety} · Quality: ${pending_reviews.quality} · Kaizen: ${pending_reviews.kaizen} · Behavioral: ${pending_reviews.behavioral}</p>
      </div>
    </div>` : ''}

    <p class="section-label">Top Contributors</p>
    <div class="card">
      ${(leaderboard || []).map((r, i) => `
        <div class="lb-row">
          <div class="lb-rank ${i < 3 ? 'top' : ''}">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
          <div class="lb-avatar">${esc(initials(r.name))}</div>
          <div class="lb-info"><h4>${esc(r.name)}</h4><p>${esc(r.department_name || '—')}</p></div>
          <div class="lb-pts">${r.points || 0} <span>pts</span></div>
        </div>
      `).join('') || '<div class="empty"><div class="empty-icon">📊</div>No leaderboard data yet</div>'}
    </div>
  `;
}