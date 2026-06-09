import { json, err, auditLog, getClientIP } from '../_utils.js';
import { Scoring } from '../../lib/scoring.js';
import { notify } from '../../lib/notifications.js';
import { isWithinWindow } from '../../lib/timeline.js';

// POST /api/behavioral/evaluate — SIC/Manager submits behavioral evaluation
export async function onRequestPost({ request, env, data }) {
  const user = data.user;

  // Timeline check
  const window = isWithinWindow('behavioral_eval');
  if (!window.allowed) {
    return err(window.message, 400);
  }

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { user_id, month, year, selected_hr_id, responsiveness, preventive_value, ownership, attitude, communication, problem_solving, teamwork, standards_safety, comment } = body;

  // Validation
  if (!user_id) return err('Target user_id is required', 400);
  if (!selected_hr_id) return err('HR Approver is required', 400);
  if (!comment || comment.trim().length < 3) return err('Comment is mandatory (min 3 chars)', 400);

  const targetUserId = parseInt(user_id);
  const evalMonth = parseInt(month) || new Date().getMonth() + 1;
  const evalYear = parseInt(year) || new Date().getFullYear();

  if (evalMonth < 1 || evalMonth > 12) return err('Month must be 1-12', 400);
  if (targetUserId === user.id) return err('Cannot evaluate yourself', 400);

  // Validate all 8 criteria (1-3)
  const criteria = { responsiveness, preventive_value, ownership, attitude, communication, problem_solving, teamwork, standards_safety };
  for (const [field, val] of Object.entries(criteria)) {
    const v = parseInt(val);
    if (!v || v < 1 || v > 3) return err(`${field} must be 1-3`, 400);
  }

  // Verify target user exists and is in evaluator's department/team
  const targetUser = await env.DB.prepare(
    `SELECT u.id, u.name, u.department_id, u.manager_id, u.sic_id FROM users u WHERE u.id = ? AND u.is_active = 1`
  ).bind(targetUserId).first();

  if (!targetUser) return err('Target user not found or inactive', 404);

  // Verify evaluator has authority (SIC/Manager for this employee)
  if (user.role === 'SIC' && targetUser.sic_id !== user.id) {
    return err('You can only evaluate employees assigned to you as SIC', 403);
  }
  // Managers can evaluate any operator in the organization
  // HR will approve the final evaluation

  // Check for duplicate (one eval per employee per month)
  const existing = await env.DB.prepare(
    `SELECT id FROM behavioral_evaluations WHERE user_id = ? AND month = ? AND year = ?`
  ).bind(targetUserId, evalMonth, evalYear).first();

  if (existing) return err(`Behavioral evaluation for this employee already exists for ${evalMonth}/${evalYear}`, 409);

  const scores = {
    responsiveness: parseInt(responsiveness),
    preventive_value: parseInt(preventive_value),
    ownership: parseInt(ownership),
    attitude: parseInt(attitude),
    communication: parseInt(communication),
    problem_solving: parseInt(problem_solving),
    teamwork: parseInt(teamwork),
    standards_safety: parseInt(standards_safety)
  };

  const result = Scoring.behavioral(scores);

  try {
    const insertResult = await env.DB.prepare(`
      INSERT INTO behavioral_evaluations (
        user_id, evaluator_id, month, year,
        responsiveness, preventive_value, ownership, attitude,
        communication, problem_solving, teamwork, standards_safety,
        recognition, comment, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'HR Approval')
    `).bind(
      targetUserId, user.id, evalMonth, evalYear,
      scores.responsiveness, scores.preventive_value, scores.ownership, scores.attitude,
      scores.communication, scores.problem_solving, scores.teamwork, scores.standards_safety,
      result.recognition, comment.trim()
    ).run();

    const evalId = insertResult.meta.last_row_id;

    // Notify ONLY the selected HR approver
    const parsedHrId = parseInt(selected_hr_id);
    if (parsedHrId) {
      await notify(env, {
        userId: parsedHrId,
        type: 'hr_pending',
        title: 'Behavioral Evaluation Pending Approval',
        message: `${user.name} evaluated ${targetUser.name}: ${result.recognition || 'No recognition'} (${result.total}/${result.maxScore})`,
        entityType: 'behavioral_evaluation',
        entityId: evalId
      });
    }

    await auditLog(env, user, 'behavioral_evaluate', 'behavioral_evaluation', evalId,
      { target: targetUserId, total: result.total, recognition: result.recognition }, getClientIP(request));

    return json({
      id: evalId,
      total_score: result.total,
      max_score: result.maxScore,
      recognition: result.recognition,
      status: 'HR Approval',
      message: 'Behavioral evaluation submitted. Pending HR approval.'
    }, 201);

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/behavioral/evaluate — List evaluations by current user
export async function onRequestGet({ request, env, data }) {
  const user = data.user;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  try {
    const { results } = await env.DB.prepare(`
      SELECT be.*, u.name as employee_name, u.employee_id as employee_emp_id,
             ev.name as evaluator_name
      FROM behavioral_evaluations be
      JOIN users u ON be.user_id = u.id
      JOIN users ev ON be.evaluator_id = ev.id
      WHERE be.evaluator_id = ?
      ORDER BY be.created_at DESC LIMIT ? OFFSET ?
    `).bind(user.id, perPage, offset).all();

    return json({ evaluations: results });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
