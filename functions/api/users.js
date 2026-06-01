import { json, err, hashPassword, uuid, getSession, auditLog } from './_utils.js';

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// GET /api/users — list all users (admin only)
export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);
  if (session.role !== 'admin') return err('Forbidden', 403);

  const { results } = await env.DB.prepare(
    `SELECT id, emp_id, full_name, email, role, unit, created_at FROM users ORDER BY created_at ASC`
  ).all();

  return json({ users: results });
}

// POST /api/users — create user (admin only)
export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);
  if (session.role !== 'admin') return err('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { full_name, email, emp_id, unit, role, password } = body;
  if (!full_name || !email || !emp_id || !unit || !role || !password) {
    return err('All fields are required');
  }
  if (password.length < 8) return err('Password must be at least 8 characters');
  if (!['admin', 'manager', 'operator'].includes(role)) return err('Invalid role');

  // Check duplicates
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE LOWER(email)=LOWER(?) OR LOWER(emp_id)=LOWER(?)'
  ).bind(email, emp_id).first();
  if (existing) return err('Email or Employee ID already exists');

  const id = uuid();
  const hashed = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO users(id, emp_id, full_name, email, password, role, unit, created_by)
     VALUES(?,?,?,?,?,?,?,?)`
  ).bind(id, emp_id, full_name, email.toLowerCase(), hashed, role, unit, session.uid).run();

  const ip = request.headers.get('CF-Connecting-IP') || '';
  await auditLog(env, session, 'CREATE_USER', 'user', id,
    { emp_id, full_name, email, role, unit }, ip);

  return json({ ok: true, id, message: `Account created for ${full_name}` });
}

// PUT /api/users — reset password (admin only)
export async function onRequestPut({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);
  if (session.role !== 'admin') return err('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { user_id, new_password } = body;
  if (!user_id || !new_password) return err('user_id and new_password required');
  if (new_password.length < 8) return err('Password must be at least 8 characters');

  const target = await env.DB.prepare(
    'SELECT id, full_name, emp_id FROM users WHERE id = ?'
  ).bind(user_id).first();
  if (!target) return err('User not found', 404);

  const hashed = await hashPassword(new_password);

  // Update password
  await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hashed, user_id).run();

  // Invalidate all existing sessions for that user
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user_id).run();

  // Log the reset
  await env.DB.prepare(
    `INSERT INTO password_resets(user_id, new_password, reset_by) VALUES(?,?,?)`
  ).bind(user_id, '(hashed)', session.uid).run();

  const ip = request.headers.get('CF-Connecting-IP') || '';
  await auditLog(env, session, 'RESET_PASSWORD', 'user', user_id,
    { target_name: target.full_name, target_emp: target.emp_id }, ip);

  return json({ ok: true, message: `Password reset for ${target.full_name}` });
}

// DELETE /api/users — delete user (admin only)
export async function onRequestDelete({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);
  if (session.role !== 'admin') return err('Forbidden', 403);

  const url = new URL(request.url);
  const user_id = url.searchParams.get('id');
  if (!user_id) return err('id required');
  if (user_id === session.uid) return err('Cannot delete your own account');

  const target = await env.DB.prepare(
    'SELECT id, full_name, emp_id FROM users WHERE id = ?'
  ).bind(user_id).first();
  if (!target) return err('User not found', 404);

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user_id).run();

  const ip = request.headers.get('CF-Connecting-IP') || '';
  await auditLog(env, session, 'DELETE_USER', 'user', user_id,
    { target_name: target.full_name, target_emp: target.emp_id }, ip);

  return json({ ok: true, message: `User ${target.full_name} deleted` });
}
