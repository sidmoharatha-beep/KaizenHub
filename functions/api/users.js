import { json, err, hashPassword, getSession, auditLog } from './_utils.js';

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function checkAdmin(session) {
  if (!session) return err('Unauthorized', 401);
  if (!session.role || session.role.toLowerCase() !== 'admin') return err('Forbidden', 403);
  return null;
}

// Helper: resolve role_id from role name
async function resolveRoleId(env, roleName) {
  const r = await env.DB.prepare('SELECT id FROM roles WHERE LOWER(name) = LOWER(?)').bind(roleName).first();
  return r?.id;
}

// Helper: resolve role name from role_id
function roleNameById(id) {
  const map = { 1: 'Operator', 2: 'SIC', 3: 'Manager', 4: 'HR', 5: 'QC Panel Member', 6: 'Admin' };
  return map[id] || 'Unknown';
}

// GET /api/users — list all users with role/dept/shift names (admin only)
export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  const authErr = checkAdmin(session);
  if (authErr) return authErr;

  const { results } = await env.DB.prepare(`
    SELECT u.id, u.employee_id, u.full_name, u.email, u.is_active, u.created_at,
           u.role_id, r.name as role,
           u.department_id, d.name as department,
           u.shift_id, s.name as shift,
           m.employee_id as manager_emp_id, m.full_name as manager_name,
           sic.employee_id as sic_emp_id, sic.full_name as sic_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.department_id = d.id
    LEFT JOIN shifts s ON u.shift_id = s.id
    LEFT JOIN users m ON u.manager_id = m.id
    LEFT JOIN users sic ON u.sic_id = sic.id
    ORDER BY u.created_at ASC
  `).all();

  return json({ users: results });
}

// POST /api/users — create user (admin only)
export async function onRequestPost({ request, env }) {
  try {
    const session = await getSession(request, env);
    if (!session) {
      console.error('CREATE_USER: No session found');
      return json({ error: 'Unauthorized', reason: 'no_session' }, 401);
    }
    if (!session.role || session.role.toLowerCase() !== 'admin') {
      console.error('CREATE_USER: Not admin, role:', session.role);
      return json({ error: 'Forbidden', reason: 'not_admin', user_role: session.role }, 403);
    }

    let body;
    try { body = await request.json(); } catch { return err('Invalid JSON'); }

    const {
      employee_id, full_name, short_name, email, password,
      role_name, department_id, shift_id, manager_id, sic_id, designation, section
    } = body;

    if (!employee_id || !full_name || !email || !password || !role_name) {
      return json({ error: 'Missing required fields', received: { employee_id: !!employee_id, full_name: !!full_name, email: !!email, password: !!password, role_name: !!role_name } }, 400);
    }
    if (password.length < 6) return err('Password must be at least 6 characters');

    console.log('CREATE_USER payload:', JSON.stringify({ employee_id, full_name, email, role_name, department_id, shift_id, manager_id }));

    const roleId = await resolveRoleId(env, role_name);
    console.log('ROLE_RESOLVED:', roleId);
    if (!roleId) {
      const allRoles = await env.DB.prepare('SELECT id, name FROM roles').all();
      return json({ error: `Invalid role: '${role_name}'`, available_roles: allRoles.results.map(r=>r.name) }, 400);
    }

    const emailLower = email.toLowerCase();
    const existing = await env.DB.prepare(`
      SELECT id, is_active FROM users WHERE LOWER(email)=? OR employee_id=?
    `).bind(emailLower, employee_id).first();
    console.log('DUPLICATE_CHECK_DONE:', existing ? 'found' : 'none');
    if (existing && existing.is_active == 1) return json({ error: 'Email or Employee ID already exists (active user)' }, 409);

    // If inactive user exists with same email/employee_id, reactivate and update
    if (existing && existing.is_active == 0) {
      const roleCheck = await env.DB.prepare('SELECT id, name FROM roles WHERE LOWER(name) = LOWER(?)').bind(role_name).first();
      if (!roleCheck) return json({ error: `Role '${role_name}' not found` }, 400);
      const hashed2 = await hashPassword(password);
      const shortName = short_name || full_name;
      await env.DB.prepare(`
        UPDATE users SET is_active = 1, full_name = ?, name = ?, role_id = ?, department_id = ?, manager_id = ?, password = ?, designation = ?, section = ?
        WHERE id = ?
      `).bind(full_name, shortName, roleCheck.id, department_id != null ? parseInt(department_id) : null, manager_id != null ? parseInt(manager_id) : null, hashed2, designation || null, section || null, existing.id).run();
      try { await auditLog(env, { id: session.uid, name: session.full_name || session.name, role: session.role }, 'REACTIVATE_USER', 'user', employee_id, { full_name, email, role: role_name }, request.headers.get('CF-Connecting-IP') || ''); } catch(e) {}
      return json({ ok: true, message: `Reactivated account for ${full_name}` });
    }

    console.log('ABOUT_TO_HASH_PASSWORD');
    const hashed = await hashPassword(password);
    console.log('HASH_DONE:', hashed ? 'ok' : 'null', 'type:', typeof hashed, 'isPromise:', hashed && typeof hashed.then === 'function');

    if (!hashed || !hashed.startsWith('pbkdf2:')) {
      console.error('INVALID_HASH:', hashed);
      return json({ error: 'Invalid hash produced', hash_type: typeof hashed, hash_value: hashed ? String(hashed).slice(0,30) : null }, 500);
    }

    const roleCheck = await env.DB.prepare('SELECT id, name FROM roles WHERE id = ?').bind(roleId).first();
    console.log('ROLE_CHECK:', roleCheck);
    if (!roleCheck) return json({ error: 'Role ID not found in roles table', roleId }, 400);

    const userCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM users').first();
    console.log('USER_COUNT_BEFORE:', userCount?.cnt);

    const insertSql = `INSERT INTO users (employee_id, full_name, name, email, password, role_id, department_id, shift_id, manager_id, sic_id, designation, section, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`;
    const bindVals = [
      employee_id, full_name, short_name || full_name, emailLower, hashed, roleId,
      department_id != null ? department_id : null,
      shift_id != null ? shift_id : null,
      manager_id != null ? manager_id : null,
      sic_id != null ? sic_id : null,
      designation != null ? designation : null,
      section != null ? section : null
    ];
    console.log('BIND_DEBUG', JSON.stringify({
      employee_id, full_name, email, name: short_name || full_name,
      role_id: roleId, department_id: department_id || null, manager_id: manager_id || null,
      designation: designation || null, section: section || null,
      hashed_type: typeof hashed,
      hashed_is_promise: hashed && typeof hashed.then === 'function',
      hashed_value: hashed ? String(hashed).slice(0,20) : null
    }));
    console.log('BIND_COUNT:', bindVals.length, 'expected 13');
    const { meta } = await env.DB.prepare(insertSql).bind(...bindVals).run();
    console.log('INSERT_SUCCESS', meta.last_row_id);

    const ip = request.headers.get('CF-Connecting-IP') || '';
    try { await auditLog(env, { id: session.uid, name: session.full_name || session.name, role: session.role }, 'CREATE_USER', 'user', employee_id,
      { employee_id, full_name, email, role: role_name }, ip); } catch(e) { console.error('AUDIT_LOG_FAIL:', e.message); }

    return json({ ok: true, message: `Account created for ${full_name}` });
  } catch (e) {
    console.error('USER_CREATE_UNHANDLED:', e.message, e.stack);
    return new Response(JSON.stringify({
      error: String(e && e.message || e),
      stack: e && e.stack ? e.stack.split('\n').slice(0,5).join(' | ') : null,
      name: e && e.name
    }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}

// PUT /api/users — update user or reset password (admin only)
export async function onRequestPut({ request, env }) {
  const session = await getSession(request, env);
  const authErr = checkAdmin(session);
  if (authErr) return authErr;

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { user_id, new_password, updates } = body;
  if (!user_id) return err('user_id required');

  const target = await env.DB.prepare(`
    SELECT id, employee_id, full_name FROM users WHERE id = ?
  `).bind(user_id).first();
  if (!target) return err('User not found', 404);

  // Password reset
  if (new_password) {
    if (new_password.length < 6) return err('Password must be at least 6 characters');
    const hashed = await hashPassword(new_password);
    await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hashed, user_id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user_id).run();
  }

  // General field updates
  if (updates) {
    const fields = [];
    const vals = [];
    if (updates.role_name !== undefined) {
      const rid = await resolveRoleId(env, updates.role_name);
      if (!rid) return err('Invalid role');
      fields.push('role_id = ?');
      vals.push(rid);
    }
    const flds = [
      ['full_name', 'full_name'], ['name', 'name'], ['email', 'email'],
      ['department_id', 'department_id'], ['shift_id', 'shift_id'],
      ['manager_id', 'manager_id'], ['sic_id', 'sic_id']
    ];
    for (const [k, col] of flds) {
      if (updates[k] !== undefined) { fields.push(`${col} = ?`); vals.push(updates[k]); }
    }
    if (fields.length > 0) {
      vals.push(user_id);
      await env.DB.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
    }
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  try { await auditLog(env, session, 'UPDATE_USER', 'user', user_id,
    { target_name: target.full_name, target_emp: target.employee_id }, ip); } catch(e) { console.error('AUDIT_LOG_FAIL:', e.message); }

  return json({ ok: true, message: `User updated: ${target.full_name}` });
}

// DELETE /api/users — soft-delete deactivate (admin only)
export async function onRequestDelete({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!session.role || session.role.toLowerCase() !== 'admin') return json({ error: 'Forbidden' }, 403);

  const url = new URL(request.url);
  const userId = url.searchParams.get('id');
  if (!userId) return json({ error: 'id required' }, 400);

  const target = await env.DB.prepare('SELECT id, full_name, employee_id, is_active FROM users WHERE id = ?').bind(userId).first();
  if (!target) return json({ error: 'User not found' }, 404);
  if (String(target.id) === String(session.uid)) return json({ error: 'Cannot delete your own account' }, 400);

  // Soft-delete: set is_active = 0
  await env.DB.prepare('UPDATE users SET is_active = 0 WHERE id = ?').bind(userId).run();
  // Remove all sessions for this user
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();

  const ip = request.headers.get('CF-Connecting-IP') || '';
  try { await auditLog(env, session, 'DELETE_USER', 'user', userId,
    { target_name: target.full_name, target_emp: target.employee_id, soft_delete: true }, ip); } catch(e) { console.error('AUDIT_LOG_FAIL:', e.message); }

  return json({ ok: true, message: `User ${target.full_name} deactivated` });
}
