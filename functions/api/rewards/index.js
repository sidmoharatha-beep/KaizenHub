import { json, err } from '../_utils.js';
import { getWalletBalance } from '../../lib/rewards.js';

// GET /api/rewards — Get wallet summary
export const onRequestGet = async ({ request, env, data }) => {
  const user = data.user;
  const url = new URL(request.url);
  // Admin/HR can view other users' wallets
  const targetUserId = ['Admin', 'HR'].includes(user.role)
    ? parseInt(url.searchParams.get('user_id')) || user.id
    : user.id;

  try {
    const wallet = await getWalletBalance(env, targetUserId);

    // Get recent transactions
    const { results: recent } = await env.DB.prepare(`
      SELECT * FROM reward_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 10
    `).bind(targetUserId).all();

    // Get monthly totals for chart
    const { results: monthly } = await env.DB.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, SUM(points) as total
      FROM reward_transactions WHERE user_id = ?
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC LIMIT 12
    `).bind(targetUserId).all();

    return json({
      ...wallet,
      recent_transactions: recent,
      monthly_trend: monthly
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
