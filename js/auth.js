// ============================================================
// AUTH.JS — Guard de autenticación para el dashboard público
// Se incluye en index.html antes de dashboard.js
// ============================================================

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = 'login.html';
    return false;
  }

  // Verificar aprobación
  const { data: access } = await supabaseClient
    .from('user_access')
    .select('approved')
    .eq('email', session.user.email)
    .single();

  if (!access || !access.approved) {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
    return false;
  }

  // Mostrar email en topbar
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = session.user.email;

  return true;
}

async function doLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}
