export const Scoring = {
  // Safety: Risk = Consequence * Likelihood
  // Near Miss is always 20pts (flat)
  // SUSA (Safety Observation) is always 5pts
  // Hazard: 1-4 = 5pts, 5-9 = 10pts, 10+ = 15pts
  safety: (consequence, likelihood, subcategory) => {
    if (subcategory === 'SUSA') return 5;
    if (subcategory === 'Near Miss') return 20;
    const score = consequence * likelihood;
    if (score >= 10) return 15;
    if (score >= 5) return 10;
    return 5;
  },

  // Quality Hazard: same risk tiers as safety hazard
  // 1-4 = 5pts, 5-9 = 10pts, 10+ = 15pts
  quality: (severity, detection, customerRisk) => {
    const score = severity + detection + customerRisk;
    if (score >= 10) return 15;
    if (score >= 5) return 10;
    return 5;
  },

  // Kaizen approval reward (fixed at 50pts)
  kaizenApproval: () => 50,

  // Kaizen implementation reward by final evaluation score (0-100)
  // Single evaluator scores 5 criteria on 1-3 scale
  // Per evaluator: sum of 5 criteria = 5-15
  // Normalize: finalScore = ((sum - 5) / 10) * 100
  // Tiers: 0-20=100, 21-40=200, 41-60=300, 61-80=400, 81-100=500
  kaizenImplementation: (evaluations) => {
    if (!evaluations || evaluations.length === 0) return { finalScore: 0, reward: 0 };

    // Each evaluation has: ease_implementation, impact_quality, impact_safety, impact_yield, cost_saving
    const evalScores = evaluations.map(e =>
      e.ease_implementation + e.impact_quality + e.impact_safety + e.impact_yield + e.cost_saving
    );
    const avgScore = evalScores.reduce((a, b) => a + b, 0) / evalScores.length;

    // Normalize to 0-100
    const finalScore = Math.round(((avgScore - 5) / 10) * 100);
    const clampedScore = Math.max(0, Math.min(100, finalScore));

    let reward;
    if (clampedScore > 80) reward = 500;
    else if (clampedScore > 60) reward = 400;
    else if (clampedScore > 40) reward = 300;
    else if (clampedScore > 20) reward = 200;
    else reward = 100;

    return { finalScore: clampedScore, reward };
  },

  // QC 12-step screening: each step 0-5, max 60, threshold 30
  qcScreening: (scores) => {
    const total = scores.reduce((a, b) => a + b, 0);
    return {
      total,
      maxScore: 60,
      passed: total >= 30,
      threshold: 30
    };
  },

  // QC Final evaluation: 7 criteria, max 100
  // Categories: Gold 85-100 (750-1000pts), Silver 70-84 (500-750pts), Bronze 55-69 (0-500pts)
  qcFinal: (evaluations) => {
    if (!evaluations || evaluations.length === 0) return { finalScore: 0, category: 'Participant', reward: 0 };

    const scores = evaluations.map(e => e.total_score);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    let category, minScore, maxScore, minReward, maxReward;
    if (avgScore >= 85) {
      category = 'Gold'; minScore = 85; maxScore = 100; minReward = 750; maxReward = 1000;
    } else if (avgScore >= 70) {
      category = 'Silver'; minScore = 70; maxScore = 84; minReward = 500; maxReward = 750;
    } else if (avgScore >= 55) {
      category = 'Bronze'; minScore = 55; maxScore = 69; minReward = 0; maxReward = 500;
    } else {
      return { finalScore: avgScore, category: 'Participant', reward: 0 };
    }

    // Dynamic formula: Reward = ((ActualScore - MinScore) / (MaxScore - MinScore)) * (MaxReward - MinReward) + MinReward
    const reward = Math.round(
      ((avgScore - minScore) / (maxScore - minScore)) * (maxReward - minReward) + minReward
    );

    return { finalScore: avgScore, category, reward };
  },

  // Behavioral recognition reward points (fixed)
  // Well Done Nomination = 100pts, Great Job Nomination = 500pts
  behavioralReward: (recognition) => {
    if (recognition === 'Great Job') return 500;
    if (recognition === 'Well Done') return 100;
    return 0;
  },

  // QC Registration (approval) reward = 100pts (fixed)
  qcRegistration: () => 100,

  // Behavioral: 8 criteria, each 1-3, max 24
  // 8-15 = Well Done, 16-24 = Great Job
  behavioral: (scores) => {
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    let recognition = null;
    if (total >= 16) recognition = 'Great Job';
    else if (total >= 8) recognition = 'Well Done';
    return { total, recognition, maxScore: 24 };
  }
};
