-- 0003_seed.sql
INSERT INTO departments (name, code) VALUES 
('Production', 'PROD'), 
('Quality', 'QA'), 
('Maintenance', 'MAINT'), 
('Safety', 'SAFE'), 
('HR', 'HR');

INSERT INTO shifts (name, start_time, end_time) VALUES 
('A', '06:00', '14:00'), 
('B', '14:00', '22:00'), 
('C', '22:00', '06:00'), 
('General', '09:00', '17:30');

-- IMPORTANT: Replace with YOUR actual details
INSERT INTO users (employee_id, email, name, role_id, department_id) 
VALUES ('102647', 'sidmoharatha@gmail.com', 'Sidharth', 6, 5);
