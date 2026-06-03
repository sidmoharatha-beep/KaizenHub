export async function onRequestPost({ request, env, data }) {
  const user = data.user;
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let body;
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { defect_description, part_number, quantity, root_cause, corrective_action } = body;
  if (!defect_description) return new Response(JSON.stringify({ error: 'Defect description required' }), { status: 400 });

  try {
    const stmt = await env.DB.prepare(`
      INSERT INTO quality_submissions (user_id, defect_description, part_number, quantity, root_cause, corrective_action)
      VALUES (?,?,?,?,?,?)
    `).bind(user.id, defect_description, part_number || null, quantity || null, root_cause || null, corrective_action || null).run();

    return new Response(JSON.stringify({
      id: stmt.meta.last_row_id,
      message: 'Quality report submitted'
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'DB error', detail: e.message }), { status: 500 });
  }
}

export async function onRequestGet({ request, env, data }) {
  const user = data.user;
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();

  try {
    const role = user.role.toLowerCase();
    const isAdmin = ['admin', 'manager'].includes(role);

    if (id && id!== 'quality') {
      const query = isAdmin
       ? `SELECT q.*, u.full_name, u.emp_id FROM quality_submissions q
           JOIN users u ON q.user_id = u.id WHERE q.id =?`
        : `SELECT * FROM quality_submissions WHERE id =? AND user_id =?`;
      const params = isAdmin? [id] : [id, user.id];
      const { results } = await env.DB.prepare(query).bind(...params).all();
      if (!results.length) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      return new Response(JSON.stringify(results[0]), { headers: { 'Content-Type': 'application/json' } });
    }

    const query = isAdmin
     ? `SELECT q.*, u.full_name, u.emp_id FROM quality_submissions q
         JOIN users u ON q.user_id = u.id
         ORDER BY q.created_at DESC LIMIT 100`
      : `SELECT * FROM quality_submissions WHERE user_id =?
         ORDER BY created_at DESC LIMIT 100`;

    const stmt = isAdmin? env.DB.prepare(query) : env.DB.prepare(query).bind(user.id);
    const { results } = await stmt.all();
    return new Response(JSON.stringify({ submissions: results }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'DB error', detail: e.message }), { status: 500 });
  }
}
