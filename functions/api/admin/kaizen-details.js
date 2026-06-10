import { json, err } from '../_utils.js';

// GET /api/admin/kaizen-details — Admin only: full details of all kaizen submissions
export async function onRequestGet({ request, env, data }) {
  if (data.user.role !== 'Admin') return err('Admin only', 403);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = 20;
  const offset = (page - 1) * perPage;

  // Single kaizen full details
  if (id) {
    const kaizen = await env.DB.prepare(`
      SELECT k.*,
        u.full_name as submitter_name, u.employee_id as submitter_emp_id,
        d.name as department_name,
        a.full_name as approver_name,
        e.full_name as evaluator_name,
        ci.full_name as co_implementor_name,
        ki.evidence_url, ki.implemented_at, ki.status as impl_status,
        ke.ease_implementation, ke.impact_quality, ke.impact_safety,
        ke.impact_yield, ke.cost_saving, ke.comment as eval_comment,
        ke.evaluated_at,
        (COALESCE(ke.ease_implementation,0) + COALESCE(ke.impact_quality,0) +
         COALESCE(ke.impact_safety,0) + COALESCE(ke.impact_yield,0) +
         COALESCE(ke.cost_saving,0)) as total_score
      FROM kaizen_ideas k
      LEFT JOIN users u ON k.user_id = u.id
      LEFT JOIN departments d ON k.department_id = d.id
      LEFT JOIN users a ON k.approver_id = a.id
      LEFT JOIN users e ON k.selected_evaluator_id = e.id
      LEFT JOIN users ci ON k.co_implementor_id = ci.id
      LEFT JOIN kaizen_implementations ki ON ki.kaizen_id = k.id
      LEFT JOIN kaizen_evaluations ke ON ke.kaizen_id = k.id
      WHERE k.id = ?
    `).bind(id).first();

    if (!kaizen) return err('Kaizen not found', 404);
    return json({ kaizen });
  }

  // List all kaizens with filters
  let where = '1=1';
  const params = [];
  if (status) { where += ' AND k.status = ?'; params.push(status); }

  const total = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM kaizen_ideas k WHERE ${where}`
  ).bind(...params).first();

  const { results } = await env.DB.prepare(`
    SELECT k.id, k.title, k.status, k.category, k.created_at, k.approval_reward,
      u.full_name as submitter_name, u.employee_id as submitter_emp_id,
      d.name as department_name,
      a.full_name as approver_name,
      (COALESCE(ke.ease_implementation,0) + COALESCE(ke.impact_quality,0) +
       COALESCE(ke.impact_safety,0) + COALESCE(ke.impact_yield,0) +
       COALESCE(ke.cost_saving,0)) as total_score
    FROM kaizen_ideas k
    LEFT JOIN users u ON k.user_id = u.id
    LEFT JOIN departments d ON k.department_id = d.id
    LEFT JOIN users a ON k.approver_id = a.id
    LEFT JOIN kaizen_evaluations ke ON ke.kaizen_id = k.id
    WHERE ${where}
    ORDER BY k.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, perPage, offset).all();

  return json({
    submissions: results,
    total: total?.c || 0,
    page, per_page: perPage,
    total_pages: Math.ceil((total?.c || 0) / perPage)
  });
}
