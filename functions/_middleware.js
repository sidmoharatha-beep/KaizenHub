export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  
  if (!url.pathname.startsWith('/api/') || 
      url.pathname === '/api/auth' || 
      request.method === 'OPTIONS') {
    return next();
  }
  
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return jsonErr('Missing token', 401);
  
  const session = await env.DB.prepare(`
    SELECT s.user_id, u.*, r.name as role
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    LEFT JOIN roles r ON u.role_id = r.id
    WHERE s.token =? AND s.expires_at > datetime('now') AND u.is_active = 1
  `).bind(token).first();
  
  if (!session) return jsonErr('Invalid or expired session', 401);
  
  data.user = {
    id: session.id,
    employee_id: session.emp_id || session.employee_id,
    name: session.full_name || session.name,
    email: session.email,
    role: session.role,
    unit: session.unit,
    department_id: session.department_id || 5
  };
  
  const rbac = {
    '/api/safety/submit': ['operator','admin'],
    '/api/safety/review': ['manager','admin'],
    '/api/quality/submit': ['operator','admin'],
    '/api/quality/review': ['manager','admin'],
    '/api/kaizen/submit': ['operator','admin'],
    '/api/kaizen/evaluate': ['manager','qc panel member','admin'],
    '/api/admin': ['admin']
  };
  
  for (const [path, roles] of Object.entries(rbac)) {
    if (url.pathname.startsWith(path) &&!roles.includes(data.user.role.toLowerCase())) {
      return jsonErr(`Forbidden: Requires role ${roles.join(' or ')}`, 403);
    }
  }
  
  return next();
}

function jsonErr(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
