import { json, err } from '../_utils.js';

// GET /api/learning — List active training materials (all authenticated users)
export const onRequestGet = async ({ request, env, data }) => {
  const user = data.user;
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '50'), 100);
  const offset = (page - 1) * perPage;

  const validCategories = ['Safety', 'Quality', 'Kaizen', 'QC Circle', 'Behavioral', 'General'];

  try {
    let whereClause = 'lm.is_active = 1';
    const params = [];

    if (category) {
      if (!validCategories.includes(category)) {
        return err(`Invalid category. Must be one of: ${validCategories.join(', ')}`, 400);
      }
      whereClause += ' AND lm.category = ?';
      params.push(category);
    }

    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as total FROM learning_materials lm WHERE ${whereClause}`
    ).bind(...params).first();

    const { results } = await env.DB.prepare(`
      SELECT lm.id, lm.title, lm.description, lm.category, lm.file_type,
             lm.file_name, lm.file_url, lm.file_size, lm.created_at,
             u.full_name as uploaded_by_name
      FROM learning_materials lm
      LEFT JOIN users u ON lm.uploaded_by = u.id
      WHERE ${whereClause}
      ORDER BY lm.created_at DESC LIMIT ? OFFSET ?
    `).bind(...params, perPage, offset).all();

    return json({
      materials: results,
      pagination: {
        page, per_page: perPage,
        total: countResult?.total || 0,
        total_pages: Math.ceil((countResult?.total || 0) / perPage)
      }
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}