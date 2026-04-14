// ============================================================
// CONFIGURACIÓN DE SUPABASE
// Reemplazá estos valores con los tuyos al crear el proyecto
// en https://supabase.com (Paso 2 de la guía)
// ============================================================

const SUPABASE_URL = 'TU_SUPABASE_URL';        // ej: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'TU_SUPABASE_ANON_KEY'; // clave pública (anon key)

// Contraseña del panel admin — cambiala por la que quieras
const ADMIN_PASSWORD = 'temple2024';

// ============================================================
// NO MODIFICAR A PARTIR DE ACÁ
// ============================================================
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
