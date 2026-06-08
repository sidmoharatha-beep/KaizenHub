import { err } from '../_utils.js';
import { getAttachment } from '../../lib/upload.js';

// GET /api/attachments/[...path] — Serve files from R2
export async function onRequestGet({ params, env, data }) {
  if (!data.user) return err('Unauthorized', 401);

  const key = params.path;
  if (!key) return err('File path required', 400);

  const response = await getAttachment(env, key);
  if (!response) return err('File not found', 404);

  return response;
}
