import { json, err, getSession } from './_utils.js';

export const onRequestGet = async ({ request, env }) => {
  const session = await getSession(request, env);
  if (!session || session.role !== 'Admin') return err('Admin access required', 403);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || 50), 100);
  const offset = parseInt(url.searchParams.get('offset') || 0);

  const { results } = await env.DB.prepare(
    `SELECT id, user_id, user_name, action, entity_type, entity_id, details, ip_address, created_at
     FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  const count = await env.DB.prepare('SELECT COUNT(*) as total FROM audit_log').first();
  return json({ logs: results, total: count?.total || 0, limit, offset });
};
