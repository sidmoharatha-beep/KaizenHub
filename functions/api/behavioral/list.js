import { json, err } from '../_utils.js';

// GET /api/behavioral/list — List behavioral evaluations with filters
export async function onRequestGet({ request, env, data }) {
  const user = data.user;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;
  const month = url.searchParams.get('month');
  const year = url.searchParams.get('year');
  const status = url.searchParams.get('status');
  const department = url.searchParams.get('department_id');

  let whereClause = '1=1';
  const params = [];

  // Access control
  if (user.role === 'Operator') {
    // Operators see only their own evaluations
    whereClause += ' AND be.user_id = ?';
    params.push(user.id);
  } else if (user.role === 'SIC') {
    // SICs see evaluations they've done
    whereClause += ' AND be.evaluator_id = ?';
    params.push(user.id);
  } else if (user.role === 'Manager') {
    // Managers see their department
    whereClause += ' AND u.department_id = ?';
    params.push(user.department_id);
  }
  // HR and Admin see all

  if (month) { whereClause += ' AND be.month = ?'; params.push(parseInt(month)); }
  if (year) { whereClause += ' AND be.year = ?'; params.push(parseInt(year)); }
  if (status) { whereClause += ' AND be.status = ?'; params.push(status); }
  if (department) { whereClause += ' AND u.department_id = ?'; params.push(parseInt(department)); }

  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM behavioral_evaluations be JOIN users u ON be.user_id = u.id WHERE ${whereClause}`
    ).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT be.*, u.name as employee_name, u.employee_id as employee_emp_id,
             ev.name as evaluator_name, d.name as department_name
      FROM behavioral_evaluations be
      JOIN users u ON be.user_id = u.id
      JOIN users ev ON be.evaluator_id = ev.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE ${whereClause}
      ORDER BY be.year DESC, be.month DESC, be.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, perPage, offset).all();

    return json({
      evaluations: results,
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
