-- 0002_modules.sql
-- SAFETY
CREATE TABLE safety_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subcategory TEXT NOT NULL CHECK(subcategory IN ('Hazard','Near Miss','SUSA')),
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  description TEXT NOT NULL,
  consequence INTEGER NOT NULL CHECK(consequence BETWEEN 1 AND 5),
  likelihood INTEGER NOT NULL CHECK(likelihood BETWEEN 1 AND 5),
  risk_score INTEGER GENERATED ALWAYS AS (consequence * likelihood) STORED,
  immediate_action TEXT,
  attachment_url TEXT,
  incident_date DATE NOT NULL,
  status TEXT DEFAULT 'Submitted' CHECK(status IN ('Submitted','Approved','Rejected')),
  reward_points INTEGER DEFAULT 0,
  manager_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME,
  approved_by INTEGER REFERENCES users(id)
);

-- QUALITY
CREATE TABLE quality_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subcategory TEXT NOT NULL CHECK(subcategory IN ('Quality Hazard','Quality SUSA')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  severity INTEGER NOT NULL CHECK(severity BETWEEN 1 AND 5),
  detection INTEGER NOT NULL CHECK(detection BETWEEN 1 AND 5),
  customer_risk INTEGER NOT NULL CHECK(customer_risk BETWEEN 1 AND 5),
  quality_score INTEGER GENERATED ALWAYS AS (severity + detection + customer_risk) STORED,
  attachment_url TEXT,
  status TEXT DEFAULT 'Submitted' CHECK(status IN ('Submitted','Approved','Rejected')),
  reward_points INTEGER DEFAULT 0,
  manager_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME,
  approved_by INTEGER REFERENCES users(id)
);

-- KAIZEN
CREATE TABLE kaizen_ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  solution TEXT NOT NULL,
  tangible_benefits TEXT,
  intangible_benefits TEXT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  attachment_url TEXT,
  approver_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft','Submitted','Screened','Approved','Implemented','Evaluated','Closed','Rejected')),
  co_implementor_id INTEGER REFERENCES users(id),
  approval_reward INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kaizen_implementations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kaizen_id INTEGER UNIQUE NOT NULL REFERENCES kaizen_ideas(id),
  evidence_url TEXT NOT NULL,
  before_image_url TEXT,
  after_image_url TEXT,
  implemented_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  implemented_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending','Manager Review','Completed'))
);

CREATE TABLE kaizen_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kaizen_id INTEGER NOT NULL REFERENCES kaizen_ideas(id),
  evaluator_id INTEGER NOT NULL REFERENCES users(id),
  evaluator_role TEXT NOT NULL CHECK(evaluator_role IN ('MANEX','Quality','Maintenance','Safety')),
  ease_implementation INTEGER CHECK(ease_implementation BETWEEN 1 AND 3),
  impact_quality INTEGER CHECK(impact_quality BETWEEN 1 AND 3),
  impact_safety INTEGER CHECK(impact_safety BETWEEN 1 AND 3),
  impact_yield INTEGER CHECK(impact_yield BETWEEN 1 AND 3),
  cost_saving INTEGER CHECK(cost_saving BETWEEN 1 AND 3),
  comment TEXT,
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(kaizen_id, evaluator_id)
);

-- QC MODULE
CREATE TABLE quality_circle_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  project_description TEXT,
  root_cause TEXT,
  tangible_benefits TEXT,
  intangible_benefits TEXT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  approver_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft','Submitted','Screening','Panel Review','Closed','Rejected')),
  screening_score INTEGER DEFAULT 0,
  final_score INTEGER DEFAULT 0,
  category TEXT CHECK(category IN ('Gold','Silver','Bronze','Participant')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quality_circle_members (
  project_id INTEGER NOT NULL REFERENCES quality_circle_projects(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE qc_12step_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES quality_circle_projects(id),
  step_number INTEGER NOT NULL CHECK(step_number BETWEEN 1 AND 12),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 5),
  evaluator_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE(project_id, step_number)
);

-- BEHAVIORAL
CREATE TABLE behavioral_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  evaluator_id INTEGER NOT NULL REFERENCES users(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  responsiveness INTEGER CHECK(responsiveness BETWEEN 1 AND 3),
  preventive_value INTEGER CHECK(preventive_value BETWEEN 1 AND 3),
  ownership INTEGER CHECK(ownership BETWEEN 1 AND 3),
  attitude INTEGER CHECK(attitude BETWEEN 1 AND 3),
  communication INTEGER CHECK(communication BETWEEN 1 AND 3),
  problem_solving INTEGER CHECK(problem_solving BETWEEN 1 AND 3),
  teamwork INTEGER CHECK(teamwork BETWEEN 1 AND 3),
  standards_safety INTEGER CHECK(standards_safety BETWEEN 1 AND 3),
  total_score INTEGER GENERATED ALWAYS AS (responsiveness+preventive_value+ownership+attitude+communication+problem_solving+teamwork+standards_safety) STORED,
  recognition TEXT CHECK(recognition IN ('Well Done','Great Job')),
  comment TEXT NOT NULL,
  status TEXT DEFAULT 'Manager Evaluation' CHECK(status IN ('Manager Evaluation','HR Approval','Reward Released','Rejected')),
  hr_approved_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, month, year)
);

-- REWARDS + NOTIFICATIONS
CREATE TABLE reward_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  source_type TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  points INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE timeline_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module TEXT NOT NULL,
  start_day INTEGER,
  end_day INTEGER,
  month_offset INTEGER DEFAULT 0,
  quarter_based INTEGER DEFAULT 0
);

INSERT INTO timeline_rules (module, start_day, end_day) VALUES 
('kaizen_submission', 1, 28),
('kaizen_screening', 29, 31),
('behavioral_eval', 29, 31);

INSERT INTO timeline_rules (module, start_day, end_day, month_offset) VALUES 
('kaizen_eval', 15, 20, 1);
