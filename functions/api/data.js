import { json, getSession } from './_utils.js';

export const onRequestGet = async ({ request, env }) => {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const [{ results: departments }, { results: shifts }, { results: roles }, { results: managers }, { results: evaluators }, { results: operators }, { results: hrUsers }] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, code FROM departments ORDER BY name'),
    env.DB.prepare('SELECT id, name FROM shifts ORDER BY name'),
    env.DB.prepare('SELECT id, name FROM roles ORDER BY id'),
    env.DB.prepare('SELECT id, employee_id, full_name FROM users WHERE role_id IN (3, 6) AND is_active = 1 ORDER BY full_name'),
    env.DB.prepare(`
      SELECT u.id, u.full_name, d.name as department_name, d.code as dept_code
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.is_active = 1 AND u.role_id IN (3, 6)
        AND (UPPER(d.code) IN ('MANEX','QA','MAINT','SAFE') OR u.role_id = 6)
      ORDER BY d.code, u.full_name
    `),
    env.DB.prepare('SELECT id, employee_id, full_name FROM users WHERE role_id = 1 AND is_active = 1 ORDER BY full_name'),
    env.DB.prepare(`
      SELECT id, employee_id, full_name FROM users
      WHERE is_active = 1 AND (role_id = 4 OR department_id = (SELECT id FROM departments WHERE code = 'HR'))
      ORDER BY full_name
    `),
  ]);

  return json({ departments, shifts, roles, managers, evaluators, operators, hrUsers });
}
