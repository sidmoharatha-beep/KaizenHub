import { apiFetch, apiPost, setAuth, showPage, toast, esc, initials, currentUser, authToken } from './app.js';

export async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  if (!email || !pass) { errEl.style.display = 'block'; errEl.textContent = 'Email and password required'; return; }
  errEl.style.display = 'none';

  const res = await apiFetch('/api/auth', {
    method: 'POST', body: JSON.stringify({ email, password: pass })
  });
  if (!res.ok) { errEl.style.display = 'block'; errEl.textContent = res.data?.error || 'Login failed'; return; }

  setAuth(res.data.token, res.data.user);
  loadApp();
}

export async function loadApp() {
  if (!currentUser) { showAuth(); return; }
  const me = await apiFetch('/api/me');
  if (!me.ok) { doLogout(); return; }

  // /api/me returns { user: {...}, overview: {...}, ... }
  const meUser = me.data?.user || me.data;
  // Merge with currentUser (which has full_name, emp_id from login) for fallback
  const merged = { ...currentUser, ...meUser };
  setAuth(authToken, merged);

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  const roleName = merged.role || currentUser?.role || 'Operator';
  const roleClass = 'role-' + roleName.toLowerCase().replace(/\s+/g, '-').replace('panel-member', 'qc');
  document.getElementById('role-pill').className = 'role-pill ' + roleClass;
  document.getElementById('role-pill').textContent = roleName;
  // /api/me uses name+employee_id; login stores full_name+emp_id — support both
  const displayName = merged.name || merged.full_name || '';
  const displayId = merged.employee_id || merged.emp_id || '';
  const topbarSub = document.getElementById('topbar-sub');
  if (topbarSub) topbarSub.textContent = `${esc(displayName)} · ${esc(displayId)}`;

  // New topbar user chip
  const initialsEl = document.getElementById('user-avatar');
  const userNameEl = document.getElementById('user-name');
  const userRoleEl = document.getElementById('user-role-label');
  if (initialsEl) initialsEl.textContent = initials(displayName);
  if (userNameEl) userNameEl.textContent = esc(displayName);
  if (userRoleEl) userRoleEl.textContent = roleName;

  // Setup bottom nav
  setupNav(roleName);

  // Load notifications count
  loadNotificationsCount();

  // Show dashboard
  showPage('page-home');
  const mod = await import('./modules/dashboard.js');
  mod.renderDashboard();
}

export function doLogout() {
  apiFetch('/api/auth', { method: 'DELETE' }).catch(() => {});
  setAuth(null, null);
  showAuth();
}

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function setupNav(role) {
  let pages = ['home', 'submit', 'review', 'learning'];
  if (!role || role === 'Operator') pages.push('rewards');
  if (role && role.toLowerCase() === 'admin') pages.push('admin');
  const el = document.getElementById('bottom-nav');
  if (!el) return;

  el.innerHTML = pages.map(p => navItem(p)).join('');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.addEventListener('click', () => navigateToPage(n.dataset.page));
  });
}

function navItem(page) {
  const icons = {
    admin: '<path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"/>',
    home: '<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3M9 21h3"/>',
    submit: '<path d="M12 4v16m8-8H4"/>',
    review: '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2m-4 0v14"/>',
    rewards: '<path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>',
    learning: '<path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/>'
  };
  const labels = { home:'Home', submit:'Submit', review:'Review', rewards:'Rewards', learning:'Learning', admin:'Admin' };
  return `<div class="nav-item" data-page="${page}">
    <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${icons[page]}</svg>
    <span>${labels[page] || page}</span>
  </div>`;
}

async function navigateToPage(page) {
  showPage(`page-${page}`);
  if (page === 'home') { const m = await import('./modules/dashboard.js'); m.renderDashboard(); }
  else if (page === 'submit') { const m = await import('./modules/safety.js'); m.renderSafetySubmit(); }
  else if (page === 'review') { const m = await import('./modules/review.js'); m.renderReviewQueue(); }
  else if (page === 'rewards') { const m = await import('./modules/rewards.js'); m.renderRewards(); }
  else if (page === 'admin') { const m = await import('./modules/admin.js'); m.renderAdmin(); }
  else if (page === 'learning') { const m = await import('./modules/learning.js'); m.renderLearning(document.getElementById('learning-content')); }
}

async function loadNotificationsCount() {
  const res = await apiFetch('/api/notifications/count');
  if (res.ok && res.data?.unread_count > 0) {
    const pill = document.getElementById('notif-count');
    if (pill) { pill.style.display = 'inline'; pill.textContent = res.data.unread_count > 99 ? '99+' : res.data.unread_count; }
  }
}

export function initAuth() {
  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (authToken && currentUser) loadApp();
}
