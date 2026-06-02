import { json, err, hashPassword, verifyPassword, uuid, auditLog } from './_utils.js';

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { email, password } = body;
  if (!email ||!password) return err('Email and password required');

  const user = await env.DB.prepare(`
    SELECT u.*, r.name as role 
    FROM users u 
    LEFT JOIN roles r ON u.role_id = r.id 
    WHERE LOWER(u.email) = LOWER(?) AND u.is_active = 1
  `).bind(email.trim()).first();

  if (!user) return err('Invalid credentials', 401);

  const ok = await verifyPassword(password, user.password);
  if (!ok) return err('Invalid credentials', 401);

  const token = uuid() + '-' + uuid();
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
  await env.DB.prepare(
    'INSERT INTO sessions(token, user_id, expires_at) VALUES(?,?,?)'
  ).bind(token, user.id, expires).run();

  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  const ip = request.headers.get('CF-Connecting-IP') || '';
  await auditLog(env, { uid: user.id, full_name: user.full_name || user.name }, 'LOGIN', 'session', token, null, ip);

  return json({
    token,
    user: {
      id: user.id,
      emp_id: user.emp_id || user.employee_id,
      full_name: user.full_name || user.name,
      email: user.email,
      role: user.role,
      unit: user.unit,
      department_id: user.department_id
    }
  });
}

export async function onRequestDelete({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE token =?').bind(token).run();
  }
  return json({ ok: true });
}
