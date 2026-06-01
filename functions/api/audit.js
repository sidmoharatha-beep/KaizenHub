import { json, err, getSession } from './_utils.js';

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// GET /api/audit — full audit log (admin only)
export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);
  if (session.role !== 'admin') return err('Forbidden', 403);

  const url = new URL(request.url);
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '50'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const { results } = await env.DB.prepare(`
    SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(limit, offset).all();

  const countRow = await env.DB.prepare('SELECT COUNT(*) as total FROM audit_log').first();

  return json({ logs: results || [], total: countRow?.total || 0 });
}
