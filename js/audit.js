async function logAudit(accion, tabla, descripcion, detalles = {}) {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const usuario = user?.email || 'admin';
    await supabaseClient.from('audit_log').insert({ accion, tabla, descripcion, usuario, detalles });
  } catch(e) { /* nunca bloquear la operación principal */ }
}
