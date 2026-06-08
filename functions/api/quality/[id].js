import { json } from '../_utils.js';
export async function onRequestDelete({ request, env }) {
  const segments = new URL(request.url).pathname.split('/');
  const id = parseInt(segments.pop());
  if (!id) return json({ error: 'Invalid id' }, 400);
  await env.DB.prepare('DELETE FROM quality_submissions WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
