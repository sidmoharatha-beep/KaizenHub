import { json, err, auditLog, getClientIP } from '../_utils.js';
import { isWithinWindow } from '../../lib/timeline.js';
import { notify } from '../../lib/notifications.js';

// POST /api/kaizen/screen — Manager screens kaizen (29th-31st)
export const onRequestPost = async ({ request, env, data }) => {
  const user = data.user;

  // Timeline check
  const window = isWithinWindow('kaizen_screening');
  if (!window.allowed) {
    return err(window.message, 400);
  }

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { id, action, comment } = body;
  // action: 'screen' (passes screening) or 'reject'

  if (!id) return err('Kaizen ID is required', 400);
  if (!action || !['screen', 'reject'].includes(action)) {
    return err('Action must be screen or reject', 400);
  }

  const kaizen = await env.DB.prepare(
    `SELECT * FROM kaizen_ideas WHERE id = ?`
  ).bind(id).first();

  if (!kaizen) return err('Kaizen idea not found', 404);
  if (kaizen.status !== 'Submitted') {
    return err(`Cannot screen a kaizen with status: ${kaizen.status}`, 400);
  }

  // Verify authority
  if (user.role === 'Manager' && String(kaizen.approver_id) !== String(user.id)) {
    return err('You are not the assigned approver for this kaizen', 403);
  }

  const newStatus = action === 'screen' ? 'Screened' : 'Rejected';

  try {
    await env.DB.prepare(`
      UPDATE kaizen_ideas SET status = ? WHERE id = ?
    `).bind(newStatus, id).run();

    await env.DB.prepare(`
      INSERT INTO approval_workflows (entity_type, entity_id, step, status, actor_user_id, comment)
      VALUES ('kaizen_idea', ?, 'screening', ?, ?, ?)
    `).bind(id, action === 'screen' ? 'approved' : 'rejected', user.id, comment || null).run();

    await notify(env, {
      userId: kaizen.user_id,
      type: action === 'screen' ? 'approved' : 'rejected',
      title: action === 'screen' ? 'Kaizen Screened' : 'Kaizen Rejected',
      message: action === 'screen'
        ? `Your kaizen "${kaizen.title}" passed screening and is ready for approval.`
        : `Your kaizen "${kaizen.title}" was rejected during screening. ${comment || ''}`,
      entityType: 'kaizen_idea',
      entityId: id
    });

    await auditLog(env, user, `kaizen_${action}`, 'kaizen_idea', id, { comment }, getClientIP(request));

    return json({ success: true, status: newStatus, message: `Kaizen ${action === 'screen' ? 'screened' : 'rejected'} successfully` });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
