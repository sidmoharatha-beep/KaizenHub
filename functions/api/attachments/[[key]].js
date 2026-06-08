import { json, err } from '../_utils.js';

// GET /api/attachments/* — Serve file from R2 bucket
export const onRequestGet = async ({ request, env }) => {
  const pathname = new URL(request.url).pathname;
  const key = pathname.replace(/^\/api\/attachments\//, '');
  if (!key) return err('File key required', 400);

  try {
    const object = await env.ATTACHMENTS.get(key);
    if (!object) return err('File not found', 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });
  } catch (e) {
    return err('Failed to serve file: ' + e.message, 500);
  }
};
