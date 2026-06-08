export async function computeHash(text) {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function isDuplicate(env, table, hash, userId) {
  const existing = await env.DB.prepare(
    `SELECT id FROM ${table} WHERE content_hash = ? AND user_id = ? AND created_at > datetime('now', '-30 days')`
  ).bind(hash, userId).first();
  return !!existing;
}

export async function checkMonthlyCap(env, table, userId, maxPerMonth = 5) {
  const result = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM ${table}
     WHERE user_id = ? AND status = 'Approved'
     AND strftime('%Y-%m', approved_at) = strftime('%Y-%m', 'now')`
  ).bind(userId).first();
  return (result?.count || 0) >= maxPerMonth;
}
