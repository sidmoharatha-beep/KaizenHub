-- 0001_core_rbac.sql
DROP TABLE IF EXISTS audit_trail;
DROP TABLE IF EXISTS approval_workflows;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS shifts;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS roles;

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL CHECK(name IN ('Operator','SIC','Manager','HR','QC Panel Member','Admin'))
);

INSERT INTO roles (name) VALUES ('Operator'),('SIC'),('Manager'),('HR'),('QC Panel Member'),('Admin');

CREATE TABLE departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL
);

CREATE TABLE shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  department_id INTEGER REFERENCES departments(id),
  shift_id INTEGER REFERENCES shifts(id),
  manager_id INTEGER REFERENCES users(id),
  sic_id INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE approval_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
  actor_user_id INTEGER NOT NULL REFERENCES users(id),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_trail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  metadata TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_entity ON audit_trail(entity_type, entity_id);
CREATE INDEX idx_workflow_entity ON approval_workflows(entity_type, entity_id);
