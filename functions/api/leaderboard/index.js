import { json, err } from '../_utils.js';

// GET /api/leaderboard — Get leaderboard rankings
export const onRequestGet = async ({ request, env, data }) => {
  const url = new URL(request.url);
  const category = url.searchParams.get('category') || 'overall';
  const period = url.searchParams.get('period') || 'all_time';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const department = url.searchParams.get('department_id');

  const validCategories = ['safety', 'quality', 'kaizen', 'qc', 'behavioral', 'overall'];
  if (!validCategories.includes(category)) {
    return err(`Invalid category. Must be one of: ${validCategories.join(', ')}`, 400);
  }

  try {
    let query, params;

    if (department) {
      query = `
        SELECT lc.*, u.name, u.employee_id, d.name as department_name, s.name as shift_name
        FROM leaderboard_cache lc
        JOIN users u ON lc.user_id = u.id
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN shifts s ON u.shift_id = s.id
        WHERE lc.category = ? AND lc.period = ? AND u.department_id = ?`
        ORDER BY lc.points DESC
        LIMIT ?
      `;
      params = [category, period, parseInt(department), limit];
    } else {
      query = `
        SELECT lc.*, u.name, u.employee_id, d.name as department_name, s.name as shift_name
        FROM leaderboard_cache lc
        JOIN users u ON lc.user_id = u.id
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN shifts s ON u.shift_id = s.id
        WHERE lc.category = ? AND lc.period = ?
        ORDER BY lc.points DESC
        LIMIT ?
      `;
      params = [category, period, limit];
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();

    // Add rank numbers
    const ranked = results.map((r, idx) => ({ ...r, rank: idx + 1 }));

    // Get current user's position
    const myRank = await env.DB.prepare(`
      SELECT points, rank FROM leaderboard_cache
      WHERE user_id = ? AND category = ? AND period = ?
    `).bind(data.user.id, category, period).first();

    return json({
      leaderboard: ranked,
      my_position: myRank || { points: 0, rank: null },
      category,
      period,
      total_entries: results.length
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
