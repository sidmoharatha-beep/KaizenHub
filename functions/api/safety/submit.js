import { json, err, auditLog, getClientIP } from '../_utils.js';
import { computeHash, isDuplicate } from '../../lib/dedup.js';
import { uploadAttachment } from '../../lib/upload.js';
import { notify } from '../../lib/notifications.js';

// POST /api/safety/submit — Create a safety report
export const onRequestPost = async ({ request, env, data }) => {
  const user = data.user;

  let body;
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    const file = formData.get('attachment');
    if (file && file.size > 0) {
      try {
        body.attachment_url = await uploadAttachment(env, file, 'safety');
      } catch (e) {
        return err(e.message, 400);
      }
    }
  } else {
    try { body = await request.json(); } catch {
      return err('Invalid JSON', 400);
    }
  }

  const { subcategory, title, location, department_id, approver_id, description, consequence, likelihood, immediate_action, incident_date } = body;

  // Validation
  if (!subcategory || !['Hazard', 'Near Miss', 'SUSA'].includes(subcategory)) {
    return err('subcategory must be Hazard, Near Miss, or SUSA', 400);
  }
  if (!title || title.trim().length < 3) return err('Title is required (min 3 chars)', 400);
  if (!location) return err('Location is required', 400);
  if (!description) return err('Description is required', 400);
  if (!incident_date) return err('Incident date is required', 400);

  const cons = parseInt(consequence);
  const lik = parseInt(likelihood);
  if (!cons || cons < 1 || cons > 5) return err('Consequence must be 1-5', 400);
  if (!lik || lik < 1 || lik > 5) return err('Likelihood must be 1-5', 400);

  const deptId = parseInt(department_id) || user.department_id;
  const approverId = parseInt(approver_id) || user.manager_id;

  // Duplicate detection via content hash
  const hash = await computeHash(`${title}|${description}|${location}`);
  if (await isDuplicate(env, 'safety_reports', hash, user.id)) {
    return err('A similar safety report was already submitted in the last 30 days', 409);
  }

  try {
    const result = await env.DB.prepare(`
      INSERT INTO safety_reports (
        user_id, subcategory, title, location, department_id, description,
        consequence, likelihood, immediate_action, attachment_url,
        incident_date, content_hash, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted')
    `).bind(
      user.id, subcategory, title.trim(), location.trim(), deptId,
      description.trim(), cons, lik, immediate_action || null,
      body.attachment_url || null, incident_date, hash
    ).run();

    const reportId = result.meta.last_row_id;

    // Notify the selected approver
    if (approverId) {
      await notify(env, {
        userId: approverId,
        type: 'submission_received',
        title: 'New Safety Report',
        message: `${user.name} submitted a ${subcategory} report: "${title}"`,
        entityType: 'safety_report',
        entityId: reportId
      });
    }

    await auditLog(env, user, 'safety_submit', 'safety_report', reportId, { subcategory, title }, getClientIP(request));

    return json({
      id: reportId,
      risk_score: cons * lik,
      message: 'Safety report submitted successfully. Pending manager review.'
    }, 201);

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/safety/submit — List own safety reports
export async function onRequestGet({ request, env, data }) {
  const user = data.user;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  let whereClause = 'user_id = ?';
  const params = [user.id];
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM safety_reports WHERE ${whereClause}`
    ).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT * FROM safety_reports WHERE ${whereClause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
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
