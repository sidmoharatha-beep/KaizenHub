import { json, err } from './_utils.js';

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return err('Unauthorized', 401);

  const sess = await env.DB.prepare(
    'SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime("now")'
  ).bind(token).first();
  
  if (!sess) return err('Session expired', 401);

  const user = await env.DB.prepare(`
    SELECT id, emp_id, full_name, email, role_id, unit, department_id 
    FROM users WHERE id = ?
  `).bind(sess.user_id).first();

  if (!user) return err('User not found', 404);

  return json(user);
}
