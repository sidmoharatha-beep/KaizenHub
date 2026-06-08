import { json, err, auditLog, getClientIP } from '../_utils.js';
import { creditReward } from '../../lib/rewards.js';
import { notify } from '../../lib/notifications.js';
import { Scoring } from '../../lib/scoring.js';

// POST /api/kaizen/approve — Manager approves kaizen (bypasses screening)
export async function onRequestPost({ request, env, data }) {
  const user = data.user;

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { id, action, comment } = body;

  if (!id) return err('Kaizen ID is required', 400);
  if (!action || !['approve', 'reject'].includes(action)) {
    return err('Action must be approve or reject', 400);
  }

  const kaizen = await env.DB.prepare(
    `SELECT * FROM kaizen_ideas WHERE id = ?`
  ).bind(id).first();

  if (!kaizen) return err('Kaizen idea not found', 404);
  if (kaizen.status !== 'Submitted') {
    return err(`Cannot approve a kaizen with status: ${kaizen.status}. Must be Submitted.`, 400);
  }

  if (user.role === 'Manager' && kaizen.approver_id !== user.id) {
    return err('You are not the assigned approver for this kaizen', 403);
  }

  const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
  const approvalReward = action === 'approve' ? Scoring.kaizenApproval() : 0;

  try {
    await env.DB.prepare(`
      UPDATE kaizen_ideas SET status = ?, approval_reward = ? WHERE id = ?
    `).bind(newStatus, approvalReward, id).run();

    await env.DB.prepare(`
      INSERT INTO approval_workflows (entity_type, entity_id, step, status, actor_user_id, comment)
      VALUES ('kaizen_idea', ?, 'approval', ?, ?, ?)
    `).bind(id, action === 'approve' ? 'approved' : 'rejected', user.id, comment || null).run();

    // Credit points for approval
    if (action === 'approve') {
      await creditReward(env, {
        userId: kaizen.user_id,
        sourceType: 'kaizen_approval',
        sourceId: id,
        points: approvalReward,
        description: `Kaizen approved: "${kaizen.title}"`
      });

      await notify(env, {
        userId: kaizen.user_id,
        type: 'approved',
        title: 'Kaizen Approved! +50 pts',
        message: `Your kaizen "${kaizen.title}" was approved! You earned ${approvalReward} points. Please proceed with implementation.`,
        entityType: 'kaizen_idea',
        entityId: id
      });

      if (kaizen.co_implementor_id) {
        await notify(env, {
          userId: kaizen.co_implementor_id,
          type: 'implementation_pending',
          title: 'Kaizen Implementation Pending',
          message: `You are a co-implementor for kaizen: "${kaizen.title}". Please work with the owner on implementation.`,
          entityType: 'kaizen_idea',
          entityId: id
        });
      }
    } else {
      await notify(env, {
        userId: kaizen.user_id,
        type: 'rejected',
        title: 'Kaizen Rejected',
        message: `Your kaizen "${kaizen.title}" was rejected. ${comment || ''}`,
        entityType: 'kaizen_idea',
        entityId: id
      });
    }

    await auditLog(env, user, `kaizen_${action}`, 'kaizen_idea', id,
      { reward: approvalReward, comment }, getClientIP(request));

    return json({
      success: true,
      status: newStatus,
      reward_points: approvalReward,
      message: action === 'approve'
        ? `Kaizen approved. ${approvalReward} points credited to submitter.`
        : 'Kaizen rejected.'
    });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}