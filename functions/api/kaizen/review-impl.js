import { json, err, auditLog, getClientIP } from '../_utils.js';
import { notify } from '../../lib/notifications.js';

// POST /api/kaizen/review-impl — Manager reviews implementation and forwards to evaluator
export const onRequestPost = async ({ request, env, data }) => {
  const user = data.user;
  if (!['Manager', 'Admin'].includes(user.role)) return err('Manager only', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON', 400); }

  const { id, action, comment } = body;
  if (!id) return err('Kaizen ID required', 400);
  if (!['approve', 'reject'].includes(action)) return err('Action must be approve or reject', 400);

  const kaizen = await env.DB.prepare('SELECT * FROM kaizen_ideas WHERE id = ?').bind(id).first();
  if (!kaizen) return err('Kaizen not found', 404);
  if (kaizen.status !== 'Implemented') return err('Kaizen must be in Implemented status. Current: ' + kaizen.status, 400);
  if (user.role === 'Manager' && String(kaizen.approver_id) !== String(user.id)) return err('You are not the approver for this kaizen', 403);

  if (action === 'reject') {
    await env.DB.prepare('UPDATE kaizen_ideas SET status = ? WHERE id = ?').bind('Rejected', id).run();
    await notify(env, { userId: kaizen.user_id, type: 'rejected', title: 'Implementation Rejected',
      message: 'Your kaizen implementation was rejected by the manager. ' + (comment || ''),
      entityType: 'kaizen_idea', entityId: id });
    await auditLog(env, user, 'kaizen_impl_reject', 'kaizen_idea', id, { comment }, getClientIP(request));
    return json({ success: true, message: 'Implementation rejected' });
  }

  // Approve: move to Pending Evaluation and notify evaluator
  const evalId = kaizen.selected_evaluator_id;
  if (!evalId) return err('No evaluator assigned to this kaizen', 400);

  await env.DB.prepare('UPDATE kaizen_ideas SET status = ? WHERE id = ?').bind('Evaluated', id).run();
  await env.DB.prepare('UPDATE kaizen_implementations SET status = ? WHERE kaizen_id = ?').bind('Completed', id).run();

  await notify(env, { userId: evalId, type: 'implementation_pending', title: 'Kaizen Ready for Evaluation',
    message: 'Implementation reviewed and approved. Please evaluate kaizen: "' + kaizen.title + '"',
    entityType: 'kaizen_idea', entityId: id });

  await notify(env, { userId: kaizen.user_id, type: 'approved', title: 'Implementation Approved',
    message: 'Your implementation was approved by the manager and sent for evaluation!',
    entityType: 'kaizen_idea', entityId: id });

  await auditLog(env, user, 'kaizen_impl_approve', 'kaizen_idea', id, { comment, evaluator_id: evalId }, getClientIP(request));
  return json({ success: true, message: 'Implementation approved and sent to evaluator' });
};
