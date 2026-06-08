-- Learning Module: training materials repository
-- Admin uploads PDFs, images, videos (max 5MB each)
-- All authenticated users can browse and download

CREATE TABLE IF NOT EXISTS learning_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT CHECK(category IN ('Safety','Quality','Kaizen','QC Circle','Behavioral','General')),
  file_type TEXT CHECK(file_type IN ('pdf','image','video')) NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_learning_active ON learning_materials(is_active);
CREATE INDEX IF NOT EXISTS idx_learning_category ON learning_materials(category);