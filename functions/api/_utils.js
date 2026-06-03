// ── shared/utils.js ──────────────────────────────────────────
export function uuid() {
  return crypto.randomUUID();
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
  if (!stored.startsWith('pbkdf2:')) return false;
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

export async function getSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;

  const session = await env.DB.prepare(
    `SELECT s.*, u.id as uid, u.emp_id, u.full_name, u.role_id, u.unit, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();

  return session || null;
}

export async function auditLog(env, actor, action, targetType, targetId, detail, ip) {
  await env.DB.prepare(
    `INSERT INTO audit_log(actor_id, actor_name, action, target_type, target_id, detail, ip)
     VALUES(?,?,?,?,?,?,?)`
  ).bind(
    actor.uid || actor.id,
    actor.full_name,
    action,
    targetType || null,
    targetId ? String(targetId) : null,
    detail ? (typeof detail === 'object' ? JSON.stringify(detail) : detail) : null,
    ip || null
  ).run();
}
