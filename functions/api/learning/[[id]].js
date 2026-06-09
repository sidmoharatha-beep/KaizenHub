import { json, err } from '../_utils.js';

function getIdFromRequest(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  const id = parseInt(last);
  return isNaN(id) ? null : id;
}

export async function onRequestPut({ request, env, data }) {
  const user = data.user;
  if (!user || user.role !== 'Admin') return err('Only Admin can edit materials', 403);
  const id = getIdFromRequest(request);
  if (!id) return err('Invalid ID in URL', 400);
  let body = {};
  try { body = await request.json(); } catch {}
  const { is_active, title, description, category } = body;
  try {
    if (is_active !== undefined) {
      await env.DB.prepare('UPDATE learning_materials SET is_active = ? WHERE id = ?').bind(is_active ? 1 : 0, id).run();
      return json({ message: is_active ? 'Activated' : 'Deactivated' });
    }
    const ex = await env.DB.prepare('SELECT * FROM learning_materials WHERE id = ?').bind(id).first();
    if (!ex) return err('Not found', 404);
    await env.DB.prepare('UPDATE learning_materials SET title = ?, description = ?, category = ? WHERE id = ?').bind(title ?? ex.title, description ?? ex.description, category ?? ex.category, id).run();
    return json({ message: 'Updated' });
  } catch (e) { return err('PUT error: ' + e.message, 500); }
}

export async function onRequestDelete({ request, env, data }) {
  const user = data.user;
  if (!user || user.role !== 'Admin') return err('Only Admin can delete', 403);
  const id = getIdFromRequest(request);
  if (!id) return err('Invalid ID in URL', 400);
  try {
    const rec = await env.DB.prepare('SELECT id, title, file_url FROM learning_materials WHERE id = ?').bind(id).first();
    if (!rec) return err('Not found: id=' + id, 404);
    if (rec.file_url && env.ATTACHMENTS) { try { await env.ATTACHMENTS.delete(rec.file_url); } catch {} }
    await env.DB.prepare('DELETE FROM learning_materials WHERE id = ?').bind(id).run();
    return json({ success: true, message: 'Deleted "' + rec.title + '"' });
  } catch (e) { return err('DELETE error: ' + e.message, 500); }
}