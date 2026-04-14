# Guía de instalación — Temple Brewery Tablero Logístico
## Tiempo estimado: 30-40 minutos (sin experiencia técnica)

---

## PASO 1 — Crear cuenta en Supabase (base de datos)

1. Entrá a https://supabase.com y hacé clic en "Start your project"
2. Registrate con tu email de Google o con email+contraseña
3. Una vez dentro, hacé clic en "New project"
4. Completá:
   - **Name:** temple-logistica
   - **Database Password:** anotá esta contraseña (no la vas a necesitar ahora, pero guardala)
   - **Region:** South America (São Paulo)
5. Hacé clic en "Create new project" y esperá ~2 minutos

### Crear las tablas

6. En el menú izquierdo, hacé clic en **"SQL Editor"**
7. Hacé clic en "New query"
8. Pegá este código completo y hacé clic en **"Run"**:

```sql
-- Tabla principal de pedidos
CREATE TABLE pedidos (
  id bigserial PRIMARY KEY,
  pid text UNIQUE NOT NULL,
  fecha date,
  mes text,
  dest text,
  razon_social text,
  region text,
  cajas integer,
  pallets numeric,
  val_decl numeric,
  total numeric,
  pct_log numeric,
  semaforo text,
  estado text,
  incidencia text,
  dias_klozer integer,
  dias_prep integer,
  otif text,
  costo_abril numeric,
  total_abril numeric,
  productos text,
  localidad text,
  provincia text,
  created_at timestamptz DEFAULT now()
);

-- Tabla de historial de cargas
CREATE TABLE uploads (
  id bigserial PRIMARY KEY,
  uploaded_at timestamptz DEFAULT now(),
  rows_new integer,
  rows_updated integer,
  total_rows integer
);

-- Permisos públicos de lectura (para que todos vean el dashboard)
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública" ON pedidos FOR SELECT USING (true);
CREATE POLICY "Escritura con clave" ON pedidos FOR ALL USING (true);
CREATE POLICY "Lectura pública uploads" ON uploads FOR SELECT USING (true);
CREATE POLICY "Escritura uploads" ON uploads FOR ALL USING (true);
```

9. Debería decir "Success. No rows returned."

### Obtener las claves de conexión

10. En el menú izquierdo, hacé clic en el ícono de engranaje ⚙ → **"Project Settings"**
11. Hacé clic en **"API"**
12. Copiá estos dos valores (los vas a necesitar en el Paso 3):
    - **Project URL** (algo como https://xxxx.supabase.co)
    - **anon public** key (una cadena larga de letras y números)

---

## PASO 2 — Crear cuenta en GitHub

1. Entrá a https://github.com y hacé clic en "Sign up"
2. Completá el registro con tu email
3. Una vez dentro, hacé clic en el **"+"** arriba a la derecha → **"New repository"**
4. Completá:
   - **Repository name:** temple-logistica
   - **Visibility:** Private (recomendado) o Public
5. Hacé clic en **"Create repository"**

### Subir los archivos

6. En la página del repositorio recién creado, hacé clic en **"uploading an existing file"**
7. Arrastrá o seleccioná TODOS los archivos de la carpeta `temple-logistica` que descargaste:
   - `index.html`
   - `admin.html`
   - `css/styles.css`
   - `js/config.js`
   - `js/dashboard.js`
   - `js/admin.js`
   - (Para las subcarpetas css/ y js/, subí cada archivo y GitHub mantiene la estructura)
8. En el campo "Commit changes", escribí: "Primer upload tablero logístico"
9. Hacé clic en **"Commit changes"**

---

## PASO 3 — Configurar las claves de Supabase

Antes de publicar, tenés que poner tus claves en el archivo `js/config.js`:

1. En GitHub, abrí el repositorio y hacé clic en `js/config.js`
2. Hacé clic en el ícono de lápiz ✏ para editar
3. Reemplazá:
   - `'TU_SUPABASE_URL'` → pegá tu Project URL del Paso 1
   - `'TU_SUPABASE_ANON_KEY'` → pegá tu anon key del Paso 1
   - `'temple2024'` → cambiá por la contraseña que quieras para el admin
4. Hacé clic en **"Commit changes"**

Ejemplo de cómo debería quedar:
```javascript
const SUPABASE_URL = 'https://abcdefghij.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const ADMIN_PASSWORD = 'miContraseñaSegura123';
```

---

## PASO 4 — Publicar en Vercel (la URL)

1. Entrá a https://vercel.com y hacé clic en "Sign up"
2. Elegí **"Continue with GitHub"** y autorizá el acceso
3. Una vez dentro, hacé clic en **"Add New Project"**
4. Buscá y seleccioná el repositorio `temple-logistica`
5. Hacé clic en **"Deploy"** (no necesitás cambiar nada más)
6. Esperá ~1 minuto mientras despliega

### ¡Listo! Tu dashboard está en vivo

Vercel te va a dar una URL como:
**`https://temple-logistica.vercel.app`**

Esa es tu URL permanente. Compartila con tu equipo.

---

## PASO 5 — Primera carga de datos

1. Entrá a `https://temple-logistica.vercel.app/admin.html`
2. Ingresá tu contraseña de admin
3. Subí los archivos Excel de Klozer (Facturación + Reporte de pedidos)
4. Hacé clic en "Subir a la nube"
5. ¡Los datos aparecen en el dashboard para todos!

---

## Uso diario

**Para agregar datos nuevos (vos):**
- Entrá a `/admin.html` → subí los Excel → clic en "Subir"
- Los pedidos nuevos se agregan, los existentes se actualizan

**Para ver el dashboard (tu equipo):**
- Entran directo a la URL principal
- Sin contraseña, sin instalar nada

---

## Actualizar la tarifa cuando Klozer cambie precios

1. En GitHub, abrí `js/config.js` o `js/dashboard.js`
2. Buscá el objeto `TARIFF` y modificá los valores
3. Guardá (commit) → Vercel actualiza automáticamente en ~1 minuto

---

## Preguntas frecuentes

**¿Tiene costo?**
No. Supabase (hasta 500MB de datos), GitHub y Vercel tienen planes gratuitos
más que suficientes para este uso.

**¿Qué pasa si me olvido la contraseña de admin?**
Entrá a GitHub → editá `js/config.js` → cambiá `ADMIN_PASSWORD`.

**¿Puedo cambiar la URL?**
Sí. En Vercel podés configurar un dominio propio si tenés uno, o cambiar
el subdominio gratuito en Settings → Domains.

**¿Los datos están seguros?**
Sí. Supabase usa cifrado estándar. La base de datos es privada a tu cuenta.
