import { json, err, auditLog, getClientIP } from '../_utils.js';
import { Scoring } from '../../lib/scoring.js';
import { creditReward } from '../../lib/rewards.js';
import { checkMonthlyCap } from '../../lib/dedup.js';
import { notify } from '../../lib/notifications.js';

// POST /api/quality/review — Approve or reject a quality report
export const onRequestPost = async ({ request, env, data }) => {
  const user = data.user;

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { id, status, manager_comment } = body;

  if (!id) return err('Report ID is required', 400);
  if (!status || !['Approved', 'Rejected'].includes(status)) {
    return err('Status must be Approved or Rejected', 400);
  }
  if (!manager_comment || manager_comment.trim().length < 3) {
    return err('Manager comment is mandatory (min 3 chars)', 400);
  }

  const report = await env.DB.prepare(
    `SELECT * FROM quality_reports WHERE id = ?`
  ).bind(id).first();

  if (!report) return err('Quality report not found', 404);
  if (report.status !== 'Submitted') {
    return err(`Cannot review a report with status: ${report.status}`, 400);
  }

  if (user.role === 'Manager' && user.department_id !== report.department_id) {
    return err('You can only review reports in your department', 403);
  }

  let rewardPoints = 0;

  if (status === 'Approved') {
    const capped = await checkMonthlyCap(env, 'quality_reports', report.user_id, 5);
    if (!capped) {
      rewardPoints = Scoring.quality(report.severity, report.detection, report.customer_risk);
    }
  }

  try {
    await env.DB.prepare(`
      UPDATE quality_reports
      SET status = ?, manager_comment = ?, reward_points = ?,
          approved_by = ?, approved_at = datetime('now')
      WHERE id = ?
    `).bind(status, manager_comment.trim(), rewardPoints, user.id, id).run();

    if (status === 'Approved' && rewardPoints > 0) {
      await creditReward(env, {
        userId: report.user_id,
        sourceType: 'quality',
        sourceId: id,
        points: rewardPoints,
        description: `Quality report approved: ${report.title} (Score: ${report.severity + report.detection + report.customer_risk})`
      });
    }

    await notify(env, {
      userId: report.user_id,
      type: status === 'Approved' ? 'approved' : 'rejected',
      title: `Quality Report ${status}`,
      message: status === 'Approved'
        ? `Your quality report "${report.title}" was approved. ${rewardPoints > 0 ? `+${rewardPoints} points!` : '(Monthly cap reached, 0 points)'}`
        : `Your quality report "${report.title}" was rejected. Comment: ${manager_comment}`,
      entityType: 'quality_report',
      entityId: id
    });

    await env.DB.prepare(`
      INSERT INTO approval_workflows (entity_type, entity_id, step, status, actor_user_id, comment)
      VALUES ('quality_report', ?, 'manager_review', ?, ?, ?)
    `).bind(id, status.toLowerCase(), user.id, manager_comment.trim()).run();

    await auditLog(env, user, `quality_${status.toLowerCase()}`, 'quality_report', id,
      { reward_points: rewardPoints, comment: manager_comment }, getClientIP(request));

    return json({
      success: true,
      status,
      reward_points: rewardPoints,
      message: `Quality report ${status.toLowerCase()} successfully`
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/quality/review — List pending reports for review
export async function onRequestGet({ request, env, data }) {
  const user = data.user;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  let whereClause = "q.status = 'Submitted'";
  const params = [];

  if (user.role === 'Manager') {
    whereClause += ' AND q.department_id = ?';
    params.push(user.department_id);
  }

  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM quality_reports q WHERE ${whereClause}`
    ).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT q.*, u.name as submitter_name, u.employee_id as submitter_emp_id,
             d.name as department_name
      FROM quality_reports q
      JOIN users u ON q.user_id = u.id
      LEFT JOIN departments d ON q.department_id = d.id
      WHERE ${whereClause}
      ORDER BY q.created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, perPage, offset).all();

    return json({
      submissions: results,
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
