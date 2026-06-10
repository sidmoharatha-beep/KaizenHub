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
  const idInt = id ? parseInt(id, 10) : null;
  const clearAll = url.searchParams.get('clear') === '1';

  if (!type || !ALLOWED_TYPES[type]) return err('Invalid type', 400);
  if (!id && !clearAll) return err('Provide id or clear=1', 400);

  const cfg = ALLOWED_TYPES[type];

  // Child tables that must be cleared before parent (FK constraints)
  const childDependencies = {
    kaizen:     ['kaizen_implementations', 'kaizen_evaluations', 'approval_workflows'],
    kaizen_impl:['kaizen_evaluations'],
    qc:         ['quality_circle_members', 'qc_12step_scores', 'qc_final_evaluations'],
    safety:     [], quality: [], behavioral: [], learning: [], rewards: [], notifications: [],
  };

  // Source types in reward_transactions per module (for leaderboard recalc)
  const rewardSources = {
    safety:     ['safety'],
    quality:    ['quality'],
    kaizen:     ['kaizen_approval', 'kaizen_implementation'],
    kaizen_impl:['kaizen_implementation'],
    qc:         ['qc', 'qc_registration'],
    behavioral: ['behavioral', 'well_done', 'great_job'],
  };

  try {
    if (clearAll) {
      const before = await env.DB.prepare(`SELECT COUNT(*) as c FROM ${cfg.table}`).first();

      // Delete FK children first to avoid constraint errors
      for (const childTable of (childDependencies[type] || [])) {
        try { await env.DB.prepare(`DELETE FROM ${childTable}`).run(); } catch {}
      }

      await env.DB.prepare(`DELETE FROM ${cfg.table}`).run();

      // Wipe related reward_transactions so leaderboard reflects reality
      for (const st of (rewardSources[type] || [])) {
        try { await env.DB.prepare(`DELETE FROM reward_transactions WHERE source_type = ?`).bind(st).run(); } catch {}
      }
      // Rebuild leaderboard_cache from remaining reward_transactions
      if (rewardSources[type]?.length > 0) {
        try { await env.DB.prepare(`DELETE FROM leaderboard_cache`).run(); } catch {}
      }

      // Clear R2 files for learning
      if (type === 'learning') {
        try {
          const listed = await env.ATTACHMENTS.list({ prefix: 'learning/' });
          for (const obj of listed.objects || []) {
            await env.ATTACHMENTS.delete(obj.key);
          }
        } catch {}
      }

      try { await auditLog(env, data.user, 'admin_clear_' + type, cfg.table, 0,
        { cleared: before?.c || 0 }, getClientIP(request)); } catch {}

      return json({ success: true, message: `Cleared ${before?.c || 0} records from ${cfg.label}` });
    } else {
      // Delete single record
      if (type === 'learning') {
        try {
          const rec = await env.DB.prepare(`SELECT file_url FROM learning_materials WHERE id = ?`).bind(id).first();
          if (rec?.file_url) await env.ATTACHMENTS.delete(rec.file_url);
        } catch {}
      }

      // Delete FK children first using parsed integer id
      if (type === 'kaizen') {
        try { await env.DB.prepare(`DELETE FROM kaizen_implementations WHERE kaizen_id = ?`).bind(idInt).run(); } catch {}
        try { await env.DB.prepare(`DELETE FROM kaizen_evaluations WHERE kaizen_id = ?`).bind(idInt).run(); } catch {}
        try { await env.DB.prepare(`DELETE FROM approval_workflows WHERE entity_type = 'kaizen_idea' AND entity_id = ?`).bind(idInt).run(); } catch {}
      }
      if (type === 'qc') {
        try { await env.DB.prepare(`DELETE FROM quality_circle_members WHERE project_id = ?`).bind(idInt).run(); } catch {}
        try { await env.DB.prepare(`DELETE FROM qc_12step_scores WHERE project_id = ?`).bind(idInt).run(); } catch {}
        try { await env.DB.prepare(`DELETE FROM qc_final_evaluations WHERE project_id = ?`).bind(idInt).run(); } catch {}
      }
      // Clean up approval_workflows for safety and quality (entity_type based, no FK but keeps DB clean)
      if (type === 'safety') {
        try { await env.DB.prepare(`DELETE FROM approval_workflows WHERE entity_type = 'safety_report' AND entity_id = ?`).bind(idInt).run(); } catch {}
      }
      if (type === 'quality') {
        try { await env.DB.prepare(`DELETE FROM approval_workflows WHERE entity_type = 'quality_report' AND entity_id = ?`).bind(idInt).run(); } catch {}
      }

      const result = await env.DB.prepare(`DELETE FROM ${cfg.table} WHERE id = ?`).bind(idInt).run();
      if (result.meta?.changes === 0) return err('Record not found', 404);

      try { await auditLog(env, data.user, 'admin_delete_' + type, cfg.table, idInt || 0, {}, getClientIP(request)); } catch {}
      return json({ success: true, message: 'Deleted ' + cfg.label + ' #' + id });
    }
  } catch (e) {
    return err('DB error: ' + e.message, 500);
  }
}
