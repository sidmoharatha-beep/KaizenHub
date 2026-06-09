import { json, err } from '../_utils.js';

// PUT /api/learning/[id] — Toggle is_active or edit material
// DELETE /api/learning/[id] — Hard delete material + R2 file
export async function onRequestPut({ request, env, data }) {
  const user = data.user;
  if (user.role !== 'Admin') return err('Only Admin can edit materials', 403);

  const rawId = data.params.id;
  const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId);
  if (!id || isNaN(id)) return err('Invalid material ID', 400);

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { is_active } = body;

  // Handle is_active toggle
  if (is_active !== undefined) {
    try {
      const val = is_active ? 1 : 0;
      await env.DB.prepare(
        'UPDATE learning_materials SET is_active = ? WHERE id = ?'
      ).bind(val, id).run();
      return json({ message: val === 1 ? 'Material activated' : 'Material deactivated' });
    } catch (e) {
      return err('Database error: ' + e.message, 500);
    }
  }

  // Handle title/description/category edit
  const { title, description, category } = body;
  const validCategories = ['Safety', 'Quality', 'Kaizen', 'QC Circle', 'Behavioral', 'General'];

  if (title !== undefined && (typeof title !== 'string' || title.trim().length < 3)) {
    return err('Title must be at least 3 characters', 400);
  }
  if (category !== undefined && !validCategories.includes(category)) {
    return err('Invalid category', 400);
  }

  try {
    const existing = await env.DB.prepare(
      'SELECT * FROM learning_materials WHERE id = ?'
    ).bind(id).first();
    if (!existing) return err('Material not found', 404);

    const newTitle = title !== undefined ? title.trim() : existing.title;
    const newDesc = description !== undefined ? (description || null) : existing.description;
    const newCat = category !== undefined ? category : existing.category;

    await env.DB.prepare(
      'UPDATE learning_materials SET title = ?, description = ?, category = ? WHERE id = ?'
    ).bind(newTitle, newDesc, newCat, id).run();

    return json({ message: 'Material updated successfully', id });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

export async function onRequestDelete({ request, env, data }) {
  const user = data.user;
  if (user.role !== 'Admin') return err('Only Admin can delete materials', 403);

  const rawId = data.params.id;
  const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId);
  if (!id || isNaN(id)) return err('Invalid material ID', 400);

  try {
    const existing = await env.DB.prepare(
      'SELECT id, title, file_url FROM learning_materials WHERE id = ?'
    ).bind(id).first();

    if (!existing) return err('Material not found', 404);

    // Delete R2 file silently - don't crash if it fails
    if (existing.file_url && env.ATTACHMENTS) {
      try { await env.ATTACHMENTS.delete(existing.file_url); } catch {}
    }

    // Delete DB record
    await env.DB.prepare(
      'DELETE FROM learning_materials WHERE id = ?'
    ).bind(id).run();

    return json({ message: 'Material "' + existing.title + '" deleted successfully' });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
