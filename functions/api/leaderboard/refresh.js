import { json, err } from '../_utils.js';

// POST /api/leaderboard/refresh — Admin: force full leaderboard refresh
export async function onRequestPost({ request, env, data }) {
  if (data.user.role !== 'Admin') return err('Admin only', 403);

  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'all_time';

  try {
    const categories = ['safety', 'quality', 'kaizen', 'qc', 'behavioral'];

    // Clear existing cache for this period
    await env.DB.prepare(
      `DELETE FROM leaderboard_cache WHERE period = ?`
    ).bind(period).run();

    // Rebuild from reward_transactions
    const categorySourceMap = {
      safety: "'safety'",
      quality: "'quality'",
      kaizen: "'kaizen_approval','kaizen_implementation'",
      qc: "'qc'",
      behavioral: "'behavioral','well_done','great_job'"
    };

    for (const category of categories) {
      const sources = categorySourceMap[category];
      let dateFilter = '';

      if (period.startsWith('monthly_')) {
        const monthStr = period.replace('monthly_', '');
        dateFilter = `AND strftime('%Y-%m', created_at) = '${monthStr}'`;
      } else if (period.startsWith('quarterly_')) {
        const [yearStr, qStr] = period.replace('quarterly_', '').split('-Q');
        const qNum = parseInt(qStr);
        const startMonth = String((qNum - 1) * 3 + 1).padStart(2, '0');
        const endMonth = String(qNum * 3).padStart(2, '0');
        dateFilter = `AND strftime('%Y-%m', created_at) >= '${yearStr}-${startMonth}' AND strftime('%Y-%m', created_at) <= '${yearStr}-${endMonth}'`;
      } else if (period.startsWith('yearly_')) {
        const yearStr = period.replace('yearly_', '');
        dateFilter = `AND strftime('%Y', created_at) = '${yearStr}'`;
      }

      await env.DB.prepare(`
        INSERT INTO leaderboard_cache (user_id, category, points, period, updated_at)
        SELECT user_id, '${category}', SUM(points), ?, datetime('now')
        FROM reward_transactions
        WHERE source_type IN (${sources}) ${dateFilter}
        GROUP BY user_id
      `).bind(period).run();
    }

    // Build overall
    await env.DB.prepare(`
      INSERT INTO leaderboard_cache (user_id, category, points, period, updated_at)
      SELECT user_id, 'overall', SUM(points), ?, datetime('now')
      FROM leaderboard_cache
      WHERE period = ? AND category != 'overall'
      GROUP BY user_id
    `).bind(period, period).run();

    // Update ranks
    for (const cat of [...categories, 'overall']) {
      const { results: ranked } = await env.DB.prepare(`
        SELECT id FROM leaderboard_cache
        WHERE category = ? AND period = ?
        ORDER BY points DESC
      `).bind(cat, period).all();

      for (let i = 0; i < ranked.length; i++) {
        await env.DB.prepare(
          `UPDATE leaderboard_cache SET rank = ? WHERE id = ?`
        ).bind(i + 1, ranked[i].id).run();
      }
    }

    return json({
      success: true,
      period,
      message: `Leaderboard refreshed for period: ${period}`
    });

  } catch (e) {
    return err('Refresh error: ' + e.message, 500);
  }
}
