import { json, err } from '../_utils.js';
import { auditLog } from '../_utils.js';

export async function onRequestPost({ request, env, data }) {
  const user = data.user; // from middleware
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { subcategory, title, location, description, consequence, likelihood, immediate_action, incident_date } = body;
  
  // Validation
  if (!subcategory ||!title ||!location ||!description ||!consequence ||!likelihood ||!incident_date) {
    return err('Missing required fields');
  }
  if (!['Hazard','Near Miss','SUSA'].includes(subcategory)) {
    return err('Invalid subcategory');
  }
  if (consequence < 1 || consequence > 5 || likelihood < 1 || likelihood > 5) {
    return err('Consequence and Likelihood must be 1-5');
  }

  // 1. Check 5/month limit for approved reports
  const thisMonth = new Date().toISOString().slice(0,7);
  const { count } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM safety_reports 
    WHERE user_id =? AND status = 'Approved' AND strftime('%Y-%m', created_at) =?
  `).bind(user.id, thisMonth).first();
  
  if (count >= 5) return err('Max 5 approved safety reports per month reached', 400);
  
  // 2. Duplicate detection: same title + location in 30 days
  const dup = await env.DB.prepare(`
    SELECT id FROM safety_reports 
    WHERE title =? AND location =? AND created_at > datetime('now', '-30 days')
  `).bind(title.trim(), location.trim()).first();
  
  if (dup) return err('Duplicate report found in last 30 days', 400);
  
  // 3. Calculate reward points
  const riskScore = consequence * likelihood;
  const reward = riskScore >= 10 ? 15 : riskScore >= 5 ? 10 : 5;
  
  // 4. Insert
  const result = await env.DB.prepare(`
    INSERT INTO safety_reports 
    (user_id, subcategory, title, location, department_id, description, consequence, likelihood, immediate_action, incident_date, reward_points) 
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    user.id, subcategory, title.trim(), location.trim(), user.department_id, 
    description.trim(), consequence, likelihood, immediate_action || '', incident_date, 0
  ).run();
  
  const reportId = result.meta.last_row_id;
  const ip = request.headers.get('CF-Connecting-IP') || '';
  await auditLog(env, user, 'SUBMIT', 'safety', reportId, body, ip);
  
  return json({ 
    id: reportId, 
    message: 'Safety report submitted. Pending manager review.',
    potential_reward: reward
  });
}
