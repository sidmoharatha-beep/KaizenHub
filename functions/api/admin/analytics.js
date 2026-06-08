import { json, err } from '../_utils.js';

// GET /api/admin/analytics — Dashboard statistics
export async function onRequestGet({ request, env, data }) {
  if (data.user.role !== 'Admin') return err('Admin only', 403);

  const url = new URL(request.url);
  const department = url.searchParams.get('department_id');
  const shift = url.searchParams.get('shift_id');
  const month = url.searchParams.get('month'); // YYYY-MM
  const year = url.searchParams.get('year');

  try {
    // Date filter helper
    let dateFilter = '';
    if (month) dateFilter = `AND strftime('%Y-%m', created_at) = '${month}'`;
    else if (year) dateFilter = `AND strftime('%Y', created_at) = '${year}'`;

    // Safety stats
    const safety = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status='Submitted' THEN 1 ELSE 0 END) as pending,
        SUM(reward_points) as total_points
      FROM safety_reports WHERE 1=1 ${dateFilter}
    `).first();

    // Quality stats
    const quality = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status='Submitted' THEN 1 ELSE 0 END) as pending,
        SUM(reward_points) as total_points
      FROM quality_reports WHERE 1=1 ${dateFilter}
    `).first();

    // Kaizen stats
    const kaizen = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='Closed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status IN ('Submitted','Screened','Approved','Implemented') THEN 1 ELSE 0 END) as in_progress
      FROM kaizen_ideas WHERE 1=1 ${dateFilter}
    `).first();

    // QC stats
    const qc = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='Closed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN category='Gold' THEN 1 ELSE 0 END) as gold,
        SUM(CASE WHEN category='Silver' THEN 1 ELSE 0 END) as silver,
        SUM(CASE WHEN category='Bronze' THEN 1 ELSE 0 END) as bronze
      FROM quality_circle_projects WHERE 1=1 ${dateFilter}
    `).first();

    // Behavioral stats
    const behavioral = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='Reward Released' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status='HR Approval' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN recognition='Great Job' THEN 1 ELSE 0 END) as great_jobs,
        SUM(CASE WHEN recognition='Well Done' THEN 1 ELSE 0 END) as well_dones
      FROM behavioral_evaluations WHERE 1=1 ${month ? `AND month = ${parseInt(month.split('-')[1])} AND year = ${parseInt(month.split('-')[0])}` : ''}
    `).first();

    // Total rewards distributed
    const rewards = await env.DB.prepare(`
      SELECT SUM(points) as total_distributed, COUNT(*) as total_transactions
      FROM reward_transactions WHERE 1=1 ${dateFilter}
    `).first();

    // By department
    const { results: byDepartment } = await env.DB.prepare(`
      SELECT d.name as department, COUNT(rt.id) as transactions, SUM(rt.points) as points
      FROM reward_transactions rt
      JOIN users u ON rt.user_id = u.id
      JOIN departments d ON u.department_id = d.id
      WHERE 1=1 ${dateFilter}
      GROUP BY d.id ORDER BY points DESC
    `).all();

    // By shift
    const { results: byShift } = await env.DB.prepare(`
      SELECT s.name as shift_name, COUNT(rt.id) as transactions, SUM(rt.points) as points
      FROM reward_transactions rt
      JOIN users u ON rt.user_id = u.id
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE 1=1 ${dateFilter}
      GROUP BY s.id ORDER BY points DESC
    `).all();

    // Top 10 performers
    const { results: topPerformers } = await env.DB.prepare(`
      SELECT u.name, u.employee_id, d.name as department, SUM(rt.points) as total_points
      FROM reward_transactions rt
      JOIN users u ON rt.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1 ${dateFilter}
      GROUP BY rt.user_id ORDER BY total_points DESC LIMIT 10
    `).all();

    // Monthly trend (last 12 months)
    const { results: monthlyTrend } = await env.DB.prepare(`
      SELECT strftime('%Y-%m', created_at) as month,
        source_type, SUM(points) as points, COUNT(*) as count
      FROM reward_transactions
      WHERE created_at > datetime('now', '-12 months')
      GROUP BY strftime('%Y-%m', created_at), source_type
      ORDER BY month ASC
    `).all();

    // Active users count
    const activeUsers = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM users WHERE is_active = 1`
    ).first();

    return json({
      summary: {
        active_users: activeUsers?.count || 0,
        total_rewards_distributed: rewards?.total_distributed || 0,
        total_transactions: rewards?.total_transactions || 0
      },
      by_module: { safety, quality, kaizen, qc, behavioral },
      by_department: byDepartment,
      by_shift: byShift,
      top_performers: topPerformers,
      monthly_trend: monthlyTrend
    });

  } catch (e) {
    return err('Analytics error: ' + e.message, 500);
  }
}
