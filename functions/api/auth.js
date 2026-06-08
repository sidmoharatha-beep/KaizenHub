import { json, err, uuid, verifyPassword } from './_utils.js';

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const { email, password } = await request.json();
    
    if (!email || !password) return err('Email and password required', 400);

    const user = await env.DB.prepare(`
      SELECT u.id, u.emp_id, u.full_name, u.email, u.password, u.role_id, u.unit, u.department_id, r.name as role
      FROM users u 
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.email = ?
    `).bind(email).first();

    if (!user) return err('Invalid credentials', 401);
    
    const valid = await verifyPassword(password, user.password);
    if (!valid) return err('Invalid credentials', 401);

    const token = uuid();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await env.DB.prepare(`
      INSERT INTO sessions (token, user_id, expires_at, created_at)
      VALUES (?, ?, datetime(?), datetime('now'))
    `).bind(token, user.id, expires.toISOString()).run();

    delete user.password;

    return json({ 
      token, 
      user: {
        id: user.id,
        emp_id: user.emp_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role || 'operator',
        role_id: user.role_id,
        unit: user.unit,
        department_id: user.department_id
      }
    });

  } catch (e) {
    return json({ error: 'AUTH_CRASH', msg: e.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace('Bearer ', '').trim();
    
    if (!token) return err('Unauthorized', 401);

    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
    
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'LOGOUT_CRASH', msg: e.message }, 500);
  }
}
