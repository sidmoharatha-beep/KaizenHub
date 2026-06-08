import { hasPermission } from './lib/rbac.js';

export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  // Skip auth for non-API, auth endpoints (login/logout), OPTIONS
  if (!url.pathname.startsWith('/api/') ||
      url.pathname === '/api/auth' ||
      url.pathname.startsWith('/api/auth/') ||
      request.method === 'OPTIONS') {
    return next();
  }

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return jsonErr('Missing token', 401);

  const session = await env.DB.prepare(`
    SELECT s.user_id, u.id, u.employee_id, u.emp_id, u.email, u.name, u.full_name,
           u.role_id, u.department_id, u.shift_id, u.manager_id, u.sic_id, u.unit,
           u.is_active, r.name as role
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).bind(token).first();

  if (!session) return jsonErr('Invalid or expired session', 401);
  if (session.is_active === 0) return jsonErr('Account deactivated', 403);

  data.user = {
    id: session.id,
    employee_id: session.employee_id || session.emp_id,
    name: session.full_name || session.name,
    email: session.email,
    role: session.role || 'Operator',
    role_id: session.role_id,
    department_id: session.department_id,
    shift_id: session.shift_id,
    manager_id: session.manager_id,
    sic_id: session.sic_id,
    unit: session.unit
  };

  // RBAC check
  if (!hasPermission(data.user.role, url.pathname)) {
    return jsonErr(`Forbidden: insufficient permissions for ${url.pathname}`, 403);
  }

  return next();
}

function jsonErr(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
