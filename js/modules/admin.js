import { apiFetch, apiPost, apiPut, apiDelete, esc, toast } from '../app.js';

export const renderAdmin = async () => {
  const el = document.getElementById('admin-content');
  if (!el) return;
  el.innerHTML = '<div class="loading">Loading admin...</div>';

  const res = await apiFetch('/api/admin/analytics');
  if (!res.ok) { el.innerHTML = '<div class="empty">Error loading admin data</div>'; return; }
  const { summary, by_module, top_performers, by_department } = res.data;

  el.innerHTML = `
    <div class="page-header"><h1>Admin</h1></div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="analytics" onclick="switchAdminTab('analytics')" style="padding:8px 14px">Analytics</button>
      <button class="tab-btn" data-tab="users" onclick="switchAdminTab('users')" style="padding:8px 14px">Users</button>
      <button class="tab-btn" data-tab="create" onclick="switchAdminTab('create')" style="padding:8px 14px">Create User</button>
      <button class="tab-btn" data-tab="audit" onclick="switchAdminTab('audit')" style="padding:8px 14px">Audit Trail</button>
    </div>
    <div id="admin-analytics">
      <div class="card">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;text-align:center">
          <div><div style="font-size:28px;font-weight:800;color:var(--navy)">${summary.active_users||0}</div><div style="font-size:11px;color:var(--muted)">Active Users</div></div>
          <div><div style="font-size:28px;font-weight:800;color:var(--navy)">${summary.total_rewards_distributed||0}</div><div style="font-size:11px;color:var(--muted)">Points Distributed</div></div>
          <div><div style="font-size:28px;font-weight:800;color:var(--navy)">${summary.total_transactions||0}</div><div style="font-size:11px;color:var(--muted)">Transactions</div></div>
        </div>
`
      </div>
      <div class="kpi-grid">${Object.entries(by_module||{}).map(([mod,stats])=>`<div class="kpi-card"><div class="kpi-val">${stats.total||0}</div><div class="kpi-label">${mod} Submissions</div></div>`).join('')}</div>
      <p class="section-label">Top Performers</p>
      ${renderTopPerformers(top_performers)}
      <p class="section-label">By Department</p>
      <div class="card">${(by_department||[]).map(d=>`<div class="ledger-row"><span>${esc(d.department)}</span><span class="ledger-pts">${d.points||0} pts &#183; ${d.transactions||0}</span></div>`).join('')||'<div class="empty">No data</div>'}</div>
    </div>
    <div id="admin-users" style="display:none"></div>
    <div id="admin-create" style="display:none"></div>
    <div id="admin-audit" style="display:none"></div>
  `;
  window.switchAdminTab = switchAdminTab;
}

function renderTopPerformers(list) {
  if (!list?.length) return '<div class="empty">No top performers yet</div>';
  return list.map((p,i)=>`
    <div class="lb-row"><div class="lb-rank">${i+1}</div><div class="avatar">${esc(p.name).substring(0,2)}</div><div class="lb-info"><h4>${esc(p.name)}</h4><p>${esc(p.department)}</p></div><div class="lb-pts">${p.total_points||0}</div></div>
  `).join('');
}

/* ---------- Tab Switching ---------- */
async function switchAdminTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById('admin-analytics').style.display = (tab==='analytics')?'':'none';
  document.getElementById('admin-users').style.display = (tab==='users')?'':'none';
  document.getElementById('admin-create').style.display = (tab==='create')?'':'none';
  document.getElementById('admin-audit').style.display = (tab==='audit')?'':'none';
  if (tab==='users') await renderUserList();
  if (tab==='create') await renderCreateUser();
  if (tab==='audit') await loadAuditTrail();
}

/* ---------- User List ---------- */
let showInactive = false;
async function renderUserList() {
  const el = document.getElementById('admin-users');
  el.innerHTML = '<div class="loading">Loading users...</div>';
  const res = await apiFetch('/api/users');
  if (!res.ok) { el.innerHTML = '<div class="empty">Error loading users</div>'; return; }
  const allUsers = res.data.users || [];
  const users = showInactive ? allUsers : allUsers.filter(u => u.is_active !== 0);
  const currentUserId = JSON.parse(localStorage.getItem('currentUser') || '{}').id;

  el.innerHTML = `
    <p class="section-label">All Users (${users.length})</p>
    <div style="margin-bottom:8px">
      <label style="font-size:13px;cursor:pointer">
        <input type="checkbox" id="show-inactive-toggle" ${showInactive?'checked':''} onchange="toggleInactiveUsers()"/>
        Show inactive users
      </label>
    </div>
    <div class="card" style="overflow-x:auto">
      <table class="ledger-table" style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:8px;text-align:left">Emp ID</th>
          <th style="padding:8px;text-align:left">Name</th>
          <th style="padding:8px;text-align:left">Email</th>
          <th style="padding:8px;text-align:left">Role</th>
          <th style="padding:8px;text-align:left">Department</th>
          <th style="padding:8px;text-align:left">Status</th>
          <th style="padding:8px;text-align:center">Actions</th>
        </tr></thead>
        <tbody>
          ${users.map(u=>`
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:8px">${esc(u.employee_id||'')}</td>
              <td style="padding:8px">${esc(u.full_name||'')}</td>
              <td style="padding:8px;font-size:11px">${esc(u.email||'')}</td>
              <td style="padding:8px"><span class="badge ${(u.role||'').toLowerCase().replace(/\s+/g,'-')}">${esc(u.role||'')}</span></td>
              <td style="padding:8px">${esc(u.department||'')}</td>
              <td style="padding:8px">${u.is_active==0?'<span style="color:var(--muted)">Inactive</span>':'<span style="color:var(--green)">Active</span>'}</td>
              <td style="padding:8px;text-align:center">
                <button class="btn btn-sm" style="background:#1d4ed8;color:#fff;margin-right:4px" onclick="promptResetPassword(${u.id},'${esc(u.full_name||'')}')">Reset Pwd</button>${String(u.id) !== String(currentUserId) ? `<button class="btn btn-sm" style="background:#991b1b;color:#fff" onclick="confirmDeleteUser(${u.id},'${esc(u.full_name||'')}')">Delete</button>` : ''}
              </td>
            </tr>
          `).join('')}
          ${users.length===0?'<tr><td colspan="7" class="empty" style="padding:16px">No users found</td></tr>':''}
        </tbody>
      </table>
    </div>
  `;
}

window.toggleInactiveUsers = function() {
  showInactive = document.getElementById('show-inactive-toggle').checked;
  renderUserList();
};

window.confirmDeleteUser = async function(userId, fullName) {
  if (!confirm(`Delete user "${fullName}"? This cannot be undone.`)) return;
  const res = await apiDelete(`/api/users?id=${userId}`);
  if (res.ok) { toast(`User ${fullName} deleted`); renderUserList(); }
  else { toast(res.data?.error || 'Delete failed'); }
};

/* ---------- Create User Form ---------- */
async function fetchLookupData() {
  const res = await apiFetch('/api/data');
  if (!res.ok) return null;
  return res.data;
}

async function renderCreateUser() {
  const el = document.getElementById('admin-create');
  el.innerHTML = '<div class="loading">Loading form data...</div>';

  const data = await fetchLookupData();
  if (!data) {
    el.innerHTML = '<div class="empty">Failed to load form data. Please refresh and try again.</div>';
    return;
  }

  const { departments, shifts, roles, managers } = data;
  el.innerHTML = `
    <p class="section-label">Create New User</p>
    <div class="card" style="max-width:600px">
      <form id="user-create-form">
        <div class="form-row"><label>Full Name *</label><input name="full_name" type="text" required placeholder="John Doe"></div>
        <div class="form-row"><label>Short Name</label><input name="short_name" type="text" placeholder="John"></div>
        <div class="form-row"><label>Employee ID *</label><input name="employee_id" type="text" required placeholder="EMP001"></div>
        <div class="form-row"><label>Email *</label><input name="email" type="email" required placeholder="john@company.com"></div>
        <div class="form-row"><label>Password *</label><input name="password" type="text" required value="OORJA@2026" minlength="6"></div>
        <div class="form-row"><label>Role *</label>
          <select name="role_name" required><option value="">-- Select Role --</option>
            ${roles.map(r=>`<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Department</label>
          <select name="department_id"><option value="">-- Select --</option>
            ${departments.map(d=>`<option value="${d.id}">${esc(d.name)} (${esc(d.code||'')})</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Shift</label>
          <select name="shift_id"><option value="">-- Select --</option>
            ${shifts.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Reporting Manager</label>
          <select name="manager_id"><option value="">-- Select --</option>
            ${managers.map(m=>`<option value="${m.id}">${esc(m.full_name)} (${esc(m.employee_id)})</option>`).join('')}
          </select>
        </div>
        <div class="form-row"><label>Designation</label><input name="designation" type="text" placeholder="Sr. Operator"></div>
        <div class="form-row"><label>Section / Unit</label><input name="section" type="text" placeholder="Shop Floor A"></div>
        <button type="submit" class="btn btn-primary">Create User</button>
      </form>
    </div>
  `;
  document.getElementById('user-create-form').addEventListener('submit', onCreateUser);
}

async function onCreateUser(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  for (const k of ['department_id','manager_id']) {
    if (!data[k]) data[k]=null;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Creating...';
  const res = await apiPost('/api/users', data);
  btn.disabled = false; btn.textContent = 'Create User';
  if (res.ok) { toast(res.data.message || 'Created'); e.target.reset(); }
  else { toast(res.data?.error || 'Failed'); }
}

/* ---------- Reset Password ---------- */
window.promptResetPassword = async function(userId, fullName) {
  const pwd = prompt(`Reset password for ${fullName}? Enter new password (min 6 chars):`);
  if (!pwd || pwd.length < 6) { toast('Password too short (min 6 chars)'); return; }
  const res = await apiPut('/api/users', { user_id: userId, new_password: pwd });
  toast(res.ok ? `Password reset for ${fullName}` : (res.data?.error || 'Reset failed'));
};

/* ---------- Audit Trail ---------- */
window.loadAuditTrail = async function() {
  const res = await apiFetch('/api/audit-trail');
  const container = document.getElementById('admin-audit');
  if (!res.ok) { container.innerHTML = '<div class="empty">Error loading audit trail</div>'; return; }
  const { logs, total } = res.data;
  if (!logs.length) { container.innerHTML = '<div class="empty">No audit trail records yet.</div>'; return; }
  container.innerHTML = `
    <div style="margin-bottom:12px;font-size:13px;color:var(--muted)">${total} total records</div>
    <div style="overflow-x:auto">
      <table class="users-table" style="width:100%;font-size:13px">
        <thead><tr style="background:var(--surface);color:var(--navy);font-weight:700">
          <th style="text-align:left;padding:8px">When</th>
          <th style="text-align:left;padding:8px">Admin / User</th>
          <th style="text-align:left;padding:8px">Action</th>
          <th style="text-align:left;padding:8px">Entity</th>
          <th style="text-align:left;padding:8px">ID</th>
          <th style="text-align:left;padding:8px">Details</th>
        </tr></thead>
        <tbody>
          ${logs.map(l => `
            <tr style="border-top:1px solid var(--border)">
              <td style="padding:8px;white-space:nowrap">${l.created_at}</td>
              <td style="padding:8px">${esc(l.user_name)} (${l.user_id})</td>
              <td style="padding:8px"><span class="badge badge-pill" style="font-size:11px">${esc(l.action)}</span></td>
              <td style="padding:8px">${esc(l.entity_type || '-')}</td>
              <td style="padding:8px">${esc(l.entity_id || '-')}</td>
              <td style="padding:8px;max-width:240px;overflow-wrap:break-word">${esc(l.details || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
};
