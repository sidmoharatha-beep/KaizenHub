import { json, err } from '../_utils.js';

// POST /api/qc/members — Add/remove team members
export async function onRequestPost({ request, env, data }) {
  const user = data.user;

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { project_id, action, user_id } = body;

  if (!project_id) return err('project_id is required', 400);
  if (!action || !['add', 'remove'].includes(action)) return err('Action must be add or remove', 400);
  if (!user_id) return err('user_id is required', 400);

  const targetUserId = parseInt(user_id);

  // Verify project exists and user is owner
  const project = await env.DB.prepare(
    `SELECT * FROM quality_circle_projects WHERE id = ?`
  ).bind(project_id).first();

  if (!project) return err('QC project not found', 404);
  if (String(project.owner_id) !== String(user.id) && !['Admin'].includes(user.role)) {
    return err('Only the project owner can manage team members', 403);
  }
  if (!['Draft'].includes(project.status)) {
    return err('Can only modify team members while project is in Draft status', 400);
  }

  // Get current member count
  const memberCount = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM quality_circle_members WHERE project_id = ?`
  ).bind(project_id).first();

  if (action === 'add') {
    if (memberCount.count >= 6) return err('Maximum 6 team members allowed', 400);

    // Verify target user exists
    const targetUser = await env.DB.prepare(
      `SELECT id, name FROM users WHERE id = ? AND is_active = 1`
    ).bind(targetUserId).first();
    if (!targetUser) return err('User not found or inactive', 404);

    // Check not already a member
    const existing = await env.DB.prepare(
      `SELECT user_id FROM quality_circle_members WHERE project_id = ? AND user_id = ?`
    ).bind(project_id, targetUserId).first();
    if (existing) return err('User is already a team member', 409);

    await env.DB.prepare(
      `INSERT INTO quality_circle_members (project_id, user_id) VALUES (?, ?)`
    ).bind(project_id, targetUserId).run();

    return json({ success: true, message: `${targetUser.name} added to team`, member_count: memberCount.count + 1 });

  } else {
    // Remove
    if (targetUserId === project.owner_id) {
      return err('Cannot remove the project owner from the team', 400);
    }
    if (memberCount.count <= 3) return err('Minimum 3 team members required', 400);

    await env.DB.prepare(
      `DELETE FROM quality_circle_members WHERE project_id = ? AND user_id = ?`
    ).bind(project_id, targetUserId).run();

    return json({ success: true, message: 'Member removed', member_count: memberCount.count - 1 });
  }
}

// GET /api/qc/members?project_id=X — List team members
export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  const projectId = parseInt(url.searchParams.get('project_id'));
  if (!projectId) return err('project_id query param required', 400);

  try {
    const { results } = await env.DB.prepare(`
      SELECT u.id, u.name, u.employee_id, u.email, d.name as department_name
      FROM quality_circle_members qcm
      JOIN users u ON qcm.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE qcm.project_id = ?
    `).bind(projectId).all();

    return json({ members: results });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
