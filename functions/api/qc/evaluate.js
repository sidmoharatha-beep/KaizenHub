import { json, err, auditLog, getClientIP } from '../_utils.js';
import { Scoring } from '../../lib/scoring.js';
import { creditReward } from '../../lib/rewards.js';
import { notifyMany } from '../../lib/notifications.js';
import { isWithinWindow } from '../../lib/timeline.js';

// POST /api/qc/evaluate — Panel final evaluation
export async function onRequestPost({ request, env, data }) {
  const user = data.user;

  // Timeline check
  const window = isWithinWindow('qc_panel');
  if (!window.allowed) {
    return err(window.message, 400);
  }

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { project_id, problem_definition, root_cause_analysis, innovation, tangible_benefits, intangible_benefits, sustainability, presentation, comment } = body;

  if (!project_id) return err('project_id is required', 400);

  // Validate score ranges
  const fields = {
    problem_definition: { max: 10 },
    root_cause_analysis: { max: 15 },
    innovation: { max: 15 },
    tangible_benefits: { max: 20 },
    intangible_benefits: { max: 10 },
    sustainability: { max: 15 },
    presentation: { max: 15 }
  };

  const parsedScores = {};
  for (const [field, { max }] of Object.entries(fields)) {
    const val = parseInt(body[field]);
    if (isNaN(val) || val < 0 || val > max) {
      return err(`${field} must be 0-${max}`, 400);
    }
    parsedScores[field] = val;
  }

  // Verify project is in Panel Review
  const project = await env.DB.prepare(
    `SELECT * FROM quality_circle_projects WHERE id = ?`
  ).bind(project_id).first();

  if (!project) return err('Quality Circle Project not found', 404);
  if (project.status !== 'Panel Review') {
    return err(`Cannot evaluate a project with status: ${project.status}. Must be Panel Review.`, 400);
  }

  try {
    // Upsert evaluation
    await env.DB.prepare(`
      INSERT INTO qc_final_evaluations (
        project_id, evaluator_id, problem_definition, root_cause_analysis,
        innovation, tangible_benefits, intangible_benefits, sustainability, presentation, comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, evaluator_id) DO UPDATE SET
        problem_definition = ?, root_cause_analysis = ?, innovation = ?,
        tangible_benefits = ?, intangible_benefits = ?, sustainability = ?,
        presentation = ?, comment = ?, evaluated_at = CURRENT_TIMESTAMP
    `).bind(
      project_id, user.id,
      parsedScores.problem_definition, parsedScores.root_cause_analysis,
      parsedScores.innovation, parsedScores.tangible_benefits,
      parsedScores.intangible_benefits, parsedScores.sustainability,
      parsedScores.presentation, comment || null,
      // ON CONFLICT:
      parsedScores.problem_definition, parsedScores.root_cause_analysis,
      parsedScores.innovation, parsedScores.tangible_benefits,
      parsedScores.intangible_benefits, parsedScores.sustainability,
      parsedScores.presentation, comment || null
    ).run();

    // Check how many evaluators have submitted
    const evalCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM qc_final_evaluations WHERE project_id = ?`
    ).bind(project_id).first();

    // Finalize when at least 3 panel members have evaluated (configurable)
    const requiredPanelMembers = 3;
    let finalized = false;
    let finalResult = null;

    if (evalCount.count >= requiredPanelMembers) {
      // Get all evaluations
      const { results: allEvals } = await env.DB.prepare(
        `SELECT * FROM qc_final_evaluations WHERE project_id = ?`
      ).bind(project_id).all();

      finalResult = Scoring.qcFinal(allEvals);

      // Update project
      await env.DB.prepare(`
        UPDATE quality_circle_projects
        SET final_score = ?, category = ?, status = 'Closed'
        WHERE id = ?
      `).bind(finalResult.finalScore, finalResult.category, project_id).run();

      // Get team members for reward split
      const { results: members } = await env.DB.prepare(
        `SELECT user_id FROM quality_circle_members WHERE project_id = ?`
      ).bind(project_id).all();

      const memberIds = members.map(m => m.user_id);
      const memberCount = memberIds.length;

      // Split reward equally
      if (finalResult.reward > 0 && memberCount > 0) {
        const perMember = Math.floor(finalResult.reward / memberCount);
        const remainder = finalResult.reward - (perMember * memberCount);

        for (let i = 0; i < memberIds.length; i++) {
          const pts = i === 0 ? perMember + remainder : perMember; // Owner gets remainder
          await creditReward(env, {
            userId: memberIds[i],
            sourceType: 'qc',
            sourceId: project_id,
            points: pts,
            description: `Quality Circle Project "${project.title}" - ${finalResult.category} (${finalResult.finalScore}/100)`
          });
        }
      }

      // Notify all members
      await notifyMany(env, memberIds, {
        type: 'reward_credited',
        title: `Quality Circle Project Complete - ${finalResult.category}!`,
        message: `Quality Circle Project "${project.title}" scored ${finalResult.finalScore}/100 (${finalResult.category}). ${finalResult.reward > 0 ? `Total reward: ${finalResult.reward} pts split among ${memberCount} members.` : 'No reward for Participant category.'}`,
        entityType: 'qc_project',
        entityId: project_id
      });

      // Workflow log
      await env.DB.prepare(`
        INSERT INTO approval_workflows (entity_type, entity_id, step, status, actor_user_id, comment)
        VALUES ('qc_project', ?, 'panel_evaluation', 'approved', ?, ?)
      `).bind(project_id, user.id, `Final: ${finalResult.category} (${finalResult.finalScore}/100)`).run();

      finalized = true;
    }

    await auditLog(env, user, 'qc_evaluate', 'qc_project', project_id,
      { scores: parsedScores, finalized, finalResult }, getClientIP(request));

    return json({
      success: true,
      evaluations_count: evalCount.count,
      required: requiredPanelMembers,
      finalized,
      final_result: finalized ? finalResult : null,
      message: finalized
        ? `Panel evaluation complete. Category: ${finalResult.category}, Score: ${finalResult.finalScore}/100, Reward: ${finalResult.reward} pts`
        : `Evaluation recorded. ${requiredPanelMembers - evalCount.count} more panel member(s) needed.`
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}

// GET /api/qc/evaluate — List projects pending panel evaluation
export async function onRequestGet({ request, env, data }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT q.*, u.name as owner_name, d.name as department_name,
        (SELECT COUNT(*) FROM quality_circle_members WHERE project_id = q.id) as member_count,
        (SELECT COUNT(*) FROM qc_final_evaluations WHERE project_id = q.id) as eval_count
      FROM quality_circle_projects q
      JOIN users u ON q.owner_id = u.id
      LEFT JOIN departments d ON q.department_id = d.id
      WHERE q.status = 'Panel Review'
      ORDER BY q.created_at ASC
    `).all();

    return json({ projects: results });
  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
