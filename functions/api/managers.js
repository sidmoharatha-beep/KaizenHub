import { json, err, getSession } from './_utils.js';

export const onRequestOptions = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};

// GET /api/managers — returns all managers (accessible by any logged-in user)
export const onRequestGet = async ({ request, env }) => {
  const session = await getSession(request, env);
  if (!session) return err('Unauthorized', 401);

  const { results } = await env.DB.prepare(
    `SELECT id, full_name, unit, emp_id FROM users WHERE role IN ('manager','admin') ORDER BY full_name ASC`
  ).all();

  return json({ managers: results || [] });
};
