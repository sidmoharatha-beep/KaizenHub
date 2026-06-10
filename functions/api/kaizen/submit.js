import { json, err, auditLog, getClientIP } from '../_utils.js';
import { uploadAttachment } from '../../lib/upload.js';
import { notify } from '../../lib/notifications.js';
import { isWithinWindow } from '../../lib/timeline.js';

// POST /api/kaizen/submit — Stage 1: New kaizen OR Stage 2: Implementation evidence
export async function onRequestPost({ request, env, data }) {
  const user = data.user;

  let body;
  const contentType = request.headers.get('content-type') || '';

  let photoFile = null;
  let attachment_url = null;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
    const file = formData.get('attachment');
    if (file && file.size > 0) {
      try {
        attachment_url = await uploadAttachment(env, file, 'kaizen');
      } catch (e) {
        return err(e.message, 400);
      }
    }
  } else {
    try { body = await request.json(); } catch {
      return err('Invalid JSON', 400);
    }
  }

  // ── Stage 2: Implementation evidence on an Approved kaizen ──
  const { kaizen_id, implementation_mode, co_implementor_id, selected_evaluator_id } = body;
  if (kaizen_id) {
    // Timeline check for implementation phase
    const window = isWithinWindow('kaizen_eval');
    if (!window.allowed) {
      return err(window.message, 400);
    }

    const kId = parseInt(kaizen_id);
    const kaizen = await env.DB.prepare(`SELECT * FROM kaizen_ideas WHERE id = ?`).bind(kId).first();
    if (!kaizen) return err('Kaizen idea not found', 404);
    if (kaizen.status !== 'Approved') {
      return err(`Cannot submit implementation for status: ${kaizen.status}. Must be Approved.`, 400);
    }
    const isOwner  = String(kaizen.user_id) === String(user.id);
    const isCoImpl = kaizen.co_implementor_id !== null && String(kaizen.co_implementor_id) === String(user.id);
    const isAdmin  = user.role === 'Admin';
    if (!isOwner && !isCoImpl && !isAdmin) {
      return err(`Permission denied: kaizen owner=${kaizen.user_id}, you=${user.id}`, 403);
    }

    const implMode = implementation_mode || 'self';
    const coImpId = co_implementor_id ? parseInt(co_implementor_id) : null;
    const evalId = parseInt(selected_evaluator_id) || null;

    if (!evalId) return err('Evaluator is required when submitting for evaluation', 400);

    // Validate evaluator exists
    const evaluator = await env.DB.prepare(
      `SELECT u.id FROM users u WHERE u.id = ? AND u.is_active = 1`
    ).bind(evalId).first();
    if (!evaluator) return err('Selected evaluator not found or inactive', 400);

    // Validate co-implementor if provided
    if (coImpId) {
      const coImp = await env.DB.prepare(`SELECT id FROM users WHERE id = ? AND is_active = 1`).bind(coImpId).first();
      if (!coImp) return err('Co-implementor not found or inactive', 400);
      if (String(coImpId) === String(user.id)) return err('Co-implementor cannot be yourself', 400);
    }

    // Check no prior implementation
    const existingImpl = await env.DB.prepare(
      `SELECT id FROM kaizen_implementations WHERE kaizen_id = ?`
    ).bind(kId).first();
    if (existingImpl) return err('Implementation evidence already submitted', 409);

    try {
      // Upload photo evidence
      let photoUrl = null;
      if (attachment_url) {
        photoUrl = attachment_url;
      } else if (photoFile) {
        photoUrl = await uploadAttachment(env, photoFile, 'kaizen/evidence');
      }

      // Insert implementation record
      await env.DB.prepare(`
        INSERT INTO kaizen_implementations (kaizen_id, evidence_url, implemented_by, status)
        VALUES (?, ?, ?, 'Manager Review')
      `).bind(kId, photoUrl, user.id).run();

      // Update kaizen to Pending Evaluation
      await env.DB.prepare(`
        UPDATE kaizen_ideas SET status = 'Implemented', implementation_mode = ?, co_implementor_id = ?, selected_evaluator_id = ?
        WHERE id = ?
      `).bind(implMode, coImpId, evalId, kId).run();

      // Notify manager to review implementation
      await notify(env, {
        userId: kaizen.approver_id,
        type: 'implementation_pending',
        title: 'Kaizen Implementation Submitted',
        message: `Implementation evidence submitted for kaizen: "${kaizen.title}". Please review and approve before sending to evaluator.`,
        entityType: 'kaizen_idea',
        entityId: kId
      });

      await auditLog(env, user, 'kaizen_implement', 'kaizen_idea', kId,
        { implementation_mode: implMode, co_implementor_id: coImpId, evaluator_id: evalId }, getClientIP(request));

      return json({ id: kId, status: 'Implemented', message: 'Implementation submitted! Your manager will review and send it to the evaluator.' });
    } catch (e) {
      return err('Database error: ' + e.message, 500);
    }
  }

  // ── Stage 1: New kaizen submission ──
  const window = isWithinWindow('kaizen_submission');
  if (!window.allowed) {
    return err(window.message, 400);
  }

  const { title, description, category, before_after, expected_impact, approver_id } = body;

  // Validation for Stage 1
  if (!title || title.trim().length < 3) return err('Title is required (min 3 chars)', 400);
  if (!description) return err('Description is required', 400);
  if (!category) return err('Category is required', 400);
  if (!before_after) return err('Before/After description is required', 400);
  if (!expected_impact) return err('Expected impact is required', 400);

  const deptId = user.department_id;
  const approverId = parseInt(approver_id);
  if (!approverId) return err('Approver is required', 400);

  // Verify approver exists and is Manager/Admin
  const approver = await env.DB.prepare(
    `SELECT u.id, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = ?`
  ).bind(approverId).first();
  if (!approver || !['Manager', 'Admin'].includes(approver.role)) {
    return err('Approver must be a Manager or Admin', 400);
  }

  try {
    // Insert new kaizen with status = Submitted
    const result = await env.DB.prepare(`
      INSERT INTO kaizen_ideas (
        user_id, title, problem, root_cause, solution,
        description, category, before_after, expected_impact,
        tangible_benefits, intangible_benefits,
        department_id, attachment_url, approver_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted')
    `).bind(
      user.id, title.trim(),
      description.trim(), before_after?.trim() || 'N/A', expected_impact?.trim() || 'N/A',
      description.trim(), category.trim(), before_after?.trim() || null, expected_impact?.trim() || null,
      body.tangible_benefits?.trim() || null, body.intangible_benefits?.trim() || null,
      deptId, attachment_url, approverId
    ).run();

    const kaizenId = result.meta.last_row_id;

    await notify(env, {
      userId: approverId,
      type: 'submission_received',
      title: 'New Kaizen Idea',
      message: `${user.name} submitted kaizen: "${title}"`,
      entityType: 'kaizen_idea',
      entityId: kaizenId
    });

    await auditLog(env, user, 'kaizen_submit', 'kaizen_idea', kaizenId,
      { title, status: 'Submitted' }, getClientIP(request));

    return json({
      id: kaizenId,
      status: 'Submitted',
      message: 'Kaizen idea submitted for review'
    }, 201);

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/kaizen/submit — List kaizen ideas
export async function onRequestGet({ request, env, data }) {
  const user = data.user;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  const isReviewer = ['Manager', 'Admin'].includes(user.role);
  let whereClause, params = [];

  if (isReviewer) {
    whereClause = user.role === 'Manager' ? 'k.approver_id = ?' : '1=1';
    if (user.role === 'Manager') params.push(user.id);
  } else {
    whereClause = 'k.user_id = ?';
    params.push(user.id);
  }

  if (status) {
    whereClause += ' AND k.status = ?';
    params.push(status);
  }

  try {
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM kaizen_ideas k WHERE ${whereClause}`
    ).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT k.*, u.name as submitter_name, u.employee_id as submitter_emp_id,
             a.name as approver_name, d.name as department_name
      FROM kaizen_ideas k
      JOIN users u ON k.user_id = u.id
      JOIN users a ON k.approver_id = a.id
      LEFT JOIN departments d ON k.department_id = d.id
      WHERE ${whereClause}
      ORDER BY k.created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, perPage, offset).all();

    return json({
      submissions: results,
      currentUserId: user.id,
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