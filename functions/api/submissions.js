import { json, err, getSession, auditLog } from './_utils.js';

export const onRequestOptions = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// GET /api/submissions — fetch submissions based on role
export const onRequestGet = async ({ request, env }) => {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status'); // optional

  let query, params;

  if (session.role === 'operator') {
    // Operators: only their own
    if (statusFilter) {
      query = 'SELECT * FROM submissions WHERE user_id = ? AND status = ? ORDER BY created_at DESC';
      params = [session.uid, statusFilter];
    } else {
      query = 'SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC';
      params = [session.uid];
    }
  } else {
    // Managers and admins: all submissions
    if (statusFilter) {
      query = 'SELECT * FROM submissions WHERE status = ? ORDER BY created_at ASC';
      params = [statusFilter];
    } else {
      query = 'SELECT * FROM submissions ORDER BY created_at DESC';
      params = [];
    }
  }

  const stmt = env.DB.prepare(query);
  const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all();

  return json({ submissions: results || [] });
}

// POST /api/submissions — create new submission
export async function onRequestPost({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { type, title, description, saving, approver_id, approver_name, file_name, file_data, file_type } = body;
  if (!type || !title || !description) return err('type, title, and description are required');
  if (!approver_id) return err('approver_id is required');

  const { meta } = await env.DB.prepare(
    `INSERT INTO submissions(user_id, emp_id, full_name, unit, type, title, description, saving, approver_id, approver_name, file_name, file_data, file_type)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    session.uid,
    session.emp_id,
    session.full_name,
    session.unit || '—',
    type, title, description,
    parseInt(saving) || 0,
    approver_id || null,
    approver_name || null,
    file_name || null,
    file_data || null,
    file_type || null
  ).run();

  const ip = request.headers.get('CF-Connecting-IP') || '';
  await auditLog(env, session, 'SUBMIT_IDEA', 'submission', String(meta?.last_row_id || ''),
    { type, title, approver_name }, ip);

  return json({ ok: true, message: 'Idea submitted successfully!' });
}

// PUT /api/submissions — approve or reject (manager/admin)
export async function onRequestPut({ request, env }) {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);
  if (!['manager', 'admin'].includes(session.role)) return err('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { id, status, feedback } = body;
  if (!id || !status) return err('id and status required');
  if (!['Approved', 'Rejected'].includes(status)) return err('status must be Approved or Rejected');

  const sub = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  if (!sub) return err('Submission not found', 404);
  if (sub.status !== 'Pending') return err('Submission already reviewed');

  const points = status === 'Approved' ? Math.floor(50 + Math.random() * 150) : 0;
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  await env.DB.prepare(
    `UPDATE submissions SET status=?, points=?, feedback=?, reviewed_by=?, reviewed_at=? WHERE id=?`
  ).bind(status, points, feedback || null, session.full_name, now, id).run();

  const ip = request.headers.get('CF-Connecting-IP') || '';
  await auditLog(env, session, status === 'Approved' ? 'APPROVE_IDEA' : 'REJECT_IDEA',
    'submission', String(id),
    { title: sub.title, submitter: sub.full_name, points, feedback },
    ip);

  return json({
    ok: true,
    points,
    message: status === 'Approved' ? `Approved! ${points} points awarded.` : 'Returned to submitter.'
  });
}
