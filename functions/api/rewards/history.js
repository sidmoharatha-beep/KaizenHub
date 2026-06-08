import { json, err, paginate } from '../_utils.js';

// GET /api/rewards/history — Paginated transaction history
export const onRequestGet = async ({ request, env, data }) => {
  const user = data.user;
  const url = new URL(request.url);
  const { page, perPage, offset } = paginate(url);
  const sourceType = url.searchParams.get('source_type');
  const fromDate = url.searchParams.get('from');
  const toDate = url.searchParams.get('to');

  const targetUserId = ['Admin', 'HR'].includes(user.role)
    ? parseInt(url.searchParams.get('user_id')) || user.id
    : user.id;

  let whereClause = 'user_id = ?';
  const params = [targetUserId];

  if (sourceType) {
    whereClause += ' AND source_type = ?';
    params.push(sourceType);
  }
  if (fromDate) {
    whereClause += ' AND created_at >= ?';
    params.push(fromDate);
  }
  if (toDate) {
    whereClause += ' AND created_at <= ?';
    params.push(toDate);
  }

  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM reward_transactions WHERE ${whereClause}`
    ).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT * FROM reward_transactions
      WHERE ${whereClause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, perPage, offset).all();

    const totalPoints = await env.DB.prepare(
      `SELECT SUM(points) as total FROM reward_transactions WHERE ${whereClause}`
    ).bind(...params).first();

    return json({
      transactions: results,
      total_points_filtered: totalPoints?.total || 0,
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
