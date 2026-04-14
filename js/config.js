// ============================================================
// CONFIGURACIÓN DE SUPABASE
// Reemplazá estos valores con los tuyos al crear el proyecto
// en https://supabase.com (Paso 2 de la guía)
// ============================================================

const SUPABASE_URL = 'https://dtlfusrpcfqwnmyhscdv.supabase.co';        // ej: https://xxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0bGZ1c3JwY2Zxd25teWhzY2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3MTAsImV4cCI6MjA5MTc2NzcxMH0.vSYXG_GNN4KrW09CKLMEfMpoOR4FTsCc_Rm0YPUKGg4'; // clave pública (anon key)

// Contraseña del panel admin — cambiala por la que quieras
const ADMIN_PASSWORD = 'temple2024';

// ============================================================
// NO MODIFICAR A PARTIR DE ACÁ
// ============================================================
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
