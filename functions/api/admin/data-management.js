import { json, err, auditLog, getClientIP } from '../_utils.js';

// Admin only - Data Management API
// DELETE /api/admin/data-management?type=X&id=Y  — delete single record
// DELETE /api/admin/data-management?type=X&clear=1 — clear ALL records of type

const ALLOWED_TYPES = {
  safety:       { table: 'safety_reports',           label: 'Safety Reports' },
  quality:      { table: 'quality_reports',          label: 'Quality Reports' },
  kaizen:       { table: 'kaizen_ideas',             label: 'Kaizen Ideas' },
  kaizen_impl:  { table: 'kaizen_implementations',   label: 'Kaizen Implementations' },
  qc:           { table: 'quality_circle_projects',  label: 'QC Circle Projects' },
  behavioral:   { table: 'behavioral_evaluations',   label: 'Behavioral Evaluations' },
  learning:     { table: 'learning_materials',       label: 'Learning Materials' },
  rewards:      { table: 'reward_transactions',      label: 'Reward Transactions' },
  notifications:{ table: 'notifications',            label: 'Notifications' },
};

// GET — list records for a type with preview
export async function onRequestGet({ request, env, data }) {
  if (data.user.role !== 'Admin') return err('Admin only', 403);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');

  if (!type || !ALLOWED_TYPES[type]) {
    // Return counts for all types
    const counts = {};
    for (const [key, cfg] of Object.entries(ALLOWED_TYPES)) {
      try {
        const r = await env.DB.prepare(`SELECT COUNT(*) as c FROM ${cfg.table}`).first();
        counts[key] = { label: cfg.label, count: r?.c || 0 };
      } catch { counts[key] = { label: cfg.label, count: 0 }; }
    }
    return json({ counts });
  }

  const cfg = ALLOWED_TYPES[type];
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = 20;
  const offset = (page - 1) * perPage;

  try {
    // Build a preview query with common fields
    const previewCols = {
      safety:        'id, title, status, created_at',
      quality:       'id, title, status, created_at',
      kaizen:        'id, title, status, created_at',
      kaizen_impl:   'id, kaizen_id, created_at',
      qc:            'id, title, status, created_at',
      behavioral:    'id, employee_id, status, created_at',
      learning:      'id, title, category, is_active, created_at',
      rewards:       'id, user_id, points, description, created_at',
      notifications: 'id, user_id, title, is_read, created_at',
    };

    const cols = previewCols[type] || 'id, created_at';
    const total = await env.DB.prepare(`SELECT COUNT(*) as c FROM ${cfg.table}`).first();
    const { results } = await env.DB.prepare(
      `SELECT ${cols} FROM ${cfg.table} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(perPage, offset).all();

    return json({
      type, label: cfg.label,
      total: total?.c || 0,
      page, per_page: perPage,
      records: results
    });
  } catch (e) {
    return err('DB error: ' + e.message, 500);
  }
}

// DELETE — remove single record or clear all
export async function onRequestDelete({ request, env, data }) {
  if (data.user.role !== 'Admin') return err('Admin only', 403);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');
  const clearAll = url.searchParams.get('clear') === '1';

  if (!type || !ALLOWED_TYPES[type]) return err('Invalid type', 400);
  if (!id && !clearAll) return err('Provide id or clear=1', 400);

  const cfg = ALLOWED_TYPES[type];

  try {
    if (clearAll) {
      // Count first for audit
      const before = await env.DB.prepare(`SELECT COUNT(*) as c FROM ${cfg.table}`).first();
      await env.DB.prepare(`DELETE FROM ${cfg.table}`).run();

      // Also clear related R2 files for learning
      if (type === 'learning') {
        try {
          const listed = await env.ATTACHMENTS.list({ prefix: 'learning/' });
          for (const obj of listed.objects || []) {
            await env.ATTACHMENTS.delete(obj.key);
          }
        } catch {}
      }

      await auditLog(env, data.user, `admin_clear_${type}`, cfg.table, null,
        { cleared: before?.c || 0 }, getClientIP(request));

      return json({ success: true, message: `Cleared ${before?.c || 0} records from ${cfg.label}` });
    } else {
      // Delete single record — also delete R2 file if learning
      if (type === 'learning') {
        try {
          const rec = await env.DB.prepare(`SELECT file_url FROM learning_materials WHERE id = ?`).bind(id).first();
          if (rec?.file_url) await env.ATTACHMENTS.delete(rec.file_url);
        } catch {}
      }

      const result = await env.DB.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).bind(id).run();
      if (!result.meta.changes) return err('Record not found', 404);

      await auditLog(env, data.user, `admin_delete_${type}`, cfg.table, id, {}, getClientIP(request));
      return json({ success: true, message: `Deleted ${cfg.label} #${id}` });
    }
  } catch (e) {
    return err('DB error: ' + e.message, 500);
  }
}
