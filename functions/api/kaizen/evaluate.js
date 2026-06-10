import { json, err, auditLog, getClientIP } from '../_utils.js';
import { Scoring } from '../../lib/scoring.js';
import { creditReward } from '../../lib/rewards.js';
import { notify } from '../../lib/notifications.js';
import { isWithinWindow } from '../../lib/timeline.js';

// POST /api/kaizen/evaluate — Selected evaluator submits evaluation
export const onRequestPost = async ({ request, env, data }) => {
  const user = data.user;

  // Timeline check
  const window = isWithinWindow('kaizen_eval');
  if (!window.allowed) {
    return err(window.message, 400);
  }

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { kaizen_id, ease_implementation, impact_quality, impact_safety, impact_yield, cost_saving, comment } = body;

  if (!kaizen_id) return err('kaizen_id is required', 400);

  // Validate scores (1-3 each)
  const scores = { ease_implementation, impact_quality, impact_safety, impact_yield, cost_saving };
  for (const [field, val] of Object.entries(scores)) {
    const v = parseInt(val);
    if (!v || v < 1 || v > 3) return err(`${field} must be 1-3`, 400);
  }

  // Verify kaizen is Pending Evaluation
  const kaizen = await env.DB.prepare(
    `SELECT * FROM kaizen_ideas WHERE id = ?`
  ).bind(kaizen_id).first();

  if (!kaizen) return err('Kaizen idea not found', 404);
  if (kaizen.status !== 'Evaluated') {
    return err(`Cannot evaluate a kaizen with status: ${kaizen.status}. Must be in Evaluated status.`, 400);
  }

  // Enforce: only the selected evaluator can submit scores
  if (!kaizen.selected_evaluator_id) {
    return err('This kaizen has no selected evaluator. Please contact the submitter to resubmit.', 400);
  }
  if (kaizen.selected_evaluator_id !== user.id) {
    return err('You are not the selected evaluator for this kaizen.', 403);
  }

  try {
    // Determine evaluator_role from department code
    const evalUser = await env.DB.prepare(
      'SELECT u.id, UPPER(d.code) as dept_code FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = ?'
    ).bind(user.id).first();

    const deptCode = evalUser?.dept_code || '';
    let evaluatorRole = 'MANEX'; // default
    if (deptCode === 'QA' || deptCode.includes('QUAL')) evaluatorRole = 'Quality';
    else if (deptCode === 'MAINT' || deptCode.includes('MAIN')) evaluatorRole = 'Maintenance';
    else if (deptCode === 'SAFE' || deptCode.includes('SAF')) evaluatorRole = 'Safety';
    else if (deptCode === 'MANEX' || deptCode.includes('MAN')) evaluatorRole = 'MANEX';

    // Upsert evaluation
    await env.DB.prepare(`
      INSERT INTO kaizen_evaluations (kaizen_id, evaluator_id, evaluator_role,
        ease_implementation, impact_quality, impact_safety, impact_yield, cost_saving, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kaizen_id, evaluator_id) DO UPDATE SET
        ease_implementation = ?, impact_quality = ?, impact_safety = ?,
        impact_yield = ?, cost_saving = ?, comment = ?, evaluated_at = CURRENT_TIMESTAMP
    `).bind(
      kaizen_id, user.id, evaluatorRole,
      parseInt(ease_implementation), parseInt(impact_quality), parseInt(impact_safety),
      parseInt(impact_yield), parseInt(cost_saving), comment || null,
      parseInt(ease_implementation), parseInt(impact_quality), parseInt(impact_safety),
      parseInt(impact_yield), parseInt(cost_saving), comment || null
    ).run();

    // Finalize: score and close
    const finalResult = Scoring.kaizenImplementation([{ ease_implementation, impact_quality, impact_safety, impact_yield, cost_saving }]);

    // Update kaizen status to Closed
    await env.DB.prepare(`
      UPDATE kaizen_ideas SET status = 'Closed' WHERE id = ?
    `).bind(kaizen_id).run();

    // Calculate reward split
    const totalReward = finalResult.reward;
    const hasCo = !!kaizen.co_implementor_id;
    const ownerReward = hasCo ? Math.floor(totalReward / 2) : totalReward;
    const coReward = hasCo ? Math.ceil(totalReward / 2) : 0;

    // Credit owner
    await creditReward(env, {
      userId: kaizen.user_id,
      sourceType: 'kaizen_implementation',
      sourceId: kaizen_id,
      points: ownerReward,
      description: `Kaizen implementation: "${kaizen.title}" (Score: ${finalResult.finalScore}/100)${hasCo ? ' [split with co-implementor]' : ''}`
    });

    // Credit co-implementor
    if (hasCo && coReward > 0) {
      await creditReward(env, {
        userId: kaizen.co_implementor_id,
        sourceType: 'kaizen_implementation',
        sourceId: kaizen_id,
        points: coReward,
        description: `Kaizen co-implementation: "${kaizen.title}" (Score: ${finalResult.finalScore}/100) [split]`
      });

      await notify(env, {
        userId: kaizen.co_implementor_id,
        type: 'reward_credited',
        title: 'Kaizen Implementation Reward',
        message: `+${coReward} points for kaizen co-implementation: "${kaizen.title}"`,
        entityType: 'kaizen_idea',
        entityId: kaizen_id
      });
    }

    // Notify owner
    await notify(env, {
      userId: kaizen.user_id,
      type: 'reward_credited',
      title: 'Kaizen Evaluation Complete!',
      message: `Your kaizen "${kaizen.title}" scored ${finalResult.finalScore}/100. +${ownerReward} points!`,
      entityType: 'kaizen_idea',
      entityId: kaizen_id
    });

    await auditLog(env, user, 'kaizen_evaluate', 'kaizen_idea', kaizen_id,
      { evaluator_id: user.id, scores, finalized: true, finalResult }, getClientIP(request));

    return json({
      success: true,
      evaluator_id: user.id,
      finalized: true,
      final_result: finalResult,
      message: `Evaluation complete. Final score: ${finalResult.finalScore}/100. Reward: ${finalResult.reward} pts.`
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/kaizen/evaluate — List kaizens pending evaluation by this user
export async function onRequestGet({ request, env, data }) {
  const user = data.user;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  try {
    // Only show kaizens where this user is the selected evaluator
    const { results } = await env.DB.prepare(`
      SELECT k.*, u.name as submitter_name,
        (SELECT id FROM kaizen_evaluations WHERE kaizen_id = k.id AND evaluator_id = ?) as my_eval
      FROM kaizen_ideas k
      JOIN users u ON k.user_id = u.id
      WHERE k.status = 'Evaluated' AND k.selected_evaluator_id = ?
      ORDER BY k.created_at DESC LIMIT ? OFFSET ?
    `).bind(user.id, user.id, perPage, offset).all();

    return json({ submissions: results });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}