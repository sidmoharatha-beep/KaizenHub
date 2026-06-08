import { json } from './_utils.js';

export const onRequestGet = async ({ env, data }) => {
  const user = data.user;

  try {
    const queries = [];

    // Safety counts
    queries.push(env.DB.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) as approved,
             SUM(CASE WHEN status='Submitted' THEN 1 ELSE 0 END) as pending
      FROM safety_reports WHERE user_id = ?
    `).bind(user.id));

    // Quality counts
    queries.push(env.DB.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) as approved,
             SUM(CASE WHEN status='Submitted' THEN 1 ELSE 0 END) as pending
      FROM quality_reports WHERE user_id = ?
    `).bind(user.id));

    // Kaizen counts
    queries.push(env.DB.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status='Closed' THEN 1 ELSE 0 END) as closed,
             SUM(CASE WHEN status IN ('Submitted','Screened','Approved','Implemented') THEN 1 ELSE 0 END) as in_progress
      FROM kaizen_ideas WHERE user_id = ?
    `).bind(user.id));

    // QC counts
    queries.push(env.DB.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status='Closed' THEN 1 ELSE 0 END) as closed
      FROM quality_circle_projects WHERE owner_id = ?
    `).bind(user.id));

    // Total points
    queries.push(env.DB.prepare(`
      SELECT SUM(points) as total_points FROM reward_transactions WHERE user_id = ?
    `).bind(user.id));

    // Rank
    queries.push(env.DB.prepare(`
      SELECT points, rank FROM leaderboard_cache WHERE user_id = ? AND category = 'overall' AND period = 'all_time'
    `).bind(user.id));

    // Recent notifications
    queries.push(env.DB.prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
    `).bind(user.id));

    const [safety, quality, kaizen, qc, points, rank, notifications] = await env.DB.batch(queries);

    return json({
      user: {
        id: user.id,
        name: user.name,
        employee_id: user.employee_id,
        role: user.role,
        department_id: user.department_id
      },
      overview: {
        safety: safety.results?.[0] || { total: 0, approved: 0, pending: 0 },
        quality: quality.results?.[0] || { total: 0, approved: 0, pending: 0 },
        kaizen: kaizen.results?.[0] || { total: 0, closed: 0, in_progress: 0 },
        qc: qc.results?.[0] || { total: 0, closed: 0 }
      },
      total_points: points.results?.[0]?.total_points || 0,
      overall_rank: rank.results?.[0] || null,
      recent_notifications: notifications.results || []
    });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
