import { json } from '../_utils.js';
export async function onRequestDelete({ request, env }) {
  const segments = new URL(request.url).pathname.split('/');
  const id = parseInt(segments.pop());
  if (!id) return json({ error: 'Invalid id' }, 400);
  const { results } = await env.DB.prepare('DELETE FROM safety_reports WHERE id = ?').bind(id).all();
  return json({ ok: true });
}
