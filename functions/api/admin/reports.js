import { json, err, paginate } from '../_utils.js';

// GET /api/admin/reports — Filtered data export
export async function onRequestGet({ request, env, data }) {
  if (data.user.role !== 'Admin') return err('Admin only', 403);

  const url = new URL(request.url);
  const { page, perPage, offset } = paginate(url);
  const module = url.searchParams.get('module'); // safety, quality, kaizen, qc, behavioral
  const department = url.searchParams.get('department_id');
  const shift = url.searchParams.get('shift_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const status = url.searchParams.get('status');
  const employee = url.searchParams.get('employee_id');

  if (!module) return err('module query param required (safety/quality/kaizen/qc/behavioral)', 400);

  try {
    let query, countQuery, params = [];
    let filters = '1=1';

    if (from) { filters += ` AND t.created_at >= '${from}'`; }
    if (to) { filters += ` AND t.created_at <= '${to}'`; }
    if (status) { filters += ' AND t.status = ?'; params.push(status); }

    switch (module) {
      case 'safety':
        if (department) { filters += ' AND t.department_id = ?'; params.push(parseInt(department)); }
        if (employee) { filters += ' AND u.employee_id = ?'; params.push(employee); }
        query = `SELECT t.*, u.name, u.employee_id, d.name as dept FROM safety_reports t JOIN users u ON t.user_id=u.id LEFT JOIN departments d ON t.department_id=d.id WHERE ${filters} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
        countQuery = `SELECT COUNT(*) as total FROM safety_reports t JOIN users u ON t.user_id=u.id WHERE ${filters}`;
        break;
      case 'quality':
        if (department) { filters += ' AND t.department_id = ?'; params.push(parseInt(department)); }
        if (employee) { filters += ' AND u.employee_id = ?'; params.push(employee); }
        query = `SELECT t.*, u.name, u.employee_id, d.name as dept FROM quality_reports t JOIN users u ON t.user_id=u.id LEFT JOIN departments d ON t.department_id=d.id WHERE ${filters} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
        countQuery = `SELECT COUNT(*) as total FROM quality_reports t JOIN users u ON t.user_id=u.id WHERE ${filters}`;
        break;
      case 'kaizen':
        if (department) { filters += ' AND t.department_id = ?'; params.push(parseInt(department)); }
        if (employee) { filters += ' AND u.employee_id = ?'; params.push(employee); }
        query = `SELECT t.*, u.name, u.employee_id, d.name as dept FROM kaizen_ideas t JOIN users u ON t.user_id=u.id LEFT JOIN departments d ON t.department_id=d.id WHERE ${filters} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
        countQuery = `SELECT COUNT(*) as total FROM kaizen_ideas t JOIN users u ON t.user_id=u.id WHERE ${filters}`;
        break;
      case 'qc':
        if (department) { filters += ' AND t.department_id = ?'; params.push(parseInt(department)); }
        query = `SELECT t.*, u.name as owner, d.name as dept, (SELECT COUNT(*) FROM quality_circle_members WHERE project_id=t.id) as members FROM quality_circle_projects t JOIN users u ON t.owner_id=u.id LEFT JOIN departments d ON t.department_id=d.id WHERE ${filters} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
        countQuery = `SELECT COUNT(*) as total FROM quality_circle_projects t WHERE ${filters}`;
        break;
      case 'behavioral':
        if (department) { filters += ' AND u.department_id = ?'; params.push(parseInt(department)); }
        if (employee) { filters += ' AND u.employee_id = ?'; params.push(employee); }
        query = `SELECT t.*, u.name as employee_name, u.employee_id, ev.name as evaluator, d.name as dept FROM behavioral_evaluations t JOIN users u ON t.user_id=u.id JOIN users ev ON t.evaluator_id=ev.id LEFT JOIN departments d ON u.department_id=d.id WHERE ${filters} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
        countQuery = `SELECT COUNT(*) as total FROM behavioral_evaluations t JOIN users u ON t.user_id=u.id WHERE ${filters}`;
        break;
      default:
        return err('Invalid module', 400);
    }

    const countResult = await env.DB.prepare(countQuery).bind(...params).first();
    const { results } = await env.DB.prepare(query).bind(...params, perPage, offset).all();

    return json({
      module,
      data: results,
      pagination: {
        page, per_page: perPage,
        total: countResult?.total || 0,
        total_pages: Math.ceil((countResult?.total || 0) / perPage)
      }
    });

  } catch (e) {
    return err('Report error: ' + e.message, 500);
  }
}
