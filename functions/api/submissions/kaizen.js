export async function onRequestPost({ request, env, data }) {
  const user = data.user; // set by _middleware.js
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { title, current_state, proposed_state, expected_benefit } = body;
  if (!title) return new Response(JSON.stringify({ error: 'Title required' }), { status: 400 });

  try {
    const stmt = await env.DB.prepare(`
      INSERT INTO kaizen_submissions (user_id, title, current_state, proposed_state, expected_benefit)
      VALUES (?,?,?,?,?)
    `).bind(user.id, title, current_state || null, proposed_state || null, expected_benefit || null).run();

    return new Response(JSON.stringify({
      id: stmt.meta.last_row_id,
      message: 'Kaizen submitted'
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
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
    // GET /api/submissions/kaizen/:id
    if (id && id!== 'kaizen') {
      const role = user.role.toLowerCase();
      const isAdmin = ['admin', 'manager'].includes(role);

      const query = isAdmin
       ? `SELECT k.*, u.full_name, u.emp_id FROM kaizen_submissions k
           JOIN users u ON k.user_id = u.id WHERE k.id =?`
        : `SELECT * FROM kaizen_submissions WHERE id =? AND user_id =?`;

      const params = isAdmin? [id] : [id, user.id];
      const { results } = await env.DB.prepare(query).bind(...params).all();

      if (!results.length) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      return new Response(JSON.stringify(results[0]), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // GET /api/submissions/kaizen - list all
    const role = user.role.toLowerCase();
    const isAdmin = ['admin', 'manager'].includes(role);

    const query = isAdmin
     ? `SELECT k.*, u.full_name, u.emp_id FROM kaizen_submissions k
         JOIN users u ON k.user_id = u.id
         ORDER BY k.created_at DESC LIMIT 100`
      : `SELECT * FROM kaizen_submissions WHERE user_id =?
         ORDER BY created_at DESC LIMIT 100`;

    const stmt = isAdmin
     ? env.DB.prepare(query)
      : env.DB.prepare(query).bind(user.id);

    const { results } = await stmt.all();

    return new Response(JSON.stringify({ submissions: results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'DB error', detail: e.message }), { status: 500 });
  }
}
