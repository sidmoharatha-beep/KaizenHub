export async function onRequestPost({ request, env, data }) {
  const user = data.user;
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let body;
  try { body = await request.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { hazard_description, location, risk_level, suggested_action } = body;
  if (!hazard_description) return new Response(JSON.stringify({ error: 'Hazard description required' }), { status: 400 });

  try {
    const stmt = await env.DB.prepare(`
      INSERT INTO safety_submissions (user_id, hazard_description, location, risk_level, suggested_action)
      VALUES (?,?,?,?,?)
    `).bind(user.id, hazard_description, location || null, risk_level || null, suggested_action || null).run();

    return new Response(JSON.stringify({
      id: stmt.meta.last_row_id,
      message: 'Safety report submitted'
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'DB error', detail: e.message }), { status: 500 });
  }
}

// GET list only - single item handled by [type]/[id].js
export async function onRequestGet({ env, data }) {
  const user = data.user;
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  try {
    const role = user.role.toLowerCase();
    const isAdmin = ['admin', 'manager'].includes(role);

    const query = isAdmin
   ? `SELECT s.*, u.full_name, u.emp_id FROM safety_submissions s
         JOIN users u ON s.user_id = u.id
         ORDER BY s.created_at DESC LIMIT 100`
      : `SELECT * FROM safety_submissions WHERE user_id =?
         ORDER BY created_at DESC LIMIT 100`;

    const stmt = isAdmin? env.DB.prepare(query) : env.DB.prepare(query).bind(user.id);
    const { results } = await stmt.all();
    return new Response(JSON.stringify({ submissions: results }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'DB error', detail: e.message }), { status: 500 });
  }
}
