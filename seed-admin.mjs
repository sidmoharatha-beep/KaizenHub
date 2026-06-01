#!/usr/bin/env node
// ================================================================
//  seed-admin.mjs — Run ONCE to create the first admin account
//  Usage: node seed-admin.mjs
//
//  Requires: wrangler configured + D1 database created + schema applied
//  Run this AFTER: wrangler d1 execute kaizenhub-db --file=schema.sql
// ================================================================

import { execSync } from 'child_process';

// ── EDIT THESE ────────────────────────────────────────────────
const ADMIN = {
  emp_id:    'ADMIN-001',
  full_name: 'Sidhartha',
  email:     'sidmoharatha@gmail.com',
  password:  'Admin@1234',          // change this immediately after first login!
  unit:      'Management',
};
// ─────────────────────────────────────────────────────────────

// Simple PBKDF2 — mirrors the Workers implementation but runs in Node
import { createHash, pbkdf2Sync, randomBytes } from 'crypto';

function hashPassword(password) {
  const salt = randomBytes(16);
  const saltHex = salt.toString('hex');
  const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const hashHex = hash.toString('hex');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

function uuid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
}

const id = uuid();
const hashed = hashPassword(ADMIN.password);
const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

const sql = `
INSERT INTO users (id, emp_id, full_name, email, password, role, unit, created_at)
VALUES (
  '${id}',
  '${ADMIN.emp_id}',
  '${ADMIN.full_name}',
  '${ADMIN.email.toLowerCase()}',
  '${hashed}',
  'admin',
  '${ADMIN.unit}',
  '${now}'
);
`;

const tmpFile = '/tmp/seed_admin.sql';
import { writeFileSync } from 'fs';
writeFileSync(tmpFile, sql);

console.log('Creating admin user...');
try {
  execSync(`wrangler d1 execute kaizenhub-db --remote --file=${tmpFile}`, { stdio: 'inherit' });
  console.log('\n✅ Admin created!');
  console.log(`   Email   : ${ADMIN.email}`);
  console.log(`   Password: ${ADMIN.password}`);
  console.log('\n⚠  Change the password immediately after first login via Admin → Reset Password');
} catch (e) {
  console.error('Failed:', e.message);
}
