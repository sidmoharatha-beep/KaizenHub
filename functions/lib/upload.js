export async function uploadAttachment(env, file, prefix) {
  if (!file || !file.name) return null;

  const ext = file.name.split('.').pop().toLowerCase();
  const allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];
  if (!allowed.includes(ext)) {
    throw new Error(`File type .${ext} not allowed`);
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File size exceeds 10MB limit');
  }

  const key = `${prefix}/${crypto.randomUUID()}.${ext}`;
  await env.ATTACHMENTS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { originalName: file.name, uploadedAt: new Date().toISOString() }
  });

  return key;
}

export async function deleteAttachment(env, key) {
  if (!key) return;
  await env.ATTACHMENTS.delete(key);
}

export async function getAttachment(env, key) {
  if (!key) return null;
  const obj = await env.ATTACHMENTS.get(key);
  if (!obj) return null;

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${obj.customMetadata?.originalName || 'file'}"`,
      'Cache-Control': 'private, max-age=3600'
    }
  });
}
