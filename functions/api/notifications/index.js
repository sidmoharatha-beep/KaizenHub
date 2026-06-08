import { json, err } from '../_utils.js';
import { markRead, getUnreadCount } from '../../lib/notifications.js';

// GET /api/notifications — List notifications for current user
export const onRequestGet = async ({ request, env, data }) => {
  const user = data.user;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 50);
  const offset = (page - 1) * perPage;
  const unreadOnly = url.searchParams.get('unread') === 'true';

  let whereClause = 'user_id = ?';
  const params = [user.id];

  if (unreadOnly) {
    whereClause += ' AND is_read = 0';
  }

  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM notifications WHERE ${whereClause}`
    ).bind(...params).first();

    const unreadCount = await getUnreadCount(env, user.id);

    const { results } = await env.DB.prepare(`
      SELECT * FROM notifications WHERE ${whereClause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, perPage, offset).all();

    return json({
      notifications: results,
      unread_count: unreadCount,
      pagination: {
        page, per_page: perPage,
        total: countResult?.total || 0,
        total_pages: Math.ceil((countResult?.total || 0) / perPage)
      }
    });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// PATCH /api/notifications — Mark as read
export async function onRequestPatch({ request, env, data }) {
  const user = data.user;

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { id } = body; // 'all' or specific ID

  if (!id) return err('Notification ID or "all" required', 400);

  try {
    await markRead(env, user.id, id === 'all' ? 'all' : parseInt(id));
    const unreadCount = await getUnreadCount(env, user.id);

    return json({ success: true, unread_count: unreadCount });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
