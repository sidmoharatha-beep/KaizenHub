import { json } from '../_utils.js';
import { getActiveWindows } from '../../lib/timeline.js';

// GET /api/timeline — Get active submission windows
export const onRequestGet = async ({ env, data }) => {
  const windows = getActiveWindows();

  // Also get rules from DB for any custom overrides
  const { results: rules } = await env.DB.prepare(
    `SELECT * FROM timeline_rules ORDER BY module`
  ).all();

  return json({
    current_windows: windows,
    rules,
    server_time: new Date().toISOString()
  });
};
