import { json, err, auditLog, getClientIP } from '../_utils.js';
import { uploadAttachment } from '../../lib/upload.js';
import { notify } from '../../lib/notifications.js';

// POST /api/kaizen/implement — Upload implementation evidence
export const onRequestPost = async ({ request, env, data }) => {
  const user = data.user;

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return err('Multipart form data required for file uploads', 400);
  }

  const formData = await request.formData();
  const kaizenId = parseInt(formData.get('kaizen_id'));

  if (!kaizenId) return err('kaizen_id is required', 400);

  // Verify kaizen exists and is Approved
  const kaizen = await env.DB.prepare(
    `SELECT * FROM kaizen_ideas WHERE id = ?`
  ).bind(kaizenId).first();

  if (!kaizen) return err('Kaizen idea not found', 404);
  if (kaizen.status !== 'Approved') {
    return err(`Cannot implement a kaizen with status: ${kaizen.status}. Must be Approved.`, 400);
  }

  // Verify user is the owner or co-implementor
  if (String(kaizen.user_id) !== String(user.id) && String(kaizen.co_implementor_id) !== String(user.id)) {
    return err('Only the kaizen owner or co-implementor can submit implementation evidence', 403);
  }

  // Check if already implemented
  const existing = await env.DB.prepare(
    `SELECT id FROM kaizen_implementations WHERE kaizen_id = ?`
  ).bind(kaizenId).first();
  if (existing) return err('Implementation evidence already submitted', 409);

  // Upload files
  const evidenceFile = formData.get('evidence');
  const beforeImage = formData.get('before_image');
  const afterImage = formData.get('after_image');

  if (!evidenceFile || evidenceFile.size === 0) {
    return err('Evidence file is required', 400);
  }

  try {
    const evidenceUrl = await uploadAttachment(env, evidenceFile, 'kaizen/evidence');
    let beforeUrl = null, afterUrl = null;

    if (beforeImage && beforeImage.size > 0) {
      beforeUrl = await uploadAttachment(env, beforeImage, 'kaizen/before');
    }
    if (afterImage && afterImage.size > 0) {
      afterUrl = await uploadAttachment(env, afterImage, 'kaizen/after');
    }

    // Insert implementation record
    await env.DB.prepare(`
      INSERT INTO kaizen_implementations (kaizen_id, evidence_url, before_image_url, after_image_url, implemented_by, status)
      VALUES (?, ?, ?, ?, ?, 'Pending')
    `).bind(kaizenId, evidenceUrl, beforeUrl, afterUrl, user.id).run();

    // Update kaizen status
    await env.DB.prepare(`
      UPDATE kaizen_ideas SET status = 'Implemented' WHERE id = ?
    `).bind(kaizenId).run();

    // Notify the approver/manager for verification
    await notify(env, {
      userId: kaizen.approver_id,
      type: 'implementation_pending',
      title: 'Kaizen Implementation Submitted',
      message: `Implementation evidence submitted for kaizen: "${kaizen.title}". Ready for evaluation.`,
      entityType: 'kaizen_idea',
      entityId: kaizenId
    });

    await auditLog(env, user, 'kaizen_implement', 'kaizen_idea', kaizenId,
      { evidence: evidenceUrl }, getClientIP(request));

    return json({
      success: true,
      status: 'Implemented',
      message: 'Implementation evidence uploaded. Pending evaluation committee review.'
    }, 201);

  } catch (e) {
    return err('Upload/DB error: ' + e.message, 500);
  }
}
