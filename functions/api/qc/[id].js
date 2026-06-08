import { json, err } from '../_utils.js';

// GET /api/qc/[id] — Get QC project details
export const onRequestGet = async ({ params, env, data }) => {
  const user = data.user;
  const id = parseInt(params.id);
  if (!id) return err('Invalid project ID', 400);

  try {
    const project = await env.DB.prepare(`
      SELECT q.*, u.name as owner_name, u.employee_id as owner_emp_id,
             a.name as approver_name, d.name as department_name
      FROM quality_circle_projects q
      JOIN users u ON q.owner_id = u.id
      JOIN users a ON q.approver_id = a.id
      LEFT JOIN departments d ON q.department_id = d.id
      WHERE q.id = ?
    `).bind(id).first();

    if (!project) return err('QC project not found', 404);

    // Get team members
    const { results: members } = await env.DB.prepare(`
      SELECT u.id, u.name, u.employee_id, u.email, d.name as department_name
      FROM quality_circle_members qcm
      JOIN users u ON qcm.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE qcm.project_id = ?
    `).bind(id).all();

    // Get 12-step screening scores
    const { results: screeningScores } = await env.DB.prepare(`
      SELECT step_number, score, u.name as evaluator_name
      FROM qc_12step_scores s
      JOIN users u ON s.evaluator_id = u.id
      WHERE s.project_id = ?
      ORDER BY step_number ASC
    `).bind(id).all();

    // Get final evaluations
    const { results: finalEvals } = await env.DB.prepare(`
      SELECT qfe.*, u.name as evaluator_name
      FROM qc_final_evaluations qfe
      JOIN users u ON qfe.evaluator_id = u.id
      WHERE qfe.project_id = ?
    `).bind(id).all();

    // Get workflow history
    const { results: workflow } = await env.DB.prepare(`
      SELECT aw.*, u.name as actor_name
      FROM approval_workflows aw
      JOIN users u ON aw.actor_user_id = u.id
      WHERE aw.entity_type = 'qc_project' AND aw.entity_id = ?
      ORDER BY aw.created_at ASC
    `).bind(id).all();

    return json({
      project,
      members,
      screening_scores: screeningScores,
      final_evaluations: finalEvals,
      workflow_history: workflow
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
