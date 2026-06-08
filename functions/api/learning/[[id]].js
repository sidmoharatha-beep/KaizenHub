import { json, err, auditLog, getClientIP } from '../_utils.js';
import { deleteAttachment } from '../../lib/upload.js';

// PUT /api/learning/[id] — Admin edit material (title, description, category)
// DELETE /api/learning/[id] — Admin soft-delete (is_active = 0)
export const onRequestPut = async ({ request, env, data }) => {
  const user = data.user;
  if (user.role !== 'Admin') return err('Only Admin can edit materials', 403);

  const id = parseInt(data.params.id);
  if (!id) return err('Invalid material ID', 400);

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { title, description, category } = body;
  const validCategories = ['Safety', 'Quality', 'Kaizen', 'QC Circle', 'Behavioral', 'General'];

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length < 3) {
      return err('Title must be at least 3 characters', 400);
    }
  }

  if (category !== undefined && !validCategories.includes(category)) {
    return err(`Category must be one of: ${validCategories.join(', ')}`, 400);
  }

  try {
    const existing = await env.DB.prepare(
      `SELECT * FROM learning_materials WHERE id = ? AND is_active = 1`
    ).bind(id).first();

    if (!existing) return err('Material not found', 404);

    const newTitle = (title !== undefined) ? title.trim() : existing.title;
    const newDescription = (description !== undefined) ? (description === '' ? null : description.trim()) : existing.description;
    const newCategory = (category !== undefined) ? category : existing.category;

    await env.DB.prepare(`
      UPDATE learning_materials
      SET title = ?, description = ?, category = ?
      WHERE id = ?
    `).bind(newTitle, newDescription, newCategory, id).run();

    await auditLog(env, user, 'learning_edit', 'learning_material', id,
      { title: newTitle, category: newCategory }, getClientIP(request));

    return json({ message: 'Material updated successfully', id });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

export async function onRequestDelete({ request, env, data }) {
  const user = data.user;
  if (user.role !== 'Admin') return err('Only Admin can delete materials', 403);

  const id = parseInt(data.params.id);
  if (!id) return err('Invalid material ID', 400);

  try {
    const existing = await env.DB.prepare(
      `SELECT * FROM learning_materials WHERE id = ? AND is_active = 1`
    ).bind(id).first();

    if (!existing) return err('Material not found', 404);

    await env.DB.prepare(
      `UPDATE learning_materials SET is_active = 0 WHERE id = ?`
    ).bind(id).run();

    await auditLog(env, user, 'learning_delete', 'learning_material', id,
      { title: existing.title }, getClientIP(request));

    return json({ message: 'Material deleted successfully' });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}