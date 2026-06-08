import { json, err, auditLog, getClientIP } from '../_utils.js';
import { Scoring } from '../../lib/scoring.js';
import { creditReward } from '../../lib/rewards.js';
import { notify, notifyMany } from '../../lib/notifications.js';
import { isWithinWindow } from '../../lib/timeline.js';

// POST /api/qc/screen — 12-step QC screening
export const onRequestPost = async ({ request, env, data }) => {
  const user = data.user;

  // Timeline check
  const window = isWithinWindow('qc_screening');
  if (!window.allowed) {
    return err(window.message, 400);
  }

  let body;
  try { body = await request.json(); } catch {
    return err('Invalid JSON', 400);
  }

  const { project_id, scores } = body;

  if (!project_id) return err('project_id is required', 400);
  if (!Array.isArray(scores) || scores.length !== 12) {
    return err('Exactly 12 step scores are required', 400);
  }
  }

  // Validate each score is 0-5
  for (let i = 0; i < 12; i++) {
    const s = parseInt(scores[i]);
    if (isNaN(s) || s < 0 || s > 5) {
      return err(`Step ${i + 1} score must be 0-5`, 400);
    }
  }

  // Verify project exists and is Submitted
  const project = await env.DB.prepare(
    `SELECT * FROM quality_circle_projects WHERE id = ?`
  ).bind(project_id).first();

  if (!project) return err('Quality Circle Project not found', 404);
  if (project.status !== 'Submitted') {
    return err(`Cannot screen a project with status: ${project.status}. Must be Submitted.`, 400);
  }

  const scoreValues = scores.map(s => parseInt(s));
  const result = Scoring.qcScreening(scoreValues);

  try {
    // Insert/replace 12-step scores
    const stmts = scoreValues.map((score, idx) =>
      env.DB.prepare(`
        INSERT INTO qc_12step_scores (project_id, step_number, score, evaluator_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_id, step_number) DO UPDATE SET score = ?, evaluator_id = ?
      `).bind(project_id, idx + 1, score, user.id, score, user.id)
    );
    await env.DB.batch(stmts);

    // Update project
    const newStatus = result.passed ? 'Panel Review' : 'Rejected';
    await env.DB.prepare(`
      UPDATE quality_circle_projects SET screening_score = ?, status = ? WHERE id = ?
    `).bind(result.total, newStatus, project_id).run();

    // Credit QC Registration reward (100pts) to owner when project passes screening
    if (result.passed) {
      await creditReward(env, {
        userId: project.owner_id,
        sourceType: 'qc_registration',
        sourceId: project_id,
        points: Scoring.qcRegistration(),
        description: `Quality Circle Project registration approved: "${project.title}"`
      });
    }

    // Log workflow
    await env.DB.prepare(`
      INSERT INTO approval_workflows (entity_type, entity_id, step, status, actor_user_id, comment)
      VALUES ('qc_project', ?, 'screening', ?, ?, ?)
    `).bind(project_id, result.passed ? 'approved' : 'rejected', user.id,
      `Score: ${result.total}/${result.maxScore} (threshold: ${result.threshold})`).run();

    // Notify team members
    const { results: members } = await env.DB.prepare(
      `SELECT user_id FROM quality_circle_members WHERE project_id = ?`
    ).bind(project_id).all();

    const memberIds = members.map(m => m.user_id);
    await notifyMany(env, memberIds, {
      type: result.passed ? 'approved' : 'rejected',
      title: result.passed ? 'Quality Circle Project Passed Screening!' : 'Quality Circle Project Screening Failed',
      message: result.passed
        ? `Quality Circle Project "${project.title}" scored ${result.total}/${result.maxScore} and advanced to Panel Review. +${Scoring.qcRegistration()} points to project owner!`
        : `Quality Circle Project "${project.title}" scored ${result.total}/${result.maxScore} (below threshold of ${result.threshold}).`,
      entityType: 'qc_project',
      entityId: project_id
    });

    await auditLog(env, user, 'qc_screen', 'qc_project', project_id,
      { total: result.total, passed: result.passed }, getClientIP(request));

    return json({
      success: true,
      screening_score: result.total,
      max_score: result.maxScore,
      threshold: result.threshold,
      passed: result.passed,
      new_status: newStatus,
      message: result.passed
        ? `Screening passed (${result.total}/${result.maxScore}). Quality Circle Project advances to Panel Review.`
        : `Screening failed (${result.total}/${result.maxScore}). Below threshold of ${result.threshold}.`
    });

  } catch (e) {
    return err('Database error: ' + e.message, 500);
  }
}
