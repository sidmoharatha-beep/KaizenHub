
// Review endpoint: POST /api/submissions/:type/:id/review
if (url.pathname.startsWith('/api/submissions/') && url.pathname.endsWith('/review') && request.method === 'POST') {
  const parts = url.pathname.split('/');
  const type = parts[3]; // kaizen, safety, quality
  const id = parts[4];
  const { status, feedback } = await request.json();
  const user = await getUser(request, env);
  console.log("User:", user); if (!user || user.role !== 'admin') return json({error: 'Unauthorized'}, 403);

  const table = type === 'kaizen'? 'kaizen_submissions' : type === 'safety'? 'safety_submissions' : 'quality_submissions';

  try {
    await env.DB.prepare(
      `UPDATE ${table} SET status =?, feedback =?, reviewed_at = datetime('now'), reviewed_by =? WHERE id =?`
    ).bind(status, feedback || null, user.emp_id, id).run();
    return json({success: true});
  } catch(e) {
    return json({error: e.message}, 500);
  }
}
