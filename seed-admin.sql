-- Set admin password for Sidharth (password: OORJA@2026)
UPDATE users SET 
  full_name = COALESCE(full_name, name, 'Sidharth'),
  name = COALESCE(name, 'Sidharth'),
  password = 'pbkdf2:34ca9c4690dd7d083384f88cadc8f779:aca212a6dfcbb8066f07cde2a7180d33892c77c1a556ef3b3175b81b33212c35',
  role_id = (SELECT id FROM roles WHERE name = 'Admin'),
  is_active = 1,
  shift_id = (SELECT id FROM shifts WHERE name = 'General'),
  department_id = (SELECT id FROM departments WHERE code = 'HR')
WHERE employee_id = '102647';
