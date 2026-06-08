import { apiFetch, esc, fmtDate } from '../app.js';

export async function renderLeaderboard() {
  const el = document.getElementById('leaderboard-content');
  if (!el) return;
  el.innerHTML = '<div class="loading">Loading leaderboard...</div>';

  const res = await apiFetch('/api/leaderboard?category=overall&period=all_time&limit=20');
  if (!res.ok) { el.innerHTML = '<div class="empty">Error loading leaderboard</div>'; return; }

  const { leaderboard, my_position } = res.data;
  const cats = ['safety', 'quality', 'kaizen', 'qc', 'behavioral', 'overall'];

  el.innerHTML = `
    <div class="page-header"><h1>Leaderboard</h1></div>
    <div id="leaderboard-tabs" class="tab-btns">
      ${cats.map(c => `<button class="tab-btn ${c === 'overall' ? 'active' : ''}" data-cat="${c}" onclick="switchLb('${c}',this)">${c === 'qc' ? 'Quality Circle' : c}</button>`).join('')}
    </div>
    <div id="lb-table">
      ${renderLbRows(leaderboard, my_position)}
    </div>
  `;
}

const renderLbRows = (rows, me) => {
  if (!rows?.length) return '<div class="empty">No leaderboard data yet</div>';

  let html = `
    ${me?.points ? `<div class="card" style="background:linear-gradient(135deg,var(--bg),#fff);margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="lb-rank">#${me.rank || '-'}</div>
        <div class="lb-info"><h4>You</h4><p>${me.points || 0} pts</p></div>
      </div>
    </div>` : ''}
  `;

  html += rows.map((r, i) => `
    <div class="lb-row">
      <div class="lb-rank ${i < 3 ? 'top' : ''}">${i + 1}</div>
      <div class="avatar">${esc(r.name).substring(0, 2)}</div>
      <div class="lb-info"><h4>${esc(r.name)}</h4><p>${esc(r.department_name || '—')} · ${esc(r.shift_name || '—')}</p></div>
      <div class="lb-pts">${r.points || 0}</div>
    </div>
  `).join('');

  return html;
}

async function switchLb(cat, btn) {
  document.querySelectorAll('#leaderboard-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('lb-table').innerHTML = '<div class="loading">Loading...</div>';
  const res = await apiFetch(`/api/leaderboard?category=${cat}&period=all_time&limit=20`);
  const rows = res.ok ? res.data.leaderboard : []; const me = res.ok ? res.data.my_position : null;
  document.getElementById('lb-table').innerHTML = renderLbRows(rows, me);
}
