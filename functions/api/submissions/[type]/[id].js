export async function onRequestGet({ env, data, params }) {
  const user = data.user;
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { type, id } = params;
  const tableMap = {
    kaizen: 'kaizen_submissions',
    safety: 'safety_submissions',
    quality: 'quality_submissions'
  };

  const table = tableMap[type];
  if (!table) return new Response(JSON.stringify({ error: 'Invalid type' }), { status: 400 });

  try {
    const role = user.role.toLowerCase();
    const isAdmin = ['admin', 'manager'].includes(role);

    const query = isAdmin
    ? `SELECT s.*, u.full_name, u.emp_id FROM ${table} s
         JOIN users u ON s.user_id = u.id WHERE s.id =?`
      : `SELECT * FROM ${table} WHERE id =? AND user_id =?`;

    const stmt = isAdmin
     ? env.DB.prepare(query).bind(id)
      : env.DB.prepare(query).bind(id, user.id);

    const result = await stmt.first();

    if (!result) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'DB error', detail: e.message }), { status: 500 });
  }
}
