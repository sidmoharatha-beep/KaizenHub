import { json, err } from './_utils.js';

export async function onRequestGet({ request, env, data }) {
  const user = data.user;

  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);

    const queries = [];

    // 1. Module KPI counts
    queries.push(env.DB.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status='Submitted' THEN 1 ELSE 0 END) as pending,
        SUM(reward_points) as points
      FROM safety_reports${user.role === 'Manager' ? ' WHERE department_id = ?' : ''}
    `).bind(...(user.role === 'Manager' ? [user.department_id] : [])));

    queries.push(env.DB.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status='Submitted' THEN 1 ELSE 0 END) as pending,
        SUM(reward_points) as points
      FROM quality_reports${user.role === 'Manager' ? ' WHERE department_id = ?' : ''}
    `).bind(...(user.role === 'Manager' ? [user.department_id] : [])));

    // For Operator: personal kaizen stats + points earned
    // For Manager/Admin: department/global counts
    const kaizenWhere = user.role === 'Manager' ? 'WHERE department_id = ?' :
                        !['Admin'].includes(user.role) ? 'WHERE user_id = ?' : '';
    const kaizenParams = user.role === 'Manager' ? [user.department_id] :
                         !['Admin'].includes(user.role) ? [user.id] : [];
    queries.push(env.DB.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status='Closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status NOT IN ('Closed','Rejected') THEN 1 ELSE 0 END) as in_progress
      FROM kaizen_ideas ${kaizenWhere}
    `).bind(...kaizenParams));

    queries.push(env.DB.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status='Closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) as rejected
      FROM quality_circle_projects${user.role === 'Manager' ? ' WHERE department_id = ?' : ''}
    `).bind(...(user.role === 'Manager' ? [user.department_id] : [])));

    queries.push(env.DB.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status='Reward Released' THEN 1 ELSE 0 END) as released,
        SUM(CASE WHEN status='HR Approval' THEN 1 ELSE 0 END) as pending
      FROM behavioral_evaluations${user.role === 'Manager' ? ' WHERE evaluator_id = ? OR EXISTS(SELECT 1 FROM users u WHERE u.id = behavioral_evaluations.user_id AND u.department_id = ?)' : ''}
    `).bind(...(user.role === 'Manager' ? [user.id, user.department_id] : [])));

    // Add kaizen points from reward_transactions (personal for Operator, global for others)
    const kaizenPtsWhere = !['Admin','Manager'].includes(user.role) ? 'AND user_id = ?' : '';
    const kaizenPtsParams = !['Admin','Manager'].includes(user.role) ? [user.id] : [];
    queries.push(env.DB.prepare(`
      SELECT COALESCE(SUM(points), 0) as points
      FROM reward_transactions
      WHERE source_type IN ('kaizen_approval','kaizen_implementation') ${kaizenPtsWhere}
    `).bind(...kaizenPtsParams));

    const [
      safetyRes, qualityRes, kaizenRes, qcRes, behavioralRes, kaizenPtsRes
    ] = await env.DB.batch(queries);

    // 2. Overall leaderboard
    const { results: leaderboard } = await env.DB.prepare(`
      SELECT lc.points, lc.rank, u.name, u.employee_id, d.name as department_name
      FROM leaderboard_cache lc
      JOIN users u ON lc.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE lc.category = 'overall' AND lc.period = 'all_time'
      ORDER BY lc.points DESC LIMIT ?
    `).bind(limit).all();

    // 3. Pending reviews for Manager/Admin
    let pendingReviews = null;
    if (['Manager', 'Admin'].includes(user.role)) {
      const { results: safetyPending } = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM safety_reports WHERE status = 'Submitted'
        ${user.role === 'Manager' ? 'AND department_id = ?' : ''}
      `).bind(...(user.role === 'Manager' ? [user.department_id] : [])).all();

      const { results: qualityPending } = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM quality_reports WHERE status = 'Submitted'
        ${user.role === 'Manager' ? 'AND department_id = ?' : ''}
      `).bind(...(user.role === 'Manager' ? [user.department_id] : [])).all();

      const { results: kaizenPending } = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM kaizen_ideas WHERE status = 'Submitted'
        AND approver_id = ?
      `).bind(user.id).all();

      const { results: behavioralPending } = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM behavioral_evaluations WHERE status = 'HR Approval'
      `).all();

      pendingReviews = {
        safety: safetyPending?.[0]?.count || 0,
        quality: qualityPending?.[0]?.count || 0,
        kaizen: kaizenPending?.[0]?.count || 0,
        behavioral: behavioralPending?.[0]?.count || 0,
        total: (safetyPending?.[0]?.count || 0) + (qualityPending?.[0]?.count || 0) +
               (kaizenPending?.[0]?.count || 0) + (behavioralPending?.[0]?.count || 0)
      };
    }

    // 4. Recent activity
    const { results: recentActivity } = await env.DB.prepare(`
      SELECT at.*, u.name as actor_name
      FROM audit_trail at
      JOIN users u ON at.user_id = u.id
      ${user.role === 'Manager' ? 'WHERE at.user_id = ?' : ''}
      ORDER BY at.created_at DESC LIMIT 10
    `).bind(...(user.role === 'Manager' ? [user.id] : [])).all();

    return json({
      kpi: {
        safety: safetyRes.results?.[0] || { total: 0, approved: 0, pending: 0, points: 0 },
        quality: qualityRes.results?.[0] || { total: 0, approved: 0, pending: 0, points: 0 },
        kaizen: { ...(kaizenRes.results?.[0] || { total: 0, closed: 0, rejected: 0, in_progress: 0 }),
                  points: kaizenPtsRes.results?.[0]?.points || 0 },
        qc: qcRes.results?.[0] || { total: 0, closed: 0, rejected: 0 },
        behavioral: behavioralRes.results?.[0] || { total: 0, released: 0, pending: 0 }
      },
      leaderboard: leaderboard || [],
      pending_reviews: pendingReviews,
      recent_activity: recentActivity || [],
      role: user.role,
      department_id: user.department_id
    });

  } catch (e) {
    return err('Dashboard error: ' + e.message, 500);
  }
}
