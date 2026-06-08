import { json, err, auditLog, getClientIP } from '../_utils.js';

// POST /api/learning/submit — Admin upload training material (multipart)
// Max 5MB per file. Stores to R2 under learning/ prefix.
export async function onRequestPost({ request, env, data }) {
  const user = data.user;

  if (user.role !== 'Admin') {
    return err('Only Admin can upload training materials', 403);
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return err('Content-Type must be multipart/form-data', 400);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return err('Invalid form data', 400);
  }

  const title = (formData.get('title') || '').toString().trim();
  const description = (formData.get('description') || '').toString().trim() || null;
  const category = (formData.get('category') || '').toString().trim();
  const file = formData.get('file');

  if (!title || title.length < 3) return err('Title is required (min 3 chars)', 400);

  const validCategories = ['Safety', 'Quality', 'Kaizen', 'QC Circle', 'Behavioral', 'General'];
  if (!validCategories.includes(category)) {
    return err(`Category must be one of: ${validCategories.join(', ')}`, 400);
  }

  if (!file || typeof file === 'string' || file.size === 0) {
    return err('File is required', 400);
  }

  // Max 5MB
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return err('File size exceeds 5MB limit', 400);
  }

  const ext = file.name.split('.').pop().toLowerCase();
  const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi'];
  if (!allowedExts.includes(ext)) {
    return err(`File type .${ext} not allowed. Allowed: ${allowedExts.join(', ')}`, 400);
  }

  // Determine file_type from extension
  let fileType;
  if (ext === 'pdf') fileType = 'pdf';
  else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) fileType = 'image';
  else if (['mp4', 'mov', 'avi'].includes(ext)) fileType = 'video';
  else fileType = ext;

  try {
    const key = `learning/${crypto.randomUUID()}.${ext}`;
    await env.ATTACHMENTS.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: { originalName: file.name, uploadedBy: user.id, uploadedAt: new Date().toISOString() }
    });

    const fileUrl = key; // Frontend uses /api/attachments/{key} to serve

    const result = await env.DB.prepare(`
      INSERT INTO learning_materials (title, description, category, file_type, file_name, file_url, file_size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(title, description, category, fileType, file.name, fileUrl, file.size, user.id).run();

    const materialId = result.meta.last_row_id;

    await auditLog(env, user, 'learning_upload', 'learning_material', materialId,
      { title, category, fileType, fileName: file.name, fileSize: file.size }, getClientIP(request));

    return json({
      id: materialId,
      file_url: fileUrl,
      message: 'Training material uploaded successfully'
    }, 201);

  } catch (e) {
    return err('Upload failed: ' + e.message, 500);
  }
}