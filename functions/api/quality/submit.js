import { json, err, auditLog, getClientIP } from '../_utils.js';
import { computeHash, isDuplicate } from '../../lib/dedup.js';
import { uploadAttachment } from '../../lib/upload.js';
import { notify } from '../../lib/notifications.js';

// POST /api/quality/submit — Create a quality report
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
        body.attachment_url = await uploadAttachment(env, file, 'quality');
      } catch (e) {
        return err(e.message, 400);
      }
    }
  } else {
    try { body = await request.json(); } catch {
      return err('Invalid JSON', 400);
    }
  }

  const { subcategory, title, description, approver_id, severity, detection, customer_risk } = body;

  // Validation
  if (!subcategory || !['Quality Hazard', 'Quality SUSA'].includes(subcategory)) {
    return err('subcategory must be Quality Hazard or Quality SUSA', 400);
  }
  if (!title || title.trim().length < 3) return err('Title is required (min 3 chars)', 400);
  if (!description) return err('Description is required', 400);

  const sev = parseInt(severity);
  const det = parseInt(detection);
  const risk = parseInt(customer_risk);
  if (!sev || sev < 1 || sev > 5) return err('Severity must be 1-5', 400);
  if (!det || det < 1 || det > 5) return err('Detection must be 1-5', 400);
  if (!risk || risk < 1 || risk > 5) return err('Customer risk must be 1-5', 400);

  const deptId = parseInt(body.department_id) || user.department_id;
  const approverId = parseInt(approver_id) || user.manager_id;

  // Duplicate detection
  const hash = await computeHash(`${title}|${description}`);
  if (await isDuplicate(env, 'quality_reports', hash, user.id)) {
    return err('A similar quality report was already submitted in the last 30 days', 409);
  }

  try {
    const result = await env.DB.prepare(`
      INSERT INTO quality_reports (
        user_id, subcategory, title, description, department_id,
        severity, detection, customer_risk, attachment_url,
        content_hash, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted')
    `).bind(
      user.id, subcategory, title.trim(), description.trim(), deptId,
      sev, det, risk, body.attachment_url || null, hash
    ).run();

    const reportId = result.meta.last_row_id;

    // Notify manager
    if (user.manager_id) {
      await notify(env, {
        userId: user.manager_id,
        type: 'submission_received',
        title: 'New Quality Report',
        message: `${user.name} submitted a ${subcategory} report: "${title}"`,
        entityType: 'quality_report',
        entityId: reportId
      });
    }

    await auditLog(env, user, 'quality_submit', 'quality_report', reportId, { subcategory, title }, getClientIP(request));

    return json({
      id: reportId,
      quality_score: sev + det + risk,
      message: 'Quality report submitted successfully. Pending manager review.'
    }, 201);

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/quality/submit — List own quality reports
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
      `SELECT COUNT(*) as total FROM quality_reports WHERE ${whereClause}`
    ).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT * FROM quality_reports WHERE ${whereClause}
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
