-- =====================================================
-- 0005_enterprise.sql — KaizenHub Enterprise Additions
-- Adds missing tables, indexes, views, and seed data
-- =====================================================

-- QC Final Panel Evaluation (separate from 12-step screening)
CREATE TABLE IF NOT EXISTS qc_final_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES quality_circle_projects(id),
  evaluator_id INTEGER NOT NULL REFERENCES users(id),
  problem_definition INTEGER NOT NULL CHECK(problem_definition BETWEEN 0 AND 10),
  root_cause_analysis INTEGER NOT NULL CHECK(root_cause_analysis BETWEEN 0 AND 15),
  innovation INTEGER NOT NULL CHECK(innovation BETWEEN 0 AND 15),
  tangible_benefits INTEGER NOT NULL CHECK(tangible_benefits BETWEEN 0 AND 20),
  intangible_benefits INTEGER NOT NULL CHECK(intangible_benefits BETWEEN 0 AND 10),
  sustainability INTEGER NOT NULL CHECK(sustainability BETWEEN 0 AND 15),
  presentation INTEGER NOT NULL CHECK(presentation BETWEEN 0 AND 15),
  total_score INTEGER GENERATED ALWAYS AS (
    problem_definition + root_cause_analysis + innovation +
    tangible_benefits + intangible_benefits + sustainability + presentation
  ) STORED,
  comment TEXT,
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, evaluator_id)
);

-- Leaderboard Cache (refreshed on reward credit + nightly)
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK(category IN (
    'safety','quality','kaizen','qc','behavioral','overall'
  )),
  points INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  period TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, category, period)
);


-- Monthly approved count views (for max 5/month enforcement)
CREATE VIEW IF NOT EXISTS v_monthly_safety_count AS
  SELECT user_id, strftime('%Y-%m', approved_at) as month, COUNT(*) as count
  FROM safety_reports WHERE status = 'Approved'
  GROUP BY user_id, strftime('%Y-%m', approved_at);

CREATE VIEW IF NOT EXISTS v_monthly_quality_count AS
  SELECT user_id, strftime('%Y-%m', approved_at) as month, COUNT(*) as count
  FROM quality_reports WHERE status = 'Approved'
  GROUP BY user_id, strftime('%Y-%m', approved_at);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_safety_hash ON safety_reports(content_hash);
CREATE INDEX IF NOT EXISTS idx_quality_hash ON quality_reports(content_hash);
CREATE INDEX IF NOT EXISTS idx_safety_user_month ON safety_reports(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quality_user_month ON quality_reports(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_safety_status ON safety_reports(status);
CREATE INDEX IF NOT EXISTS idx_quality_status ON quality_reports(status);
CREATE INDEX IF NOT EXISTS idx_kaizen_status ON kaizen_ideas(status);
CREATE INDEX IF NOT EXISTS idx_kaizen_user ON kaizen_ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_kaizen_approver ON kaizen_ideas(approver_id);
CREATE INDEX IF NOT EXISTS idx_kaizen_eval ON kaizen_evaluations(kaizen_id);
CREATE INDEX IF NOT EXISTS idx_qc_status ON quality_circle_projects(status);
CREATE INDEX IF NOT EXISTS idx_qc_owner ON quality_circle_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_user_month ON behavioral_evaluations(user_id, month, year);
CREATE INDEX IF NOT EXISTS idx_behavioral_status ON behavioral_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_rewards_user ON reward_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_rewards_source ON reward_transactions(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cat ON leaderboard_cache(category, period, rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON leaderboard_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_users_dept ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_shift ON users(shift_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);

-- Timeline rules for QC (quarter-based)
INSERT OR IGNORE INTO timeline_rules (module, start_day, end_day, quarter_based) VALUES
('qc_screening', 22, 31, 1);
INSERT OR IGNORE INTO timeline_rules (module, start_day, end_day, quarter_based) VALUES
('qc_panel', 1, 15, 1);

-- HR approval timeline
INSERT OR IGNORE INTO timeline_rules (module, start_day, end_day, month_offset) VALUES
('hr_approval', 1, 5, 1);
