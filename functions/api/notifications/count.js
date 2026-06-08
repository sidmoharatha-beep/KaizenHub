import { json, err } from '../_utils.js';
import { getUnreadCount } from '../../lib/notifications.js';

// GET /api/notifications/count — Quick unread count
export const onRequestGet = async ({ env, data }) => {
  try {
    const count = await getUnreadCount(env, data.user.id);
    return json({ unread_count: count });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
};
