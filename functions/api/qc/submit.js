import { json, err, auditLog, getClientIP } from '../_utils.js';
import { notify, notifyMany } from '../../lib/notifications.js';

// POST /api/qc/submit — Create a Quality Circle project
export const onRequestPost = async ({ request, env, data }) => {
  const user = data.user;

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { title, problem_statement, project_description, root_cause, tangible_benefits, intangible_benefits, department_id, approver_id, evaluator_id, team_members, submit } = body;

  // Validation
  if (!title || title.trim().length < 3) return err('Title is required (min 3 chars)', 400);
  if (!problem_statement) return err('Problem statement is required', 400);

  const approverId = parseInt(approver_id);
  if (!approverId) return err('Approver is required', 400);

  const evaluatorId = parseInt(evaluator_id);
  if (!evaluatorId) return err('Evaluator is required', 400);

  const deptId = parseInt(department_id) || user.department_id;

  // Team validation: min 3, max 6 (including owner)
  let memberIds = Array.isArray(team_members) ? team_members.map(id => parseInt(id)) : [];
  // Ensure owner is always included
  if (!memberIds.includes(user.id)) {
    memberIds = [user.id, ...memberIds];
  }
  // Remove duplicates
  memberIds = [...new Set(memberIds)];

  if (memberIds.length < 3) return err('Quality Circle Project requires minimum 3 team members (including yourself)', 400);
  if (memberIds.length > 6) return err('Quality Circle Project allows maximum 6 team members', 400);

  // Verify all members exist and are active
  for (const memberId of memberIds) {
    const member = await env.DB.prepare(
      `SELECT id FROM users WHERE id = ? AND is_active = 1`
    ).bind(memberId).first();
    if (!member) return err(`Team member with ID ${memberId} not found or inactive`, 400);
  }

  // Verify approver
  const approver = await env.DB.prepare(
    `SELECT u.id, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`
  ).bind(approverId).first();
  if (!approver || !['Manager', 'Admin'].includes(approver.role)) {
    return err('Approver must be a Manager or Admin', 400);
  }

  // Verify evaluator exists and is active
  const evaluator = await env.DB.prepare(
    `SELECT id FROM users WHERE id = ? AND is_active = 1`
  ).bind(evaluatorId).first();
  if (!evaluator) {
    return err('Selected evaluator not found or inactive', 400);
  }

  const status = submit ? 'Submitted' : 'Draft';

  try {
    // Insert project
    const result = await env.DB.prepare(`
      INSERT INTO quality_circle_projects (
        owner_id, title, problem_statement, project_description, root_cause,
        tangible_benefits, intangible_benefits, department_id, approver_id, evaluator_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      user.id, title.trim(), problem_statement.trim(),
      project_description || null, root_cause || null,
      tangible_benefits || null, intangible_benefits || null,
      deptId, approverId, evaluatorId, status
    ).run();

    const projectId = result.meta.last_row_id;

    // Insert team members
    const memberStmts = memberIds.map(memberId =>
      env.DB.prepare(`INSERT INTO quality_circle_members (project_id, user_id) VALUES (?, ?)`)
        .bind(projectId, memberId)
    );
    await env.DB.batch(memberStmts);

    // Notify approver if submitted
    if (status === 'Submitted') {
      await notify(env, {
        userId: approverId,
        type: 'submission_received',
        title: 'New Quality Circle Project',
        message: `${user.name} submitted Quality Circle Project: "${title}" with ${memberIds.length} team members`,
        entityType: 'qc_project',
        entityId: projectId
      });
    }

    await auditLog(env, user, 'qc_submit', 'qc_project', projectId,
      { title, team_size: memberIds.length, status }, getClientIP(request));

    return json({
      id: projectId,
      status,
      team_size: memberIds.length,
      message: status === 'Submitted' ? 'Quality Circle Project submitted for screening' : 'Quality Circle Project draft saved'
    }, 201);

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/qc/submit — List QC projects
export async function onRequestGet({ request, env, data }) {
  const user = data.user;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  const isReviewer = ['Manager', 'Admin', 'QC Panel Member'].includes(user.role);
  let whereClause, params = [];

  if (isReviewer) {
    whereClause = '1=1';
  } else {
    // Show projects where user is owner or member
    whereClause = '(q.owner_id = ? OR q.id IN (SELECT project_id FROM quality_circle_members WHERE user_id = ?))';
    params.push(user.id, user.id);
  }

  if (status) {
    whereClause += ' AND q.status = ?';
    params.push(status);
  }

  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM quality_circle_projects q WHERE ${whereClause}`
    ).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT q.*, u.name as owner_name, d.name as department_name,
        (SELECT COUNT(*) FROM quality_circle_members WHERE project_id = q.id) as member_count
      FROM quality_circle_projects q
      JOIN users u ON q.owner_id = u.id
      LEFT JOIN departments d ON q.department_id = d.id
      WHERE ${whereClause}
      ORDER BY q.created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, perPage, offset).all();

    return json({
      projects: results,
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
