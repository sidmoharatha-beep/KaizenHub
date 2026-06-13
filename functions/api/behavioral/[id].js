import { json, err } from '../_utils.js';

// GET /api/behavioral/[id] — Get single evaluation details
export const onRequestGet = async ({ params, env, data }) => {
  const user = data.user;
  const id = parseInt(params.id);
  if (!id) return err('Invalid evaluation ID', 400);

  try {
    const evaluation = await env.DB.prepare(`
      SELECT be.*, u.name as employee_name, u.employee_id as employee_emp_id,
             ev.name as evaluator_name, hr.name as hr_approver_name,
             d.name as department_name
      FROM behavioral_evaluations be
      JOIN users u ON be.user_id = u.id
      JOIN users ev ON be.evaluator_id = ev.id
      LEFT JOIN users hr ON be.hr_approved_by = hr.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE be.id = ?
    `).bind(id).first();

    if (!evaluation) return err('Evaluation not found', 404);

    // Access check: target employee, evaluator, HR, Admin
    const canView = String(evaluation.user_id) === String(user.id) ||
      String(evaluation.evaluator_id) === String(user.id) ||
      ['HR', 'Admin'].includes(user.role);
    if (!canView) return err('Access denied', 403);

    // Workflow history
    const { results: workflow } = await env.DB.prepare(`
      SELECT aw.*, u.name as actor_name
      FROM approval_workflows aw
      JOIN users u ON aw.actor_user_id = u.id
      WHERE aw.entity_type = 'behavioral_evaluation' AND aw.entity_id = ?
      ORDER BY aw.created_at ASC
    `).bind(id).all();

    return json({ evaluation, workflow_history: workflow });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
