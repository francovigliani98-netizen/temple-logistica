// ============================================================
// ADMIN.JS — v4.1
// + Guarda detalle de productos por pedido en pedido_productos
// ============================================================

const TARIFF = {
  'Local - CABA':           [7075,4957,3207,3008,2659,2435,140262,109104],
  'GBA':                    [10613,6881,6132,4932,3762,2996,175329,127287],
  'Centro (capitales)':     [16176,12026,9568,6731,5877,5347,null,null],
  'Centro (interior)':      [21368,15521,11789,6998,6415,5873,null,null],
  'Cuyo (capitales)':       [16176,12026,9568,6731,5877,5347,null,null],
  'Cuyo (interior)':        [21368,15521,11789,6998,6415,5873,null,null],
  'NEA/NOA (capitales)':    [16176,12026,9568,6731,5877,5347,null,null],
  'NEA/NOA (interior)':     [21368,15521,11789,6998,6415,5873,null,null],
  'Patagonia (capitales)':  [24689,15879,11473,7966,7441,7025,null,null],
  'Patagonia (interior)':   [29883,21343,15565,9413,8483,7765,null,null],
  'Santa Cruz y TDF':       [42517,26378,21188,11028,9611,8875,null,null],
};

let factRaw = null, pedRaw = null;

// ---- AUTH ----
function checkAuth() {
  const stored = sessionStorage.getItem('temple_admin');
  if (stored === 'ok') { showPanel(); }
  else { document.getElementById('login-section').style.display='block'; document.getElementById('admin-panel').style.display='none'; }
}
function login() {
  const pw = document.getElementById('admin-pw').value;
  if (pw === ADMIN_PASSWORD) { sessionStorage.setItem('temple_admin','ok'); showPanel(); }
  else { document.getElementById('login-error').textContent='Contraseña incorrecta'; document.getElementById('admin-pw').value=''; }
}
function logout() { sessionStorage.removeItem('temple_admin'); location.reload(); }
function showPanel() {
  document.getElementById('login-section').style.display='none';
  document.getElementById('admin-panel').style.display='block';
  loadUploadHistory();
}

// ---- FILE READING ----
function readXlsx(file, cb) {
  const r = new FileReader();
  r.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'array', cellDates:true});
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
    const normalized = raw.map(row => { const clean={}; for(const k of Object.keys(row)) clean[k.trim()]=row[k]; return clean; });
    cb(normalized);
  };
  r.readAsArrayBuffer(file);
}

function getCol(row, ...candidates) {
  for (const k of candidates) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
    const kLow = k.toLowerCase();
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === kLow && row[rk] !== undefined && row[rk] !== '') return row[rk];
    }
  }
  return '';
}

function loadFile(input, type) {
  if (!input.files[0]) return;
  const name = input.files[0].name;
  readXlsx(input.files[0], data => {
    if (type === 'fact') { factRaw=data; document.getElementById('fact-name').textContent=name; document.getElementById('btn-fact').classList.add('loaded'); }
    else { pedRaw=data; document.getElementById('ped-name').textContent=name; document.getElementById('btn-ped').classList.add('loaded'); }
    checkReadyToUpload();
  });
}
function checkReadyToUpload() { document.getElementById('btn-upload').disabled=!(factRaw&&pedRaw); }

// ---- DATA PROCESSING ----
function parseD(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v)?null:v;
  if (typeof v==='number') { const d=new Date((v-25569)*86400000); return isNaN(d)?null:d; }
  const s=String(v);
  const m=s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  const d=new Date(s); return isNaN(d)?null:d;
}
function getTarifa(region, cajas) {
  const t=TARIFF[region]; if(!t) return null;
  const i=cajas<=1?0:cajas<=3?1:cajas<=6?2:cajas<=10?3:cajas<=20?4:cajas<=30?5:6;
  return t[i];
}
function calcFlete(region, cajas, pallets) {
  if (pallets>=1) { const t=TARIFF[region]; if(t&&t[6]) return t[6]*pallets; }
  const u=getTarifa(region,cajas);
  return u?u*cajas:null;
}

// Normaliza nombres de productos a categorías Temple
function normalizarProducto(nombre) {
  if (!nombre) return null;
  const n = nombre.toUpperCase();
  if (n.includes('CERVEZA')||n.includes('IPA')||n.includes('STOUT')||n.includes('PORTER')||n.includes('ALE')||n.includes('LAGER')||n.includes('RUBIA')||n.includes('NEGRA')) return 'Cerveza';
  if (n.includes('ALTA MONTA')) return 'Alta Montaña 750ml';
  if (n.includes('GIN')&&n.includes('500')) return 'Gin 500ml';
  if (n.includes('GIN')&&n.includes('750')) return 'Gin 750ml';
  if (n.includes('GIN')) return 'Gin 500ml'; // default gin
  if (n.includes('VERMÚ')||n.includes('VERMU')||n.includes('FERIADO')) return 'Vermú 750ml';
  if (n.includes('BARRIL')) return 'Barril';
  if (n.includes('KIT')||n.includes('MUESTRA')||n.includes('VASO')||n.includes('PACK')) return 'Kit/Merchandising';
  return nombre; // mantener nombre original si no matchea
}

function processToRows(factData, pedData) {
  // Construir mapa de pedidos desde reporte de pedidos
  // AHORA también guarda detalle de productos: { pid -> [{producto, cantidad}] }
  const pedMap = {};
  const pedProductos = {}; // pid -> { productoNorm -> cantidad }

  for (const r of pedData) {
    const pid = String(getCol(r,"Pedido","pedido","PEDIDO")); if (!pid) continue;

    if (!pedMap[pid]) {
      pedMap[pid] = {
        valDecl: parseFloat(String(getCol(r,"Valor Declarado","valor_declarado","VALOR DECLARADO","ValorDeclarado")||0).replace(/[^0-9.-]/g,""))||0,
        estado: getCol(r,"Estado","estado","ESTADO")||"",
        fDesp: parseD(getCol(r,"FechaDespacho","fechadespacho","Fecha Despacho","FECHADESPACHO")||""),
        fEntr: parseD(getCol(r,"Fecha Entrega","fecha_entrega","FechaEntrega","FECHA ENTREGA")||""),
        fPrep: parseD(getCol(r,"FechaPreparación","FechaPreparacion","fechapreparacion","Fecha Preparacion")||""),
        localidad: getCol(r,"Localidad","localidad","LOCALIDAD")||"",
        provincia: getCol(r,"Provincia","provincia","PROVINCIA")||"",
        razonSocial: getCol(r,"Razon Social","RazonSocial","razonsocial","Razon_Social")||"",
        productos: '',
      };
      pedProductos[pid] = {};
    }

    // Capturar producto y cantidad por línea
    const prod = getCol(r,"Producto","producto","PRODUCTO")||"";
    const qty  = parseFloat(String(getCol(r,"Cantidad","cantidad","CANTIDAD")||0).replace(/[^0-9.-]/g,""))||0;

    if (prod) {
      // Para el campo texto resumido (compat)
      if (!pedMap[pid].productos.includes(prod))
        pedMap[pid].productos += (pedMap[pid].productos?', ':'')+prod;

      // Para la tabla de detalle — normalizar a categoría Temple
      const norm = normalizarProducto(prod);
      if (norm) pedProductos[pid][norm] = (pedProductos[pid][norm]||0) + qty;
    }
  }

  // Construir rows de pedidos (igual que antes)
  const rows = [];
  for (const f of factData) {
    const pid = String(getCol(f,"Pedido","pedido","PEDIDO"));
    const p = pedMap[pid]||{};
    const cajas = parseInt(getCol(f,"CAJAS","cajas","Cajas")||0)||0;
    const pallets = parseFloat(getCol(f,"Pallets","pallets","PALLETS")||0)||0;
    const total = parseFloat(String(getCol(f,"TOTAL A FACTURAR","Total a Facturar","TOTAL","total")||0).replace(/[^0-9.-]/g,""))||0;
    const valDecl = p.valDecl||0;
    const region = String(getCol(f,"REGION","Region","region","Región","región")||"").trim();
    const fecha = parseD(getCol(f,"Fecha","fecha","FECHA")||"");
    const mes = fecha ? fecha.toLocaleDateString('es-AR',{month:'long',year:'numeric'}) : '';
    const diasKlozer = (p.fDesp&&p.fEntr)?Math.round((p.fEntr-p.fDesp)/(864e5)):null;
    const diasPrep = (p.fPrep&&p.fDesp)?Math.round((new Date(p.fDesp).setHours(0,0,0,0)-new Date(p.fPrep).setHours(0,0,0,0))/864e5):null;
    const pctLog = valDecl>0?Math.round(total/valDecl*1000)/10:null;
    const semaforo = pctLog==null?'':(pctLog<8?'verde':pctLog<15?'amarillo':'rojo');
    const costoAbril = calcFlete(region,cajas,pallets);
    const totalAbril = costoAbril!=null?costoAbril+valDecl*0.012:null;

    rows.push({
      pid, fecha: fecha?fecha.toISOString().split('T')[0]:null,
      mes, dest: getCol(f,"Destinatario","destinatario")||p.razonSocial||"",
      razon_social: p.razonSocial||'', region, cajas, pallets, val_decl: valDecl,
      total, pct_log: pctLog, semaforo, estado: p.estado||'',
      incidencia: ['Devuelto','Eliminado','Entrega Parcial'].includes(p.estado)?'Sí':'No',
      dias_klozer: diasKlozer, dias_prep: diasPrep,
      otif: diasKlozer!=null?(diasKlozer<=1?'Sí':'No'):'',
      costo_abril: costoAbril, total_abril: totalAbril,
      productos: p.productos||'', localidad: p.localidad||'', provincia: p.provincia||'',
      _mes: mes // para join con pedProductos
    });
  }

  // Construir filas para pedido_productos
  const ppRows = [];
  for (const row of rows) {
    const prods = pedProductos[row.pid];
    if (!prods) continue;
    for (const [producto, cantidad] of Object.entries(prods)) {
      if (cantidad > 0) {
        ppRows.push({ pid: row.pid, mes: row.mes, producto, cantidad });
      }
    }
  }

  // Limpiar _mes antes de devolver
  rows.forEach(r => delete r._mes);

  return { rows, ppRows };
}

// ---- UPLOAD TO SUPABASE ----
async function uploadData() {
  if (!factRaw || !pedRaw) return;
  const btn = document.getElementById('btn-upload');
  btn.disabled = true;
  setStatus('info','Procesando archivos...');
  setProgress(10);

  try {
    const { rows, ppRows } = processToRows(factRaw, pedRaw);
    setProgress(25);
    setStatus('info',`${rows.length} pedidos · ${ppRows.length} líneas de producto. Subiendo...`);

    const { data: existing } = await supabaseClient.from('pedidos').select('pid');
    const existingPids = new Set((existing||[]).map(r=>r.pid));
    const newRows = rows.filter(r=>!existingPids.has(r.pid));
    const updateRows = rows.filter(r=>existingPids.has(r.pid));

    setProgress(35);

    // Insertar pedidos nuevos
    if (newRows.length > 0) {
      for (let i=0; i<newRows.length; i+=100) {
        const { error } = await supabaseClient.from('pedidos').insert(newRows.slice(i,i+100));
        if (error) throw error;
        setProgress(35 + Math.round((i/newRows.length)*25));
      }
    }

    // Actualizar pedidos existentes
    if (updateRows.length > 0) {
      for (let i=0; i<updateRows.length; i+=100) {
        const { error } = await supabaseClient.from('pedidos').upsert(updateRows.slice(i,i+100),{onConflict:'pid'});
        if (error) throw error;
      }
    }

    setProgress(65);
    setStatus('info','Pedidos guardados. Actualizando detalle de productos...');

    // Para pedido_productos: borrar los pids afectados y reinsertar
    const pidsEnCarga = [...new Set(ppRows.map(r=>r.pid))];
    if (pidsEnCarga.length > 0) {
      // Borrar en lotes de 50 pids
      for (let i=0; i<pidsEnCarga.length; i+=50) {
        const batch = pidsEnCarga.slice(i,i+50);
        await supabaseClient.from('pedido_productos').delete().in('pid', batch);
      }
      // Insertar nuevos
      for (let i=0; i<ppRows.length; i+=200) {
        const { error } = await supabaseClient.from('pedido_productos').insert(ppRows.slice(i,i+200));
        if (error) throw error;
        setProgress(65 + Math.round((i/ppRows.length)*25));
      }
    }

    setProgress(95);

    await supabaseClient.from('uploads').insert({
      uploaded_at: new Date().toISOString(),
      rows_new: newRows.length,
      rows_updated: updateRows.length,
      total_rows: rows.length,
    });

    setProgress(100);
    setStatus('success',`✓ Listo. ${newRows.length} pedidos nuevos, ${updateRows.length} actualizados, ${ppRows.length} líneas de producto guardadas.`);

    factRaw=null; pedRaw=null;
    document.getElementById('fact-name').textContent='Ningún archivo seleccionado';
    document.getElementById('ped-name').textContent='Ningún archivo seleccionado';
    document.getElementById('btn-fact').classList.remove('loaded');
    document.getElementById('btn-ped').classList.remove('loaded');
    document.getElementById('file-fact-admin').value='';
    document.getElementById('file-ped-admin').value='';
    btn.disabled=true;
    loadUploadHistory();

  } catch(err) {
    setStatus('error','Error: '+(err.message||JSON.stringify(err)));
    setProgress(0);
    btn.disabled=false;
  }
}

async function loadUploadHistory() {
  const { data, error } = await supabaseClient.from('uploads').select('*').order('uploaded_at',{ascending:false}).limit(10);
  if (error||!data) return;
  const tbody = document.getElementById('history-tbody');
  if (!data.length) { tbody.innerHTML='<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text3)">Sin cargas todavía</td></tr>'; return; }
  tbody.innerHTML = data.map(r=>{
    const d = new Date(r.uploaded_at);
    const fecha = d.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    return `<tr><td>${fecha}</td><td class="num-right">${r.total_rows}</td><td class="num-right" style="color:var(--green-dark)">+${r.rows_new}</td><td class="num-right" style="color:var(--amber-dark)">${r.rows_updated} act.</td></tr>`;
  }).join('');
  const { count } = await supabaseClient.from('pedidos').select('*',{count:'exact',head:true});
  document.getElementById('total-count').textContent=count?`${count} pedidos en la base de datos`:'';
}

async function clearAllData() {
  if (!confirm('¿Seguro que querés borrar TODOS los datos? Esta acción no se puede deshacer.')) return;
  await supabaseClient.from('pedido_productos').delete().neq('id',0);
  const { error } = await supabaseClient.from('pedidos').delete().neq('pid','____never____');
  if (!error) {
    await supabaseClient.from('uploads').delete().neq('id',0);
    setStatus('success','Todos los datos fueron eliminados.');
    loadUploadHistory();
  } else {
    setStatus('error','Error al borrar: '+error.message);
  }
}

function setStatus(type,msg){ const el=document.getElementById('upload-status'); el.className='status-msg '+type; el.textContent=msg; el.style.display='block'; }
function setProgress(pct){ document.getElementById('progress-fill').style.width=pct+'%'; }

window.addEventListener('DOMContentLoaded', checkAuth);
