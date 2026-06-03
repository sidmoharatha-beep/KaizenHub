export async function onRequestPost({ request, env, data, params }) {
  const user = data.user;
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const role = user.role.toLowerCase();
  if (!['admin', 'manager'].includes(role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const { type, id } = params; // type = kaizen|safety|quality
  const tableMap = {
    kaizen: 'kaizen_submissions',
    safety: 'safety_submissions',
    quality: 'quality_submissions'
  };

  const table = tableMap[type];
  if (!table) return new Response(JSON.stringify({ error: 'Invalid type' }), { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { status, feedback } = body;
  const validStatus = {
    kaizen_submissions: ['Approved', 'Rejected', 'Under Review'],
    safety_submissions: ['Resolved', 'Closed', 'Under Review'],
    quality_submissions: ['Approved', 'Closed', 'Under Review']
  };

  if (!validStatus[table].includes(status)) {
    return new Response(JSON.stringify({ error: 'Invalid status' }), { status: 400 });
  }

  try {
    const result = await env.DB.prepare(`
      UPDATE ${table}
      SET status =?, updated_at = CURRENT_TIMESTAMP
      WHERE id =?
    `).bind(status, id).run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({
      message: `Submission ${status}`,
      id: id,
      status: status
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'DB error', detail: e.message }), { status: 500 });
  }
}
