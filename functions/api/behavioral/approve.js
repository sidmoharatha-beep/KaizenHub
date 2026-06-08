import { json, err, auditLog, getClientIP } from '../_utils.js';
import { creditReward } from '../../lib/rewards.js';
import { notify } from '../../lib/notifications.js';
import { Scoring } from '../../lib/scoring.js';

// POST /api/behavioral/approve — HR approves/rejects behavioral evaluation
export const onRequestPost = async ({ request, env, data }) => {
  const user = data.user;

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { id, approved, comment } = body;

  if (!id) return err('Evaluation ID is required', 400);
  if (typeof approved !== 'boolean') return err('approved must be true or false', 400);

  const evaluation = await env.DB.prepare(
    `SELECT be.*, u.name as employee_name
     FROM behavioral_evaluations be
     JOIN users u ON be.user_id = u.id
     WHERE be.id = ?`
  ).bind(id).first();

  if (!evaluation) return err('Behavioral evaluation not found', 404);
  if (evaluation.status !== 'HR Approval') {
    return err(`Cannot approve evaluation with status: ${evaluation.status}`, 400);
  }

  const newStatus = approved ? 'Reward Released' : 'Rejected';

  try {
    await env.DB.prepare(`
      UPDATE behavioral_evaluations SET status = ?, hr_approved_by = ? WHERE id = ?
    `).bind(newStatus, user.id, id).run();

    if (approved) {
      // Credit fixed reward points: Well Done = 100pts, Great Job = 500pts
      const rewardPoints = Scoring.behavioralReward(evaluation.recognition);
      const sourceType = evaluation.recognition === 'Great Job' ? 'great_job' : 'well_done';
      if (rewardPoints > 0) {
        await creditReward(env, {
          userId: evaluation.user_id,
          sourceType,
          sourceId: id,
          points: rewardPoints,
          description: `Behavioral evaluation - ${evaluation.recognition || 'Recognition'} (${evaluation.month}/${evaluation.year})`
        });
      }

      await notify(env, {
        userId: evaluation.user_id,
        type: 'reward_credited',
        title: `${evaluation.recognition || 'Behavioral'} - Reward Released!`,
        message: `Your behavioral evaluation for ${evaluation.month}/${evaluation.year} was approved. ${rewardPoints > 0 ? `+${rewardPoints} points!` : ''}`,
        entityType: 'behavioral_evaluation',
        entityId: id
      });
    } else {
      await notify(env, {
        userId: evaluation.user_id,
        type: 'rejected',
        title: 'Behavioral Evaluation Rejected',
        message: `Your behavioral evaluation for ${evaluation.month}/${evaluation.year} was rejected by HR. ${comment || ''}`,
        entityType: 'behavioral_evaluation',
        entityId: id
      });
    }

    // Notify the evaluator too
    await notify(env, {
      userId: evaluation.evaluator_id,
      type: approved ? 'approved' : 'rejected',
      title: `Behavioral Eval ${approved ? 'Approved' : 'Rejected'}`,
      message: `Your evaluation of ${evaluation.employee_name} for ${evaluation.month}/${evaluation.year} was ${approved ? 'approved' : 'rejected'} by HR.`,
      entityType: 'behavioral_evaluation',
      entityId: id
    });

    // Workflow log
    await env.DB.prepare(`
      INSERT INTO approval_workflows (entity_type, entity_id, step, status, actor_user_id, comment)
      VALUES ('behavioral_evaluation', ?, 'hr_approval', ?, ?, ?)
    `).bind(id, approved ? 'approved' : 'rejected', user.id, comment || null).run();

    await auditLog(env, user, `behavioral_${approved ? 'approve' : 'reject'}`, 'behavioral_evaluation', id,
      { total_score: evaluation.total_score, recognition: evaluation.recognition }, getClientIP(request));

    const finalRewardPoints = approved ? Scoring.behavioralReward(evaluation.recognition) : 0;
    return json({
      success: true,
      status: newStatus,
      reward_points: finalRewardPoints,
      message: approved ? `Evaluation approved. ${finalRewardPoints} points released.` : 'Evaluation rejected.'
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/behavioral/approve — List pending HR approvals
export async function onRequestGet({ request, env, data }) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM behavioral_evaluations WHERE status = 'HR Approval'`
    ).first();

    const { results } = await env.DB.prepare(`
      SELECT be.*, u.name as employee_name, u.employee_id as employee_emp_id,
             ev.name as evaluator_name, d.name as department_name
      FROM behavioral_evaluations be
      JOIN users u ON be.user_id = u.id
      JOIN users ev ON be.evaluator_id = ev.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE be.status = 'HR Approval'
      ORDER BY be.created_at ASC LIMIT ? OFFSET ?
    `).bind(perPage, offset).all();

    return json({
      evaluations: results,
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
