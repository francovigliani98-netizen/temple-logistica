<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin — Temple Brewery Logística</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<link rel="stylesheet" href="css/styles.css">
</head>
<body style="background:var(--bg)">

<!-- LOGIN SECTION -->
<div id="login-section" style="display:none">
  <div class="admin-login">
    <div style="font-size:32px;margin-bottom:16px">🔐</div>
    <h2>Panel de Administración</h2>
    <p>Ingresá la contraseña para acceder</p>
    <input type="password" id="admin-pw" placeholder="Contraseña" onkeydown="if(event.key==='Enter')login()">
    <div id="login-error" style="color:var(--red);font-size:13px;margin-bottom:12px;min-height:18px"></div>
    <button class="btn btn-primary" onclick="login()" style="width:100%">Ingresar</button>
    <div style="margin-top:16px"><a href="index.html" style="font-size:13px;color:var(--text3)">← Volver al dashboard</a></div>
  </div>
</div>

<!-- ADMIN PANEL -->
<div id="admin-panel" style="display:none">
  <div style="background:var(--navy);padding:14px 24px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <span style="color:#fff;font-weight:700;font-size:15px">Temple Brewery</span>
      <span style="color:rgba(255,255,255,0.45);font-size:13px;margin-left:10px">Panel de Admin</span>
    </div>
    <div style="display:flex;gap:12px;align-items:center">
      <a href="index.html" style="color:rgba(255,255,255,0.65);font-size:13px;text-decoration:none">← Ver dashboard</a>
      <button class="btn btn-secondary" onclick="logout()" style="font-size:12px;padding:6px 14px">Cerrar sesión</button>
    </div>
  </div>

  <div class="admin-container">

    <!-- UPLOAD SECTION -->
    <div class="upload-section" style="margin-top:32px">
      <h3>📤 Cargar nuevos datos</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Los pedidos nuevos se agregan a los existentes. Los que ya están se actualizan si cambiaron.</p>

      <div class="upload-row-admin">
        <label class="upload-btn-admin" id="btn-fact">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>Facturación Klozer</span>
          <small id="fact-name">Ningún archivo seleccionado</small>
          <input type="file" id="file-fact-admin" accept=".xlsx,.csv" style="display:none" onchange="loadFile(this,'fact')">
        </label>
        <label class="upload-btn-admin" id="btn-ped">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <span>Reporte de pedidos</span>
          <small id="ped-name">Ningún archivo seleccionado</small>
          <input type="file" id="file-ped-admin" accept=".xlsx,.csv" style="display:none" onchange="loadFile(this,'ped')">
        </label>
      </div>

      <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
      <div id="upload-status" style="display:none"></div>

      <div style="margin-top:16px">
        <button class="btn btn-primary" id="btn-upload" onclick="uploadData()" disabled>
          Subir a la nube
        </button>
      </div>
    </div>

    <!-- HISTORY SECTION -->
    <div class="history-section">
      <h3>📋 Historial de cargas</h3>
      <div id="total-count" style="font-size:13px;color:var(--text2);margin-bottom:16px"></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Fecha y hora</th><th class="num-right">Total pedidos</th><th class="num-right">Nuevos</th><th class="num-right">Actualizados</th></tr></thead>
          <tbody id="history-tbody"><tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text3)">Cargando...</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- DANGER ZONE -->
    <div style="background:var(--surface);border:1px solid #fca5a5;border-radius:var(--radius-lg);padding:24px;margin-bottom:40px">
      <h3 style="font-size:15px;font-weight:600;color:var(--red);margin-bottom:8px">⚠ Zona peligrosa</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Borrar todos los datos de la base. Esta acción no se puede deshacer.</p>
      <button class="btn btn-danger" onclick="clearAllData()">Borrar todos los datos</button>
    </div>

  </div>
</div>

<script src="js/config.js"></script>
<script src="js/admin.js"></script>
</body>
</html>
