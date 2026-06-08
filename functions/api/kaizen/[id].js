import { json, err } from '../_utils.js';

// GET /api/kaizen/[id] — Get single kaizen with full history
export const onRequestGet = async ({ params, env, data }) => {
  const user = data.user;
  const id = parseInt(params.id);
  if (!id) return err('Invalid kaizen ID', 400);

  try {
    const kaizen = await env.DB.prepare(`
      SELECT k.*, u.name as submitter_name, u.employee_id as submitter_emp_id,
             a.name as approver_name, d.name as department_name,
             co.name as co_implementor_name
      FROM kaizen_ideas k
      JOIN users u ON k.user_id = u.id
      JOIN users a ON k.approver_id = a.id
      LEFT JOIN departments d ON k.department_id = d.id
      LEFT JOIN users co ON k.co_implementor_id = co.id
      WHERE k.id = ?
    `).bind(id).first();

    if (!kaizen) return err('Kaizen idea not found', 404);

    // Check access: owner, co-implementor, approver, or reviewer role
    const canView = kaizen.user_id === user.id ||
      kaizen.co_implementor_id === user.id ||
      kaizen.approver_id === user.id ||
      ['Manager', 'Admin', 'QC Panel Member', 'HR'].includes(user.role);
    if (!canView) return err('Access denied', 403);

    // Get implementation details if exists
    const implementation = await env.DB.prepare(`
      SELECT ki.*, u.name as implementor_name
      FROM kaizen_implementations ki
      JOIN users u ON ki.implemented_by = u.id
      WHERE ki.kaizen_id = ?
    `).bind(id).first();

    // Get evaluations
    const { results: evaluations } = await env.DB.prepare(`
      SELECT ke.*, u.name as evaluator_name
      FROM kaizen_evaluations ke
      JOIN users u ON ke.evaluator_id = u.id
      WHERE ke.kaizen_id = ?
      ORDER BY ke.evaluated_at ASC
    `).bind(id).all();

    // Get workflow history
    const { results: workflow } = await env.DB.prepare(`
      SELECT aw.*, u.name as actor_name
      FROM approval_workflows aw
      JOIN users u ON aw.actor_user_id = u.id
      WHERE aw.entity_type = 'kaizen_idea' AND aw.entity_id = ?
      ORDER BY aw.created_at ASC
    `).bind(id).all();

    return json({
      kaizen,
      implementation: implementation || null,
      evaluations,
      workflow_history: workflow
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
