export async function creditReward(env, { userId, sourceType, sourceId, points, description }) {
  if (points <= 0) return;

  await env.DB.prepare(`
    INSERT INTO reward_transactions (user_id, source_type, source_id, points, description)
    VALUES (?, ?, ?, ?, ?)
  `).bind(userId, sourceType, sourceId, points, description).run();

  // Update leaderboard cache for this user
  const period = `monthly_${new Date().toISOString().slice(0, 7)}`;
  const quarter = Math.floor(new Date().getMonth() / 3) + 1;
  const yearPeriod = `yearly_${new Date().getFullYear()}`;
  const qPeriod = `quarterly_${new Date().getFullYear()}-Q${quarter}`;

  const category = mapSourceToCategory(sourceType);
  const periods = [period, qPeriod, yearPeriod, 'all_time'];

  for (const p of periods) {
    // Upsert category-specific
    await env.DB.prepare(`
      INSERT INTO leaderboard_cache (user_id, category, points, period, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, category, period) DO UPDATE SET
        points = points + ?, updated_at = datetime('now')
    `).bind(userId, category, points, p, points).run();

    // Upsert overall
    await env.DB.prepare(`
      INSERT INTO leaderboard_cache (user_id, category, points, period, updated_at)
      VALUES (?, 'overall', ?, ?, datetime('now'))
      ON CONFLICT(user_id, category, period) DO UPDATE SET
        points = points + ?, updated_at = datetime('now')
    `).bind(userId, points, p, points).run();
  }
}

export async function getWalletBalance(env, userId) {
  const result = await env.DB.prepare(`
    SELECT source_type, SUM(points) as total
    FROM reward_transactions WHERE user_id = ?
    GROUP BY source_type
  `).bind(userId).all();

  const breakdown = {};
  let total = 0;
  for (const row of result.results || []) {
    const cat = mapSourceToCategory(row.source_type);
    breakdown[cat] = (breakdown[cat] || 0) + row.total;
    total += row.total;
  }

  return { total_points: total, breakdown };
}

function mapSourceToCategory(sourceType) {
  const map = {
    'safety': 'safety',
    'quality': 'quality',
    'kaizen_approval': 'kaizen',
    'kaizen_implementation': 'kaizen',
    'qc': 'qc',
    'qc_registration': 'qc',
    'behavioral': 'behavioral',
    'well_done': 'behavioral',
    'great_job': 'behavioral'
  };
  return map[sourceType] || sourceType;
}
