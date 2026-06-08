import { json, err, auditLog, getClientIP } from '../_utils.js';
import { Scoring } from '../../lib/scoring.js';
import { creditReward } from '../../lib/rewards.js';
import { checkMonthlyCap } from '../../lib/dedup.js';
import { notify } from '../../lib/notifications.js';

// POST /api/safety/review — Approve or reject a safety report
export async function onRequestPost({ request, env, data }) {
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

  // Fetch the report
  const report = await env.DB.prepare(
    `SELECT * FROM safety_reports WHERE id = ?`
  ).bind(id).first();

  if (!report) return err('Safety report not found', 404);
  if (report.status !== 'Submitted') {
    return err(`Cannot review a report with status: ${report.status}`, 400);
  }

  // Verify manager has authority over this department
  if (user.role === 'Manager' && user.department_id !== report.department_id) {
    return err('You can only review reports in your department', 403);
  }

  let rewardPoints = 0;

  if (status === 'Approved') {
    // Check monthly cap (max 5 approved per month per employee)
    const capped = await checkMonthlyCap(env, 'safety_reports', report.user_id, 5);

    if (!capped) {
      // Calculate reward based on risk score and subcategory
      rewardPoints = Scoring.safety(report.consequence, report.likelihood, report.subcategory);
    }
    // If capped, still approve but 0 points
  }

  try {
    // Update the report
    await env.DB.prepare(`
      UPDATE safety_reports
      SET status = ?, manager_comment = ?, reward_points = ?,
          approved_by = ?, approved_at = datetime('now')
      WHERE id = ?
    `).bind(status, manager_comment.trim(), rewardPoints, user.id, id).run();

    // Credit reward if approved with points
    if (status === 'Approved' && rewardPoints > 0) {
      await creditReward(env, {
        userId: report.user_id,
        sourceType: 'safety',
        sourceId: id,
        points: rewardPoints,
        description: `Safety report approved: ${report.title} (Risk Score: ${report.consequence * report.likelihood})`
      });
    }

    // Notify the submitter
    await notify(env, {
      userId: report.user_id,
      type: status === 'Approved' ? 'approved' : 'rejected',
      title: `Safety Report ${status}`,
      message: status === 'Approved'
        ? `Your safety report "${report.title}" was approved. ${rewardPoints > 0 ? `+${rewardPoints} points!` : '(Monthly cap reached, 0 points)'}`
        : `Your safety report "${report.title}" was rejected. Comment: ${manager_comment}`,
      entityType: 'safety_report',
      entityId: id
    });

    // Log to approval_workflows
    await env.DB.prepare(`
      INSERT INTO approval_workflows (entity_type, entity_id, step, status, actor_user_id, comment)
      VALUES ('safety_report', ?, 'manager_review', ?, ?, ?)
    `).bind(id, status.toLowerCase(), user.id, manager_comment.trim()).run();

    // Audit
    await auditLog(env, user, `safety_${status.toLowerCase()}`, 'safety_report', id,
      { reward_points: rewardPoints, comment: manager_comment }, getClientIP(request));

    return json({
      success: true,
      status,
      reward_points: rewardPoints,
      message: `Safety report ${status.toLowerCase()} successfully`
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/safety/review — List pending reports for review
export async function onRequestGet({ request, env, data }) {
  const user = data.user;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  let whereClause = "s.status = 'Submitted'";
  const params = [];

  if (user.role === 'Manager') {
    whereClause += ' AND s.department_id = ?';
    params.push(user.department_id);
  }

  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM safety_reports s WHERE ${whereClause}`
    ).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT s.*, u.name as submitter_name, u.employee_id as submitter_emp_id,
             d.name as department_name
      FROM safety_reports s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN departments d ON s.department_id = d.id
      WHERE ${whereClause}
      ORDER BY s.created_at DESC LIMIT ? OFFSET ?
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
