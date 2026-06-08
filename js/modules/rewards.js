import { apiFetch, esc, fmtDate, toast, currentUser } from '../app.js';

export const renderRewards = async () => {
  const el = document.getElementById('reward-content');
  if (!el) return;
  el.innerHTML = '<div class="loading">Loading wallet...</div>';

  const res = await apiFetch('/api/rewards');
  if (!res.ok) { el.innerHTML = '<div class="empty">Error loading rewards</div>'; return; }

  const { total_points, breakdown, recent_transactions } = res.data;

  el.innerHTML = `
    <div class="page-header"><h1>My Wallet</h1></div>
    <div class="reward-hero">
      <div class="emp-name">${esc(currentUser?.name || currentUser?.full_name || 'Employee')}</div>
      <div class="pts-big">${total_points || 0}</div>
      <div class="pts-label">Total Points Earned</div>
    </div>
    <p class="section-label">Breakdown</p>
    <div class="card">
      ${Object.entries(breakdown || {}).map(([cat, pts]) => `
        <div class="ledger-row"><span style="text-transform:capitalize">${cat}</span><span class="ledger-pts">${pts || 0}</span></div>
      `).join('') || '<div class="empty">No points yet</div>'}
    </div>
    <p class="section-label">Recent Transactions</p>
`;}
    <div class="card">
      ${(recent_transactions || []).length ? (recent_transactions || []).slice(0, 10).map(t => `
        <div class="ledger-row">
          <div><div style="font-size:13px;font-weight:500">${esc(t.description)}</div>
          <div style="font-size:11px;color:var(--muted)">${fmtDate(t.created_at)} · ${t.source_type}</div></div>
          <span class="ledger-pts">+${t.points}</span>
        </div>
      `).join('') : '<div class="empty">No transactions yet</div>'}
    </div>
  `;
}
