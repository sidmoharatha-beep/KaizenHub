export async function onRequest(context) {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  
  // Skip auth for login, logout, and public files
  if (!url.pathname.startsWith('/api/') || 
      url.pathname === '/api/auth' || 
      request.method === 'OPTIONS') {
    return next();
  }
  
  // 1. Extract token from Authorization header
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return jsonErr('Missing token', 401);
  
  // 2. Validate session + get user
  const session = await env.DB.prepare(`
    SELECT s.user_id, s.expires_at, u.id, u.emp_id, u.full_name, u.email, u.role, u.unit, u.department_id, u.is_active
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).bind(token).first();
  
  if (!session ||!session.is_active) {
    return jsonErr('Invalid or expired session', 401);
  }
  
  // 3. Attach user to context
  data.user = {
    id: session.id,
    employee_id: session.emp_id,
    name: session.full_name,
    email: session.email,
    role: session.role,
    unit: session.unit,
    department_id: session.department_id
  };
  
  // 4. RBAC rules for enterprise modules
  const rbac = {
    '/api/safety/submit': ['Operator','admin','Admin','admin'],
    '/api/safety/review': ['Manager','manager','Admin','admin'],
    '/api/quality/submit': ['Operator','admin','Admin','admin'],
    '/api/quality/review': ['Manager','manager','Admin','admin'],
    '/api/kaizen/submit': ['Operator','admin','Admin','admin'],
    '/api/kaizen/evaluate': ['Manager','manager','QC Panel Member','Admin','admin'],
    '/api/qc/submit': ['Operator','admin','Admin','admin'],
    '/api/qc/review': ['QC Panel Member','Admin','admin'],
    '/api/behavioral': ['SIC','Manager','manager'],
    '/api/behavioral/approve': ['HR','Admin','admin'],
    '/api/admin': ['Admin','admin'],
    '/api/hr': ['HR','Admin','admin']
  };
  
  for (const [path, roles] of Object.entries(rbac)) {
    if (url.pathname.startsWith(path) &&!roles.includes(data.user.role)) {
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
