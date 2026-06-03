const SUPABASE_URL = 'https://dtlfusrpcfqwnmyhscdv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0bGZ1c3JwY2Zxd25teWhzY2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3MTAsImV4cCI6MjA5MTc2NzcxMH0.vSYXG_GNN4KrW09CKLMEfMpoOR4FTsCc_Rm0YPUKGg4';
const ADMIN_PASSWORD = 'temple2024';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- CONFIG GLOBAL (única fuente de verdad, editable desde el admin) ----
// Tasa de seguro sobre el valor de mercadería. Default 1,2%; se sobreescribe
// con el valor guardado en la tabla `config`. La usan el dashboard y el admin.
let SEGURO = 0.012;
async function loadConfig() {
  try {
    const { data } = await supabaseClient.from('config').select('clave,valor');
    const row = (data || []).find(r => r.clave === 'seguro');
    if (row && row.valor != null) {
      const v = parseFloat(row.valor);
      if (!isNaN(v) && v >= 0) SEGURO = v;
    }
  } catch (e) {}
}
// Ping automático cada 3 días para evitar que Supabase se pause
if (!localStorage.getItem('lastPing') || Date.now() - localStorage.getItem('lastPing') > 259200000) {
  supabaseClient.from('uploads').select('id').limit(1).then(() => localStorage.setItem('lastPing', Date.now()));
}
