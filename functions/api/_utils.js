// Shared API utilities
export function uuid() {
  return crypto.randomUUID();
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export function err(msg, status = 400) {
  return json({ error: msg }, status);
}

export async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('pbkdf2:')) return false;
  const [, saltHex, storedHash] = stored.split(':');
  const salt = Uint8Array.from(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashHex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === storedHash;
}

export async function auditLog(env, user, action, entityType, entityId, metadata, ip) {
  await env.DB.prepare(`
    INSERT INTO audit_trail (user_id, action, entity_type, entity_id, metadata, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    user.id,
    action,
    entityType || null,
    entityId || null,
    metadata ? (typeof metadata === 'object' ? JSON.stringify(metadata) : metadata) : null,
    ip || null
  ).run();
}

export function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For') ||
         'unknown';
}

export async function getSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;

  const session = await env.DB.prepare(
    `SELECT s.*, u.id as uid, u.employee_id, u.emp_id, u.full_name, u.role_id, u.unit, u.email, u.department_id, r.name as role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  return session || null;
}

export function paginate(url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;
  return { page, perPage, offset };
}
