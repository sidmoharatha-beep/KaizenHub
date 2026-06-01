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

// GET /api/dashboard — aggregated stats + leaderboard
export async function onRequestGet({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);

  // KPI counts
  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status='Pending'  THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status='Approved' THEN saving ELSE 0 END) as total_saving
    FROM submissions
  `).first();

  // Leaderboard (top 10 by points)
  const { results: leaderboard } = await env.DB.prepare(`
    SELECT emp_id, full_name, SUM(points) as total_points, COUNT(*) as idea_count
    FROM submissions
    WHERE status = 'Approved'
    GROUP BY emp_id, full_name
    ORDER BY total_points DESC
    LIMIT 10
  `).all();

  // My rewards (for operator view)
  let my_rewards = null;
  if (session.role === 'operator') {
    const { results: myData } = await env.DB.prepare(`
      SELECT id, title, type, points, created_at
      FROM submissions
      WHERE user_id = ? AND status = 'Approved'
      ORDER BY created_at DESC
    `).bind(session.uid).all();
    const total_points = myData.reduce((a, b) => a + (b.points || 0), 0);
    my_rewards = { total_points, items: myData };
  }

  // Recent activity (for admin/manager)
  let recent_activity = null;
  if (['admin', 'manager'].includes(session.role)) {
    const { results: activity } = await env.DB.prepare(`
      SELECT actor_name, action, target_type, detail, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
    recent_activity = activity;
  }

  return json({
    stats,
    leaderboard: leaderboard || [],
    my_rewards,
    recent_activity,
  });
}
