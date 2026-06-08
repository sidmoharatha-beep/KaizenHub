export async function notify(env, { userId, type, title, message, entityType, entityId }) {
  await env.DB.prepare(`
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(userId, type, title, message, entityType || null, entityId || null).run();
}

export async function notifyMany(env, userIds, { type, title, message, entityType, entityId }) {
  const batch = userIds.map(uid =>
    env.DB.prepare(`
      INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(uid, type, title, message, entityType || null, entityId || null)
  );
  if (batch.length > 0) {
    await env.DB.batch(batch);
  }
}

export async function getUnreadCount(env, userId) {
  const result = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`
  ).bind(userId).first();
  return result?.count || 0;
}

export async function markRead(env, userId, notificationId) {
  if (notificationId === 'all') {
    await env.DB.prepare(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`
    ).bind(userId).run();
  } else {
    await env.DB.prepare(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`
    ).bind(notificationId, userId).run();
  }
}
