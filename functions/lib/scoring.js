export const Scoring = {
  safety: (consequence, likelihood) => {
    const score = consequence * likelihood;
    if (score >= 10) return 15;
    if (score >= 5) return 10;
    return 5;
  },
  
  quality: (severity, detection, risk) => {
    const score = severity + detection + risk;
    if (score >= 10) return 15;
    if (score >= 5) return 10;
    return 5;
  },

  kaizenImplementation: (ease, q, s, y, cost) => {
    const avgScore = ease + q + s + y + cost; // 5-15
    const finalScore = (avgScore - 5) / 10 * 100; // normalize to 0-100
    if (finalScore > 80) return 500;
    if (finalScore > 60) return 400;
    if (finalScore > 40) return 300;
    if (finalScore > 20) return 200;
    return 100;
  },

  qcReward: (actual, min, max, minReward, maxReward) => {
    return Math.round(((actual - min) / (max - min)) * (maxReward - minReward) + minReward);
  },

  behavioral: (scores) => {
    const total = Object.values(scores).reduce((a,b) => a+b, 0);
    if (total >= 16) return { recognition: 'Great Job', points: total };
    if (total >= 8) return { recognition: 'Well Done', points: total };
    return { recognition: null, points: total };
  }
};
