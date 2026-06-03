// ============================================================
// DASHBOARD.JS — v4.0
// + Opción 3: deltas vs mes anterior en KPIs
// + Opción 2: panel comparador mes A vs mes B (pestaña nueva)
// + Gráfico incidencia logística vs tiempo
// + Gráfico volumen + costo promedio por zona
// ============================================================

let TARIFF = {
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

let PRODUCTS = {
  'Cerveza':            { price: 13821,  margen: 0.35, litros: 7, key: 'sim-qty-cerveza' },
  'Vermú 750ml':        { price: 52290,  margen: 0.50, litros: 9, key: 'sim-qty-vermu' },
  'Gin 500ml':          { price: 54390,  margen: 0.55, litros: 6, key: 'sim-qty-gin500' },
  'Gin 750ml':          { price: 81585,  margen: 0.55, litros: 9, key: 'sim-qty-gin750' },
  'Alta Montaña 750ml': { price: 122378, margen: 0.60, litros: 9, key: 'sim-qty-alta' },
};

let allRows = [], filteredRows = [], charts = {};
let sortCol = 'fecha', sortDir = 'desc';

// ---- UTILS ----
function peso(n){ if(n==null||isNaN(n))return '-'; return '$'+Math.round(n).toLocaleString('es-AR'); }
function fmtD(s){ if(!s)return ''; try{return new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});}catch{return s;} }
function getTarifa(region,cajas){ const t=TARIFF[region];if(!t)return null; const i=cajas<=1?0:cajas<=3?1:cajas<=6?2:cajas<=10?3:cajas<=20?4:cajas<=30?5:6; return t[i]; }
function calcFlete(region,cajas,pallets){ if(pallets>=1){const t=TARIFF[region];if(t&&t[6])return t[6]*pallets;} const u=getTarifa(region,cajas); return u?u*cajas:null; }
function sortMeses(meses){
  const mo={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12};
  return meses.sort((a,b)=>{
    const pA=a.toLowerCase().split(' '),pB=b.toLowerCase().split(' ');
    const yA=parseInt(pA[pA.length-1])||0,yB=parseInt(pB[pB.length-1])||0;
    if(yA!==yB)return yA-yB;
    return (mo[pA[0]]||0)-(mo[pB[0]]||0);
  });
}

// ---- CALCULA MÉTRICAS DE UN CONJUNTO DE ROWS ----
function calcMetrics(rows){
  const total=rows.reduce((s,r)=>s+(r.total||0),0);
  const totalCajas=rows.reduce((s,r)=>s+(r.cajas||0),0);
  const valid=rows.filter(r=>r.pct_log!=null);
  const avgPct=valid.length?valid.reduce((s,r)=>s+(r.pct_log||0),0)/valid.length:0;
  const otifRows=rows.filter(r=>r.otif!=='');
  const otif=otifRows.length?otifRows.filter(r=>r.otif==='Sí').length/otifRows.length*100:0;
  const rojos=rows.filter(r=>r.semaforo==='rojo').length;
  const inc=rows.filter(r=>r.incidencia==='Sí').length;
  const kRows=rows.filter(r=>r.dias_klozer!=null);
  const diasKlozer=kRows.length?kRows.reduce((s,r)=>s+(r.dias_klozer||0),0)/kRows.length:0;
  const pRows=rows.filter(r=>r.dias_prep!=null);
  const diasPrep=pRows.length?pRows.reduce((s,r)=>s+(r.dias_prep||0),0)/pRows.length:0;
  const regMap={};rows.forEach(r=>{if(r.region)regMap[r.region]=(regMap[r.region]||0)+1;});
  const topRegion=Object.entries(regMap).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
  const pctCABA=rows.length?((regMap['Local - CABA']||0)/rows.length*100):0;
  const facturado=rows.reduce((s,r)=>s+(r.val_decl||0),0);
  const verdes=rows.filter(r=>r.semaforo==='verde').length;
  const pctVerdes=rows.length?verdes/rows.length*100:0;
  const clientes=new Set(rows.map(r=>r.razon_social||r.dest).filter(Boolean)).size;
  const cajasPorPedido=rows.length?totalCajas/rows.length:0;
  return {total,totalCajas,avgPct,otif,rojos,inc,diasKlozer,diasPrep,topRegion,pctCABA,facturado,verdes,pctVerdes,clientes,cajasPorPedido,count:rows.length,promPedido:rows.length?total/rows.length:0,promCaja:totalCajas?total/totalCajas:0};
}

// ---- DATA ----
// Wrapper con timeout para queries de Supabase
function withTimeout(promise, ms=8000){
  return Promise.race([
    promise,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('Timeout de conexión')),ms))
  ]);
}

async function loadData(){
  showLoading(true);
  try{
    // Auth check con timeout
    let session;
    try{
      const res = await withTimeout(supabaseClient.auth.getSession(), 5000);
      session = res.data?.session;
    }catch(e){
      showLoading(false);
      showError('No se pudo verificar la sesión. Recargá la página.');
      return;
    }

    if(!session){ window.location.href='login.html'; return; }

    // Verificar aprobación
    try{
      const{data:access}=await withTimeout(
        supabaseClient.from('user_access').select('approved').eq('email',session.user.email).single(),
        5000
      );
      if(!access||!access.approved){ await supabaseClient.auth.signOut(); window.location.href='login.html'; return; }
    }catch(e){
      showLoading(false);
      showError('Error verificando acceso: '+e.message);
      return;
    }

    // Mostrar email
    const emailEl=document.getElementById('user-email');
    if(emailEl) emailEl.textContent=session.user.email;

    // Cargar datos con timeouts individuales
    try{ await withTimeout(loadConfig(),5000); }catch(e){ console.warn('loadConfig timeout',e); }
    try{ await withTimeout(loadPrices(),5000); }catch(e){ console.warn('loadPrices timeout',e); }
    try{ await withTimeout(loadTarifario(),5000); }catch(e){ console.warn('loadTarifario timeout',e); }
    try{ await withTimeout(loadListaPrecios(),5000); }catch(e){ console.warn('loadListaPrecios timeout',e); }

    const{data,error}=await withTimeout(
      supabaseClient.from('pedidos').select('*').order('fecha',{ascending:true}).limit(2000),
      10000
    );
    if(error) throw error;
    if(!data||!data.length){showLoading(false);showEmptyState();return;}

    allRows=data;

    try{ await withTimeout(loadProductosMix(),5000); }catch(e){ console.warn('loadProductosMix timeout',e); mixData=[]; }

    populateFilters();
    applyGlobalFilter();
    renderSimThresh();
    renderTarifario();
    inicializarSimulador();
    showLoading(false);
  }catch(err){
    showLoading(false);
    showError('Error: '+err.message);
    console.error(err);
  }
}

async function loadPrices(){
  try{
    const{data}=await supabaseClient.from('precios').select('*');
    if(data&&data.length){
      data.forEach(p=>{
        if(PRODUCTS[p.producto]){
          PRODUCTS[p.producto].price=p.precio;
          if(p.margen!=null)PRODUCTS[p.producto].margen=parseFloat(p.margen);
          if(p.litros_caja!=null)PRODUCTS[p.producto].litros=parseFloat(p.litros_caja);
        }
      });
    }
  }catch(e){}
}

async function loadTarifario(){
  try{
    const{data,error}=await supabaseClient.from('tarifario').select('*');
    if(error||!data||!data.length)return;
    const nuevo={};
    data.forEach(r=>{nuevo[r.zona]=[r.p1,r.p2,r.p3,r.p4,r.p5,r.p6,r.p7,r.p8];});
    if(Object.keys(nuevo).length>0)TARIFF=nuevo;
  }catch(e){}
}

// Datos de mix de productos (cargados desde pedido_productos)
let mixData = []; // [{pid, mes, producto, cantidad}]

async function loadProductosMix(){
  try{
    // Supabase corta las respuestas en 1000 filas. Como hay más filas de
    // productos que eso, paginamos con .range() para traerlas todas; si no,
    // los pedidos más recientes quedaban sin detalle de composición.
    const PAGE=1000;
    let todos=[],desde=0;
    for(;;){
      const{data,error}=await supabaseClient
        .from('pedido_productos')
        .select('pid,mes,producto,cantidad')
        .order('pid',{ascending:true})
        .range(desde,desde+PAGE-1);
      if(error){ if(!todos.length){mixData=[];return;} break; }
      if(!data||!data.length) break;
      todos=todos.concat(data);
      if(data.length<PAGE) break;
      desde+=PAGE;
    }
    mixData=todos;
  }catch(e){ mixData=[]; }
}

// Lista de precios para el simulador
let listaPrecios = [];
async function loadListaPrecios(){
  try{
    const{data,error}=await supabaseClient.from('lista_precios').select('*').order('descripcion');
    if(error||!data){ listaPrecios=[]; return; }
    listaPrecios=data;
  }catch(e){ listaPrecios=[]; }
}

// ---- SIMULADOR CON FILAS DINÁMICAS ----
let simRows=[], simRowCounter=0;

function inicializarSimulador(){
  simRows=[];
  simRowCounter=0;
  agregarFilaSim();
}

function agregarFilaSim(){
  simRowCounter++;
  simRows.push({id:simRowCounter,productoId:'',unidades:0,descuento:0});
  renderSimRows();
  calcSim();
}

function eliminarFilaSim(id){
  simRows=simRows.filter(r=>r.id!==id);
  if(simRows.length===0) agregarFilaSim();
  else{ renderSimRows(); calcSim(); }
}

// Mapea el texto del autocompletado a un producto del catálogo (por descripción).
function seleccionarProductoSim(id,valor){
  const v=String(valor||'').trim().toLowerCase();
  let prod=null;
  if(v){
    prod=listaPrecios.find(p=>String(p.descripcion||'').trim().toLowerCase()===v);
    if(!prod){ // si el texto identifica un único producto, lo tomamos igual
      const m=listaPrecios.filter(p=>String(p.descripcion||'').toLowerCase().includes(v));
      if(m.length===1) prod=m[0];
    }
  }
  actualizarFilaSim(id,'productoId',prod?String(prod.id):'');
}

function actualizarFilaSim(id,campo,valor){
  const fila=simRows.find(r=>r.id===id);
  if(!fila) return;
  if(campo==='productoId') fila.productoId=valor;
  else if(campo==='unidades') fila.unidades=parseInt(valor)||0;
  else if(campo==='descuento') fila.descuento=Math.max(0,Math.min(100,parseFloat(valor)||0));
  if(campo==='productoId') renderSimRows();
  calcSim();
}

function renderSimRows(){
  const tbody=document.getElementById('sim-rows-tbody');
  if(!tbody) return;
  // Autocompletado: poblamos el datalist compartido con los productos del catálogo.
  const escAttr=s=>String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const dl=document.getElementById('sim-prod-datalist');
  if(dl) dl.innerHTML=listaPrecios.map(p=>`<option value="${escAttr(p.descripcion)}"></option>`).join('');
  const sinProd=listaPrecios.length===0;

  tbody.innerHTML=simRows.map(r=>{
    const prod=listaPrecios.find(p=>String(p.id)===String(r.productoId));
    const precioU=prod?parseFloat(prod.precio_unidad):0;
    const subtotalLista=precioU*r.unidades;
    const subtotalFinal=subtotalLista*(1-r.descuento/100);
    const ahorro=subtotalLista-subtotalFinal;
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 6px">
        <input list="sim-prod-datalist" value="${prod?escAttr(prod.descripcion):''}" placeholder="${sinProd?'Sin productos — cargar desde admin':'Escribí el producto…'}" ${sinProd?'disabled':''}
          onchange="seleccionarProductoSim(${r.id},this.value)"
          style="width:100%;padding:7px 8px;border:1px solid var(--border2);border-radius:var(--radius);font-size:12px;background:var(--surface);color:var(--text);outline:none;box-sizing:border-box">
        ${prod?`<div style="font-size:10px;color:var(--text3);margin-top:2px">$${Math.round(precioU).toLocaleString('es-AR')}/u · ${prod.unidades_por_bulto} u/bulto</div>`:''}
      </td>
      <td style="padding:8px 6px;text-align:center">
        <input type="number" min="0" value="${r.unidades||''}" placeholder="0"
          oninput="actualizarFilaSim(${r.id},'unidades',this.value)"
          style="width:75px;padding:7px 8px;border:1px solid var(--border2);border-radius:var(--radius);font-size:13px;text-align:center;outline:none;box-sizing:border-box">
      </td>
      <td style="padding:8px 6px;text-align:center">
        <div style="display:flex;align-items:center;gap:4px;justify-content:center">
          <input type="number" min="0" max="100" value="${r.descuento||''}" placeholder="0"
            oninput="actualizarFilaSim(${r.id},'descuento',this.value)"
            style="width:60px;padding:7px 8px;border:1px solid var(--border2);border-radius:var(--radius);font-size:13px;text-align:center;outline:none;box-sizing:border-box">
          <span style="font-size:12px;color:var(--text3)">%</span>
        </div>
      </td>
      <td style="padding:8px 6px;text-align:right;font-size:13px;font-weight:600">
        ${subtotalFinal>0?'$'+Math.round(subtotalFinal).toLocaleString('es-AR'):'—'}
        ${ahorro>0?`<div style="font-size:10px;color:var(--red);font-weight:400">-$${Math.round(ahorro).toLocaleString('es-AR')}</div>`:''}
      </td>
      <td style="padding:8px 6px;text-align:center">
        <button onclick="eliminarFilaSim(${r.id})"
          style="background:transparent;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:4px 8px;border-radius:4px"
          onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--text3)'">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function showLoading(show){document.getElementById('loading-overlay').classList.toggle('hidden',!show);}
function showEmptyState(){document.getElementById('empty-state').style.display='flex';document.getElementById('page-dashboard').style.display='none';}
function showError(msg){const el=document.getElementById('error-banner');if(el){el.textContent=msg;el.style.display='block';}}

function populateFilters(){
  const mesesRaw=[...new Set(allRows.map(r=>r.mes).filter(Boolean))];
  const meses=sortMeses(mesesRaw);
  const opts='<option value="">Todos los meses</option>'+meses.map(m=>`<option>${m}</option>`).join('');
  document.getElementById('filter-mes').innerHTML=opts;
  // Comparador: llenar selectores mes A y B
  const cmpOpts='<option value="">Seleccionar...</option>'+meses.map(m=>`<option>${m}</option>`).join('');
  const selA=document.getElementById('cmp-mes-a');
  const selB=document.getElementById('cmp-mes-b');
  if(selA)selA.innerHTML=cmpOpts;
  if(selB)selB.innerHTML=cmpOpts;
  // Pre-seleccionar los dos últimos meses si hay al menos 2
  if(meses.length>=2&&selA&&selB){selA.value=meses[meses.length-2];selB.value=meses[meses.length-1];}
  const regs=[...new Set(allRows.map(r=>r.region).filter(Boolean))].sort();
  const fReg=document.getElementById('f-region');
  if(fReg)fReg.innerHTML='<option value="">Todas las regiones</option>'+regs.map(r=>`<option>${r}</option>`).join('');
  const fechas=allRows.map(r=>r.fecha).filter(Boolean).sort();
  if(fechas.length){
    const desde=fmtD(fechas[0]),hasta=fmtD(fechas[fechas.length-1]);
    document.getElementById('period-chip').textContent=desde===hasta?desde:`${desde} — ${hasta}`;
  }
  const chip=document.getElementById('total-pedidos-chip');
  if(chip)chip.textContent=allRows.length+' pedidos';
}

function applyGlobalFilter(){
  const mes=document.getElementById('filter-mes').value;
  filteredRows=mes?allRows.filter(r=>r.mes===mes):allRows;
  renderAll();
}

function renderAll(){
  renderKPIs();renderChartsMain();renderChartsCostos();
  renderChartsClientes();renderChartsServicio();renderTable();renderThresholds();
  renderComparador();
}

// ---- OPCIÓN 3: DELTAS EN KPIs ----
function getDelta(curr,prev,higherIsBetter=false){
  if(prev==null||prev===0)return null;
  const pct=(curr-prev)/Math.abs(prev)*100;
  const improved=higherIsBetter?(pct>0):(pct<0);
  const sign=pct>0?'+':'';
  return{pct,text:`${sign}${pct.toFixed(1)}%`,improved,neutral:Math.abs(pct)<0.5};
}

function deltaChip(delta,unit=''){
  if(!delta||delta.neutral)return `<span class="kpi-delta neutral">—</span>`;
  const cls=delta.improved?'green':'red';
  const arrow=delta.pct>0?'↑':'↓';
  return `<span class="kpi-delta ${cls}">${arrow} ${delta.text} vs mes ant.</span>`;
}

function renderKPIs(){
  const rows=filteredRows;
  const mes=document.getElementById('filter-mes').value;
  let prevRows=null,mesAnt='';
  if(mes){
    const mesesDisp=sortMeses([...new Set(allRows.map(r=>r.mes).filter(Boolean))]);
    const idx=mesesDisp.indexOf(mes);
    if(idx>0){prevRows=allRows.filter(r=>r.mes===mesesDisp[idx-1]);mesAnt=mesesDisp[idx-1];}
  }
  const m=calcMetrics(rows);
  const p=prevRows?calcMetrics(prevRows):null;

  const dCount=p?getDelta(m.count,p.count,true):null;
  const dTotal=p?getDelta(m.total,p.total,false):null;
  const dPct=p?getDelta(m.avgPct,p.avgPct,false):null;
  const dOtif=p?getDelta(m.otif,p.otif,true):null;
  const dCpC=p&&p.totalCajas?getDelta(m.total/m.totalCajas,p.total/p.totalCajas,false):null;

  const cpC=m.totalCajas?m.total/m.totalCajas:0;

  document.getElementById('kpi-grid').innerHTML=`
    <div class="kpi-card accent">
      <div class="label">Pedidos del mes</div>
      <div class="value">${m.count}</div>
      <div class="sub">${m.totalCajas} cajas totales</div>
      ${deltaChip(dCount,true)}
    </div>
    <div class="kpi-card accent">
      <div class="label">Gasto total</div>
      <div class="value">${peso(m.total)}</div>
      <div class="sub">prom. ${peso(m.promPedido)}/pedido</div>
      ${deltaChip(dTotal)}
    </div>
    <div class="kpi-card accent-${m.avgPct<8?'green':m.avgPct<15?'amber':'red'}">
      <div class="label">% logístico prom.</div>
      <div class="value" style="color:var(--${m.avgPct<8?'green':m.avgPct<15?'amber':'red'})">${m.avgPct.toFixed(1)}%</div>
      <div class="sub">s/ valor mercadería</div>
      ${deltaChip(dPct)}
    </div>
    <div class="kpi-card accent-${m.otif>=85?'green':'amber'}">
      <div class="label">OTIF Klozer</div>
      <div class="value" style="color:var(--${m.otif>=85?'green':'amber'})">${m.otif.toFixed(1)}%</div>
      <div class="sub">Meta &gt;85%</div>
      ${deltaChip(dOtif,true)}
    </div>
    <div class="kpi-card">
      <div class="label">Costo por caja</div>
      <div class="value">${cpC?peso(cpC):'-'}</div>
      <div class="sub">promedio del período</div>
      ${deltaChip(dCpC)}
    </div>`;

  // Renderizar alertas y top destinos
  renderAlertas(m,p,mes,mesAnt);
  renderTopDestinos(rows);
}

// ---- ALERTAS INTELIGENTES ----
function renderAlertas(m,p,mes,mesAnt){
  const cont=document.getElementById('alertas-cont');
  if(!cont) return;
  const alertas=[];

  // 1. % logístico subió
  if(p && m.avgPct - p.avgPct >= 1){
    const diff=(m.avgPct-p.avgPct).toFixed(1);
    alertas.push({
      tipo:'red',
      icon:'📈',
      titulo:`% logístico subió ${diff} puntos`,
      detalle:`De ${p.avgPct.toFixed(1)}% en ${mesAnt} a ${m.avgPct.toFixed(1)}% este mes. Revisar mix de productos o tamaño promedio de pedido.`
    });
  } else if(p && p.avgPct - m.avgPct >= 1){
    const diff=(p.avgPct-m.avgPct).toFixed(1);
    alertas.push({
      tipo:'green',
      icon:'📉',
      titulo:`% logístico bajó ${diff} puntos`,
      detalle:`Mejora vs ${mesAnt}. De ${p.avgPct.toFixed(1)}% a ${m.avgPct.toFixed(1)}%.`
    });
  }

  // 2. Pedidos rojos aumentaron
  if(p && m.rojos - p.rojos >= 3){
    alertas.push({
      tipo:'red',
      icon:'🚨',
      titulo:`${m.rojos} pedidos en zona roja este mes`,
      detalle:`+${m.rojos-p.rojos} más que el mes anterior. Pedidos con &gt;15% logístico.`
    });
  } else if(m.rojos > 0 && !p){
    alertas.push({
      tipo:'amber',
      icon:'⚠️',
      titulo:`${m.rojos} pedidos en zona roja`,
      detalle:`${(m.rojos/m.count*100).toFixed(0)}% del total con &gt;15% logístico.`
    });
  }

  // 3. OTIF cayó debajo de meta
  if(m.otif > 0 && m.otif < 85){
    const diff=p&&p.otif?` (vs ${p.otif.toFixed(1)}% en ${mesAnt})`:'';
    alertas.push({
      tipo:'red',
      icon:'⏰',
      titulo:`OTIF cayó a ${m.otif.toFixed(1)}%`,
      detalle:`Por debajo de la meta de 85%${diff}. Revisar tiempos de entrega de Klozer.`
    });
  }

  // 4. Cambio en zona dominante
  if(p && m.pctCABA && p.pctCABA){
    const diffCABA=m.pctCABA-p.pctCABA;
    if(Math.abs(diffCABA) >= 5){
      const dir=diffCABA>0?'subió':'bajó';
      alertas.push({
        tipo:'amber',
        icon:'🗺️',
        titulo:`Mix CABA ${dir} ${Math.abs(diffCABA).toFixed(0)} puntos`,
        detalle:`Pedidos en CABA representan ${m.pctCABA.toFixed(0)}% del total (vs ${p.pctCABA.toFixed(0)}% en ${mesAnt}).`
      });
    }
  }

  // 5. Incidencias nuevas
  if(m.inc > 0){
    const diff=p?` (vs ${p.inc} en ${mesAnt})`:'';
    alertas.push({
      tipo:m.inc>=5?'red':'amber',
      icon:'❌',
      titulo:`${m.inc} incidencias este mes`,
      detalle:`Pedidos devueltos, eliminados o con entrega parcial${diff}.`
    });
  }

  // 6. Costo por caja
  if(p && p.totalCajas && m.totalCajas){
    const cpC_m=m.total/m.totalCajas;
    const cpC_p=p.total/p.totalCajas;
    const variacion=(cpC_m-cpC_p)/cpC_p*100;
    if(variacion >= 5){
      alertas.push({
        tipo:'amber',
        icon:'💸',
        titulo:`Costo por caja subió ${variacion.toFixed(0)}%`,
        detalle:`De ${peso(cpC_p)}/caja en ${mesAnt} a ${peso(cpC_m)}/caja este mes.`
      });
    }
  }

  // 7. Clientes recurrentes en zona roja
  const rojosClientes={};
  filteredRows.filter(r=>r.semaforo==='rojo'&&(r.razon_social||r.dest)).forEach(r=>{
    const k=r.razon_social||r.dest;
    rojosClientes[k]=(rojosClientes[k]||0)+1;
  });
  const clientesRojos=Object.entries(rojosClientes).filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]);
  if(clientesRojos.length>0){
    const top3=clientesRojos.slice(0,3).map(([c,n])=>`<strong>${c}</strong> (${n} pedidos)`).join(', ');
    alertas.push({
      tipo:'red',
      icon:'🔁',
      titulo:`${clientesRojos.length} cliente${clientesRojos.length>1?'s':''} con pedidos rojos recurrentes`,
      detalle:`${top3}. Estos clientes tienen múltiples envíos con más del 15% logístico. Revisar condiciones de venta.`
    });
  }

  // 8. Pedido individual de alto impacto
  if(m.total>0){
    const topPedido=filteredRows.filter(r=>r.total).sort((a,b)=>(b.total||0)-(a.total||0))[0];
    if(topPedido&&topPedido.total/m.total>0.10){
      const pct=((topPedido.total/m.total)*100).toFixed(0);
      alertas.push({
        tipo:'amber',
        icon:'🎯',
        titulo:`Pedido ${topPedido.pid} concentra el ${pct}% del gasto`,
        detalle:`${topPedido.razon_social||topPedido.dest||''} · ${topPedido.region||''} · ${peso(topPedido.total)}. Un solo pedido tiene alto impacto en el total del período.`
      });
    }
  }

  if(alertas.length===0){
    cont.innerHTML=`<div style="padding:16px;background:rgba(22,163,74,0.05);border:1px solid rgba(22,163,74,0.2);border-radius:var(--radius);color:var(--green);font-size:13px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">✅</span>
      <span>${mes?'Mes sin alertas — operación bajo control.':'Seleccioná un mes específico para ver alertas comparativas.'}</span>
    </div>`;
    return;
  }

  cont.innerHTML=alertas.slice(0,6).map(a=>{
    const colorMap={red:'#dc2626',amber:'#d97706',green:'#16a34a'};
    const bgMap={red:'rgba(220,38,38,0.05)',amber:'rgba(217,119,6,0.05)',green:'rgba(22,163,74,0.05)'};
    const c=colorMap[a.tipo];
    return `<div style="padding:12px 14px;background:${bgMap[a.tipo]};border-left:3px solid ${c};border-radius:6px;display:flex;gap:12px;align-items:flex-start">
      <div style="font-size:20px;line-height:1">${a.icon}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:${c};margin-bottom:2px">${a.titulo}</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.4">${a.detalle}</div>
      </div>
    </div>`;
  }).join('');
}

// ---- TOP 5 DESTINOS ----
function renderTopDestinos(rows){
  const tbody=document.getElementById('top-destinos-tbody');
  if(!tbody) return;
  const regMap={};
  rows.forEach(r=>{
    if(!r.region) return;
    if(!regMap[r.region]) regMap[r.region]={pedidos:0,gasto:0,cajas:0};
    regMap[r.region].pedidos++;
    regMap[r.region].gasto+=(r.total||0);
    regMap[r.region].cajas+=(r.cajas||0);
  });
  const top=Object.entries(regMap).sort((a,b)=>b[1].pedidos-a[1].pedidos).slice(0,5);
  const totalPedidos=rows.length||1;
  if(top.length===0){tbody.innerHTML='<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text3);font-size:13px">Sin datos</td></tr>';return;}
  tbody.innerHTML=top.map(([region,d],i)=>{
    const pct=(d.pedidos/totalPedidos*100).toFixed(0);
    return `<tr>
      <td style="padding:10px 12px;font-size:13px"><strong>${i+1}.</strong> ${region}</td>
      <td class="num-right" style="padding:10px 12px;font-size:13px"><strong>${d.pedidos}</strong> <span style="color:var(--text3);font-size:11px">(${pct}%)</span></td>
      <td class="num-right" style="padding:10px 12px;font-size:13px">${d.cajas}</td>
      <td class="num-right" style="padding:10px 12px;font-size:13px;font-weight:600">${peso(d.gasto)}</td>
    </tr>`;
  }).join('');
}

// ---- CHARTS ----
function dc(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
function mkChart(id,config){dc(id);const el=document.getElementById(id);if(!el)return;charts[id]=new Chart(el,config);}
const COLORS={blue:'#2563eb',green:'#16a34a',amber:'#d97706',red:'#dc2626',teal:'#0d9488',purple:'#7c3aed',navy:'#1e3a5f',gray:'#64748b',greenL:'rgba(22,163,74,0.1)',redL:'rgba(220,38,38,0.1)'};
const gridC='rgba(0,0,0,0.05)',textC='#94a3b8';

function renderChartsMain(){
  const rows=filteredRows;

  // ---- GRÁFICO HERO: Gasto mensual + % logístico (combo) ----
  const mesMapGasto={},mesMapPct={};
  rows.forEach(r=>{
    if(!r.mes) return;
    mesMapGasto[r.mes]=(mesMapGasto[r.mes]||0)+(r.total||0);
    if(r.pct_log!=null){
      if(!mesMapPct[r.mes]) mesMapPct[r.mes]={sum:0,cnt:0};
      mesMapPct[r.mes].sum+=r.pct_log;
      mesMapPct[r.mes].cnt++;
    }
  });
  const mL=sortMeses(Object.keys(mesMapGasto));
  const avgPctMes=mL.map(m=>mesMapPct[m]?Math.round(mesMapPct[m].sum/mesMapPct[m].cnt*10)/10:0);

  mkChart('c-hero',{
    type:'bar',
    data:{
      labels:mL,
      datasets:[
        {type:'bar',label:'Gasto total',data:mL.map(m=>Math.round(mesMapGasto[m]||0)),backgroundColor:COLORS.blue,borderRadius:6,borderSkipped:false,yAxisID:'y-gasto',order:2},
        {type:'line',label:'% logístico prom.',data:avgPctMes,borderColor:COLORS.amber,borderWidth:3,pointRadius:7,pointBackgroundColor:COLORS.amber,pointBorderColor:'#fff',pointBorderWidth:2.5,tension:0.2,fill:false,yAxisID:'y-pct',order:1}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'bottom',labels:{color:textC,font:{size:12},boxWidth:14,padding:14}},
        tooltip:{callbacks:{
          label:c=>c.dataset.label==='Gasto total'?`Gasto: $${Math.round(c.raw).toLocaleString('es-AR')}`:`% logístico: ${c.raw}%`
        }}
      },
      scales:{
        x:{grid:{color:gridC},ticks:{color:textC,font:{size:12}}},
        'y-gasto':{type:'linear',position:'left',grid:{color:gridC},ticks:{color:COLORS.blue,font:{size:11},callback:v=>'$'+Math.round(v/1000)+'k'},title:{display:true,text:'Gasto',color:COLORS.blue,font:{size:11}}},
        'y-pct':{type:'linear',position:'right',grid:{display:false},ticks:{color:COLORS.amber,font:{size:11},callback:v=>v+'%'},title:{display:true,text:'% logístico',color:COLORS.amber,font:{size:11}},min:0}
      }
    }
  });

  // ---- SEMÁFORO ----
  const v=rows.filter(r=>r.semaforo==='verde').length;
  const am=rows.filter(r=>r.semaforo==='amarillo').length;
  const ro=rows.filter(r=>r.semaforo==='rojo').length;
  mkChart('c-semaforo',{
    type:'doughnut',
    data:{labels:['Verde (<8%)','Amarillo (8-15%)','Rojo (>15%)'],datasets:[{data:[v,am,ro],backgroundColor:[COLORS.green,COLORS.amber,COLORS.red],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',
      plugins:{legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12,padding:10}},tooltip:{callbacks:{label:c=>`${c.label}: ${c.raw} pedidos`}}}}
  });
}

function renderChartsCostos(){
  const rows=filteredRows;
  // % por producto
  const prodKeywords={'Cerveza':['CERVEZA','IPA','STOUT','PORTER','ALE','LAGER'],'Gin':['GIN','BOSQUE','ALTA MONTA'],'Vermú':['VERMÚ','VERMU','FERIADO'],'Barril':['BARRIL']};
  const prodPct={};
  // ---- PARETO: TOP 8 PRODUCTOS POR VOLUMEN Y GASTO ----
  const paretoVolMap={};
  mixData.forEach(r=>{
    if(!r.producto) return;
    paretoVolMap[r.producto]=(paretoVolMap[r.producto]||0)+(parseFloat(r.cantidad)||0);
  });

  const paretoGastoMap={};
  const pedidoTotales={};
  rows.forEach(r=>{if(r.pid&&r.total)pedidoTotales[r.pid]=r.total;});
  const pidProds={};
  mixData.forEach(r=>{
    if(!r.pid||!r.producto) return;
    if(!pidProds[r.pid]) pidProds[r.pid]=[];
    pidProds[r.pid].push({producto:r.producto,cantidad:parseFloat(r.cantidad)||0});
  });
  Object.entries(pidProds).forEach(([pid,prods])=>{
    const total=pedidoTotales[pid];
    if(!total) return;
    const totalCant=prods.reduce((s,p)=>s+p.cantidad,0);
    if(!totalCant) return;
    prods.forEach(p=>{
      const proporcion=p.cantidad/totalCant;
      paretoGastoMap[p.producto]=(paretoGastoMap[p.producto]||0)+(total*proporcion);
    });
  });

  // Función para construir top 8 + Otros
  function topPareto(map){
    const sorted=Object.keys(map).filter(p=>map[p]>0).sort((a,b)=>map[b]-map[a]);
    const top8=sorted.slice(0,8);
    const otros=sorted.slice(8);
    const total=Object.values(map).reduce((s,v)=>s+v,0);
    const labels=top8.map(p=>p.length>28?p.substring(0,26)+'…':p);
    const values=top8.map(p=>Math.round(map[p]));
    if(otros.length>0){
      const sumOtros=Math.round(otros.reduce((s,p)=>s+map[p],0));
      labels.push(`Otros (${otros.length} prod.)`);
      values.push(sumOtros);
    }
    // Calcular % acumulado solo sobre los top 8 (no incluir "Otros")
    let acc=0;
    const acumPct=values.map((v,i)=>{
      if(i===values.length-1&&otros.length>0) return null; // No mostrar % en "Otros"
      acc+=v;
      return Math.round(acc/total*100);
    });
    // Cuántos top productos cubren el 80%
    let prod80=0,accT=0;
    for(let i=0;i<top8.length;i++){accT+=values[i];if(accT/total>=0.8){prod80=i+1;break;}}
    return {labels,values,acumPct,prod80};
  }

  const pVol=topPareto(paretoVolMap);
  const pGasto=topPareto(paretoGastoMap);

  if(pVol.values.length>0){
    // Colorear: barras top hasta llegar al 80% más oscuras, el resto más claras
    const colorsVol=pVol.values.map((_,i)=>{
      if(i===pVol.labels.length-1&&pVol.labels[i].startsWith('Otros')) return 'rgba(148,163,184,0.6)';
      return i<pVol.prod80?'rgba(37,99,235,0.95)':'rgba(37,99,235,0.5)';
    });
    const colorsGasto=pGasto.values.map((_,i)=>{
      if(i===pGasto.labels.length-1&&pGasto.labels[i].startsWith('Otros')) return 'rgba(148,163,184,0.6)';
      return i<pGasto.prod80?'rgba(217,119,6,0.95)':'rgba(217,119,6,0.5)';
    });

    mkChart('c-pareto-vol',{
      type:'bar',
      data:{labels:pVol.labels,datasets:[
        {label:'Cajas',data:pVol.values,backgroundColor:colorsVol,borderRadius:4,borderSkipped:false}
      ]},
      options:{
        indexAxis:'y',
        responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{
            label:c=>{
              const v=c.raw;
              const pct=pVol.acumPct[c.dataIndex];
              return pct!=null?`${v.toLocaleString('es-AR')} cajas · ${pct}% acumulado`:`${v.toLocaleString('es-AR')} cajas`;
            }
          }}
        },
        scales:{
          x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}},title:{display:true,text:'Cajas',color:textC,font:{size:11}}},
          y:{grid:{display:false},ticks:{color:textC,font:{size:12},font:{weight:'500'}}}
        }
      }
    });

    mkChart('c-pareto-gasto',{
      type:'bar',
      data:{labels:pGasto.labels,datasets:[
        {label:'Gasto',data:pGasto.values,backgroundColor:colorsGasto,borderRadius:4,borderSkipped:false}
      ]},
      options:{
        indexAxis:'y',
        responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{
            label:c=>{
              const v=c.raw;
              const pct=pGasto.acumPct[c.dataIndex];
              return pct!=null?`$${v.toLocaleString('es-AR')} · ${pct}% acumulado`:`$${v.toLocaleString('es-AR')}`;
            }
          }}
        },
        scales:{
          x:{grid:{color:gridC},ticks:{color:textC,font:{size:11},callback:v=>'$'+Math.round(v/1000)+'k'},title:{display:true,text:'Gasto logístico',color:textC,font:{size:11}}},
          y:{grid:{display:false},ticks:{color:textC,font:{size:12},font:{weight:'500'}}}
        }
      }
    });

    const insightEl=document.getElementById('pareto-insight');
    if(insightEl) insightEl.innerHTML=`
      <span style="margin-right:20px">📦 <strong>${pVol.prod80} producto${pVol.prod80>1?'s':''}</strong> generan el 80% del volumen</span>
      <span>💸 <strong>${pGasto.prod80} producto${pGasto.prod80>1?'s':''}</strong> generan el 80% del gasto logístico</span>
    `;
  }

  // ---- GASTO POR REGIÓN (movido de Resumen) ----
  const regMap={};rows.forEach(r=>{if(r.region)regMap[r.region]=(regMap[r.region]||0)+(r.total||0);});
  const rL=Object.keys(regMap).sort((a,b)=>regMap[b]-regMap[a]).slice(0,8);
  mkChart('c-region',{type:'bar',data:{labels:rL,datasets:[{data:rL.map(r=>Math.round(regMap[r])),backgroundColor:COLORS.teal,borderRadius:4,borderSkipped:false}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'$'+Math.round(c.raw).toLocaleString('es-AR')}}},
      scales:{x:{grid:{color:gridC},ticks:{color:textC,font:{size:10},callback:v=>'$'+Math.round(v/1000)+'k'}},y:{grid:{display:false},ticks:{color:textC,font:{size:10}}}}}});

  // ---- % LOGÍSTICO POR TAMAÑO (movido de Resumen) ----
  const ranges=[[1,1],[2,3],[4,6],[7,10],[11,20],[21,30],[31,999]];
  const rngLabels=['1','2-3','4-6','7-10','11-20','21-30','31+'];
  const rngAvg=ranges.map(([lo,hi])=>{const r2=rows.filter(r=>r.cajas>=lo&&r.cajas<=hi&&r.pct_log!=null);return r2.length?Math.round(r2.reduce((s,r)=>s+(r.pct_log||0),0)/r2.length*10)/10:0;});
  mkChart('c-cajas',{type:'line',data:{labels:rngLabels,datasets:[
    {data:rngAvg,borderColor:COLORS.red,backgroundColor:COLORS.redL,fill:true,tension:0.3,pointRadius:5,pointBackgroundColor:COLORS.red,label:'% logístico'},
    {data:rngAvg.map(()=>15),borderColor:'rgba(220,38,38,0.4)',borderDash:[5,5],pointRadius:0,fill:false,label:'Límite 15%'},
    {data:rngAvg.map(()=>8),borderColor:'rgba(22,163,74,0.4)',borderDash:[5,5],pointRadius:0,fill:false,label:'Límite 8%'}
  ]},options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw}%`}}},
    scales:{x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}}},y:{grid:{color:gridC},ticks:{color:textC,font:{size:11},callback:v=>v+'%'},min:0}}}});

  // ---- MIX DE PRODUCTOS POR MES (con categorías + toggle) ----
  // Función para categorizar productos
  function categorizarProducto(nombre){
    if(!nombre) return 'Otros';
    const n=nombre.toUpperCase();
    if(n==='CERVEZA') return 'Cerveza';
    if(n==='GIN 500ML'||n==='GIN 750ML'||n.includes('ALTA MONTA')||n.includes('BOSQUE NATIVO')) return 'Gin propio';
    if(n.includes('VERM')||n.includes('FERIADO')) return 'Vermú';
    if(n.includes('LA LINDA')||n.includes('LUIGI BOSCA')) return 'Vinos';
    if(n.includes('FERNET')||n.includes('RED BULL')) return 'Otras bebidas';
    if(n.includes('KIT')||n.includes('MERCHANDISING')||n.includes('CAJA PRESENT')||n.includes('CARRO')||n.includes('RACK')||n.includes('VASO')) return 'Merchandising';
    return 'Otros';
  }

  // SIEMPRE mostrar todos los meses (ignora filtro global)
  const mixDataFull=mixData;
  const mixModo=(document.getElementById('mix-modo')?.value)||'categoria';
  const mixProdFiltro=(document.getElementById('mix-prod-filtro')?.value)||'';

  // Agrupar: mes → key → cajas
  // key es categoría o producto según modo
  const mixMap={};
  mixDataFull.forEach(r=>{
    if(!r.mes||!r.producto) return;
    const key=mixModo==='categoria'?categorizarProducto(r.producto):r.producto;
    if(!mixMap[r.mes]) mixMap[r.mes]={};
    if(!mixMap[r.mes][key]) mixMap[r.mes][key]=0;
    mixMap[r.mes][key]+=(parseFloat(r.cantidad)||0);
  });
  const mixMeses=sortMeses(Object.keys(mixMap));

  // Calcular totales por key para ordenar
  const keyTotals={};
  mixDataFull.forEach(r=>{
    if(!r.producto) return;
    const key=mixModo==='categoria'?categorizarProducto(r.producto):r.producto;
    keyTotals[key]=(keyTotals[key]||0)+(parseFloat(r.cantidad)||0);
  });
  const mixKeys=Object.keys(keyTotals).sort((a,b)=>keyTotals[b]-keyTotals[a]);

  // Llenar selector de producto (siempre productos individuales, no categorías)
  const todosProds=[...new Set(mixDataFull.map(r=>r.producto).filter(Boolean))].sort();
  const selProd=document.getElementById('mix-prod-filtro');
  if(selProd && selProd.options.length<=1){
    todosProds.forEach(p=>{
      const o=document.createElement('option');
      o.value=p;o.textContent=p;
      selProd.appendChild(o);
    });
    if(mixProdFiltro) selProd.value=mixProdFiltro;
  }

  // Paleta de colores claros y distinguibles
  const mixColors={
    'Cerveza':'#f59e0b',          // ámbar
    'Gin propio':'#2563eb',       // azul
    'Vermú':'#dc2626',            // rojo
    'Vinos':'#7c3aed',            // violeta
    'Otras bebidas':'#0d9488',    // teal
    'Merchandising':'#64748b',    // gris
    'Otros':'#94a3b8'
  };
  const paletaProd=['#2563eb','#0d9488','#f59e0b','#7c3aed','#dc2626','#16a34a','#1e3a5f','#64748b','#06b6d4','#8b5cf6','#ec4899','#84cc16'];

  if(mixMeses.length>0 && mixKeys.length>0){
    let datasets;
    if(mixProdFiltro){
      // Modo línea: evolución de un producto puntual
      datasets=[{
        type:'line',label:mixProdFiltro,
        data:mixMeses.map(m=>{
          // Buscar ese producto puntual en mixDataFull para ese mes
          const total=mixDataFull.filter(r=>r.mes===m && r.producto===mixProdFiltro)
            .reduce((s,r)=>s+(parseFloat(r.cantidad)||0),0);
          return Math.round(total);
        }),
        borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,0.1)',fill:true,tension:0.3,
        pointRadius:6,pointBackgroundColor:'#2563eb',pointBorderColor:'#fff',pointBorderWidth:2,borderWidth:2.5
      }];
    }else{
      // Modo barras apiladas
      datasets=mixKeys.map((key,i)=>{
        const color=mixModo==='categoria'?(mixColors[key]||'#94a3b8'):paletaProd[i%paletaProd.length];
        return {
          label:key,
          data:mixMeses.map(m=>Math.round(mixMap[m]?.[key]||0)),
          backgroundColor:color,
          borderRadius:i===0?4:0,
          borderSkipped:false,
          stack:'mix'
        };
      });
    }

    mkChart('c-mix-productos',{
      type:'bar',
      data:{labels:mixMeses,datasets},
      options:{
        responsive:true,maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12,padding:10}},
          tooltip:{callbacks:{
            label:c=>{
              const val=c.raw,mes=c.label;
              if(mixProdFiltro) return `${c.dataset.label}: ${val} cajas`;
              const totalMes=mixKeys.reduce((s,k)=>s+(mixMap[mes]?.[k]||0),0);
              const pct=totalMes>0?Math.round(val/totalMes*100):0;
              return `${c.dataset.label}: ${val} cajas (${pct}%)`;
            },
            footer:items=>{
              if(mixProdFiltro) return '';
              const tot=items.reduce((s,i)=>s+(i.raw||0),0);
              return `Total: ${tot} cajas`;
            }
          }}
        },
        scales:{
          x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}},stacked:!mixProdFiltro},
          y:{grid:{color:gridC},ticks:{color:textC,font:{size:11}},stacked:!mixProdFiltro,
            title:{display:true,text:'Cajas',color:textC,font:{size:11}},min:0}
        }
      }
    });
    const wrap=document.getElementById('c-mix-productos-wrap');
    if(wrap) wrap.style.display='block';
  }else{
    const wrap=document.getElementById('c-mix-productos-wrap');
    if(wrap) wrap.style.display='none';
  }
  // Acumulado
  const mesMap={};rows.forEach(r=>{if(r.mes)mesMap[r.mes]=(mesMap[r.mes]||0)+(r.total||0);});
  const mL=sortMeses(Object.keys(mesMap));let acc=0;
  mkChart('c-acumulado',{type:'line',data:{labels:mL,datasets:[{data:mL.map(m=>{acc+=mesMap[m]||0;return Math.round(acc);}),borderColor:COLORS.navy,backgroundColor:'rgba(30,58,95,0.08)',fill:true,tension:0.2,pointRadius:5,pointBackgroundColor:COLORS.navy}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'$'+Math.round(c.raw).toLocaleString('es-AR')}}},
      scales:{x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}}},y:{grid:{color:gridC},ticks:{color:textC,font:{size:11},callback:v=>'$'+Math.round(v/1000)+'k'}}}}});
  // Zona: volumen + costo promedio
  const zonaData={};
  rows.forEach(r=>{if(!r.region)return;if(!zonaData[r.region])zonaData[r.region]={pedidos:0,totalCosto:0};zonaData[r.region].pedidos++;zonaData[r.region].totalCosto+=(r.total||0);});
  const zonasOrd=Object.keys(zonaData).sort((a,b)=>zonaData[b].pedidos-zonaData[a].pedidos);
  mkChart('c-zona-volumen',{type:'bar',data:{labels:zonasOrd,datasets:[
    {type:'bar',label:'Entregas',data:zonasOrd.map(z=>zonaData[z].pedidos),backgroundColor:COLORS.teal,borderRadius:4,borderSkipped:false,yAxisID:'y-vol',order:2},
    {type:'line',label:'Costo promedio',data:zonasOrd.map(z=>Math.round(zonaData[z].totalCosto/zonaData[z].pedidos)),borderColor:COLORS.amber,backgroundColor:'rgba(217,119,6,0.1)',borderWidth:2.5,pointRadius:6,pointBackgroundColor:COLORS.amber,pointBorderColor:'#fff',pointBorderWidth:2,tension:0.2,yAxisID:'y-costo',order:1}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12,padding:14}},
      tooltip:{callbacks:{label:c=>c.dataset.label==='Entregas'?`Entregas: ${c.raw}`:`Costo promedio: $${Math.round(c.raw).toLocaleString('es-AR')}`}}},
    scales:{
      x:{grid:{color:gridC},ticks:{color:textC,font:{size:10},maxRotation:20}},
      'y-vol':{type:'linear',position:'left',grid:{color:gridC},ticks:{color:COLORS.teal,font:{size:11}},title:{display:true,text:'Entregas',color:COLORS.teal,font:{size:11}}},
      'y-costo':{type:'linear',position:'right',grid:{display:false},ticks:{color:COLORS.amber,font:{size:11},callback:v=>'$'+Math.round(v/1000)+'k'},title:{display:true,text:'Costo promedio',color:COLORS.amber,font:{size:11}}}
    }}});
  renderThresholds();
}

function renderThresholds(){
  const tbody=document.getElementById('thresh-tbody');if(!tbody)return;
  // Matriz real: zona × rangos de cajas
  const ranges=[[1,1,'1'],[2,3,'2-3'],[4,6,'4-6'],[7,10,'7-10'],[11,20,'11-20'],[21,30,'21-30'],[31,9999,'31+']];
  const zonas=Object.keys(TARIFF);
  tbody.innerHTML=zonas.map(z=>{
    const cells=ranges.map(([lo,hi])=>{
      const peds=allRows.filter(r=>r.region===z&&r.cajas>=lo&&r.cajas<=hi&&r.pct_log!=null);
      if(peds.length===0) return `<td class="num-right" style="color:var(--text3);font-size:11px">—</td>`;
      const avg=peds.reduce((s,r)=>s+r.pct_log,0)/peds.length;
      const cls=avg<8?'green':avg<15?'amber':'red';
      return `<td class="num-right">
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
          <span class="badge ${cls}" style="font-weight:600">${avg.toFixed(1)}%</span>
          <span style="font-size:9px;color:var(--text3)">${peds.length} ped</span>
        </div>
      </td>`;
    }).join('');
    return `<tr><td><strong>${z}</strong></td>${cells}</tr>`;
  }).join('');
}

// ---- OPCIÓN 2: PANEL COMPARADOR ----
function renderComparador(){
  const selA=document.getElementById('cmp-mes-a');
  const selB=document.getElementById('cmp-mes-b');
  if(!selA||!selB)return;
  const mesA=selA.value,mesB=selB.value;
  const panel=document.getElementById('cmp-panel');
  if(!mesA||!mesB){if(panel)panel.style.display='none';return;}
  const rA=allRows.filter(r=>r.mes===mesA);
  const rB=allRows.filter(r=>r.mes===mesB);
  if(!rA.length||!rB.length){if(panel)panel.style.display='none';return;}
  const mA=calcMetrics(rA),mB=calcMetrics(rB);
  if(panel)panel.style.display='block';

  function cmpRow(label,vA,vB,fmt,higherIsBetter=false){
    const pct=vA&&vA!==0?(vB-vA)/Math.abs(vA)*100:0;
    const improved=higherIsBetter?(pct>0):(pct<0);
    const neutral=Math.abs(pct)<0.5;
    const arrow=pct>0?'↑':'↓';
    const cls=neutral?'neutral':improved?'green':'red';
    const sign=pct>0?'+':'';
    return `<tr>
      <td style="font-size:13px;color:var(--text2);padding:10px 12px">${label}</td>
      <td style="text-align:right;padding:10px 12px;font-size:13px;font-weight:600">${fmt(vA)}</td>
      <td style="text-align:right;padding:10px 12px;font-size:13px;font-weight:600">${fmt(vB)}</td>
      <td style="text-align:right;padding:10px 12px">
        ${neutral?'<span style="font-size:12px;color:var(--text3)">—</span>'
          :`<span style="font-size:12px;font-weight:600;color:var(--${cls==='neutral'?'text3':cls})">${arrow} ${sign}${Math.abs(pct).toFixed(1)}%</span>`}
      </td>
    </tr>`;
  }

  const p=n=>'$'+Math.round(n).toLocaleString('es-AR');
  const pct=n=>n.toFixed(1)+'%';
  const num=n=>Math.round(n).toString();
  const cj=n=>(Math.round(n*10)/10).toLocaleString('es-AR')+' cj';

  document.getElementById('cmp-header-a').textContent=mesA;
  document.getElementById('cmp-header-b').textContent=mesB;

  document.getElementById('cmp-tbody').innerHTML=[
    cmpRow('Pedidos totales',    mA.count,         mB.count,         num, false),
    cmpRow('Clientes distintos', mA.clientes,      mB.clientes,      num, true),
    cmpRow('Facturación total',  mA.facturado,     mB.facturado,     p,   true),
    cmpRow('Gasto total (flete)',mA.total,         mB.total,         p,   false),
    cmpRow('Prom. por pedido',   mA.promPedido,    mB.promPedido,    p,   false),
    cmpRow('Prom. por caja',     mA.promCaja,      mB.promCaja,      p,   false),
    cmpRow('Cajas totales',      mA.totalCajas,    mB.totalCajas,    num, true),
    cmpRow('Cajas por pedido',   mA.cajasPorPedido,mB.cajasPorPedido,cj,  true),
    cmpRow('% logístico prom.',  mA.avgPct,        mB.avgPct,        pct, false),
    cmpRow('% pedidos verdes',   mA.pctVerdes,     mB.pctVerdes,     pct, true),
    cmpRow('OTIF',               mA.otif,          mB.otif,          pct, true),
    cmpRow('Pedidos rojos',      mA.rojos,         mB.rojos,         num, false),
  ].join('');

  // Gráfico de barras horizontales dobles (reemplaza radar)
  const barLabels=['Gasto total','Cajas prom./pedido','% logístico','OTIF (%)','Pedidos rojos'];
  const barDataA=[
    Math.round(mA.total/1000),
    Math.round(mA.totalCajas/(mA.count||1)*10)/10,
    Math.round(mA.avgPct*10)/10,
    Math.round(mA.otif*10)/10,
    mA.rojos
  ];
  const barDataB=[
    Math.round(mB.total/1000),
    Math.round(mB.totalCajas/(mB.count||1)*10)/10,
    Math.round(mB.avgPct*10)/10,
    Math.round(mB.otif*10)/10,
    mB.rojos
  ];
  const barSuffixes=['k','cj','%','%',''];
  mkChart('c-radar-cmp',{
    type:'bar',
    data:{
      labels:barLabels,
      datasets:[
        {label:mesA,data:barDataA,backgroundColor:'rgba(37,99,235,0.8)',borderRadius:4,borderSkipped:false},
        {label:mesB,data:barDataB,backgroundColor:'rgba(217,119,6,0.8)',borderRadius:4,borderSkipped:false}
      ]
    },
    options:{
      indexAxis:'y',
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'bottom',labels:{color:textC,font:{size:12},boxWidth:14,padding:14}},
        tooltip:{callbacks:{
          label:c=>{
            const suf=barSuffixes[c.dataIndex]||'';
            return `${c.dataset.label}: ${c.raw}${suf}`;
          }
        }}
      },
      scales:{
        x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}}},
        y:{grid:{display:false},ticks:{color:textC,font:{size:12},font:{weight:'500'}}}
      }
    }
  });
}

let frecTargetInterval = 10;

function setFrecInterval(days, btn) {
  frecTargetInterval = days;
  document.querySelectorAll('.frec-btn').forEach(b => {
    b.style.background = 'var(--surface)'; b.style.color = 'var(--text2)';
    b.style.borderColor = 'var(--border2)'; b.style.fontWeight = '';
  });
  if (btn) { btn.style.background = 'var(--blue)'; btn.style.color = '#fff'; btn.style.borderColor = 'var(--blue)'; btn.style.fontWeight = '600'; }
  renderChartsClientes();
}

function getProdsMix(pid) {
  if (!mixData || !mixData.length) return '';
  const prods = mixData.filter(m => String(m.pid) === String(pid));
  if (!prods.length) return '';
  return prods.map(p => `${p.producto} ×${p.cantidad}`).join(' · ');
}

function safePidId(pid) {
  return 'p' + String(pid||'').replace(/[^a-zA-Z0-9]/g, '_');
}

function verSimulacionCliente(name) {
  const navItem = document.querySelector('[data-page="clientes"]');
  if (navItem) switchPage('clientes', navItem);
  const inp = document.getElementById('frec-search');
  if (inp) inp.value = name;
  renderChartsClientes();
  setTimeout(() => {
    const el = document.getElementById('frec-summary') || document.getElementById('frecuencia-tbody');
    if (el) el.scrollIntoView({behavior:'smooth', block:'center'});
  }, 120);
}

function togglePedidoDetail(uid) {
  const det = document.getElementById('det-'+uid);
  const ico = document.getElementById('ico-'+uid);
  if (!det) return;
  const open = det.style.display !== 'none';
  det.style.display = open ? 'none' : 'table-row';
  if (ico) ico.textContent = open ? '▸' : '▾';
}

function renderChartsClientes(){
  const rows=filteredRows;
  const clientMap={};
  rows.forEach(r=>{
    const k=r.razon_social||r.dest||'Desconocido';
    if(!clientMap[k])clientMap[k]={gasto:0,pedidos:0,rojos:0,cajas:0,pctLogs:[]};
    clientMap[k].gasto+=(r.total||0);clientMap[k].pedidos++;
    if(r.semaforo==='rojo')clientMap[k].rojos++;
    clientMap[k].cajas+=(r.cajas||0);
    if(r.pct_log!=null)clientMap[k].pctLogs.push(r.pct_log);
  });
  const topGasto=Object.entries(clientMap).sort((a,b)=>b[1].gasto-a[1].gasto).slice(0,10);
  const maxG=topGasto[0]?.[1]?.gasto||1;
  document.getElementById('rank-gasto').innerHTML=topGasto.map(([name,d],i)=>`
    <div class="rank-row"><div class="rank-num">${i+1}</div><div class="rank-name" title="${name}">${name}</div>
    <div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.round(d.gasto/maxG*100)}%"></div></div>
    <div class="rank-val">${peso(d.gasto)}</div>
    <button data-cname="${name.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" onclick="verSimulacionCliente(this.dataset.cname)" title="Ver cuánto se ahorraría consolidando pedidos" style="flex-shrink:0;font-size:10px;padding:2px 8px;border:1px solid var(--border2);border-radius:12px;background:var(--surface2);color:var(--text2);cursor:pointer;white-space:nowrap;margin-left:6px">Ver ahorro →</button>
    </div>`).join('');
  const topPct=Object.entries(clientMap).filter(([,d])=>d.pctLogs.length>=2).map(([name,d])=>[name,d.pctLogs.reduce((s,v)=>s+v,0)/d.pctLogs.length]).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const maxP=topPct[0]?.[1]||1;
  document.getElementById('rank-pctlog').innerHTML=topPct.map(([name,avg],i)=>`
    <div class="rank-row"><div class="rank-num">${i+1}</div><div class="rank-name" title="${name}">${name}</div>
    <div class="rank-bar-wrap"><div class="rank-bar red" style="width:${Math.round(avg/maxP*100)}%"></div></div>
    <div class="rank-val"><span class="badge ${avg<8?'green':avg<15?'amber':'red'}">${avg.toFixed(1)}%</span></div></div>`).join('');
  const rojosClients=Object.entries(clientMap).filter(([,d])=>d.rojos>0).map(([name,d])=>{
    const avgPct=d.pctLogs.length?d.pctLogs.reduce((s,v)=>s+v,0)/d.pctLogs.length:0;
    return{name,pedidos:d.pedidos,rojos:d.rojos,pctRojos:d.rojos/d.pedidos*100,avgCajas:d.cajas/(d.pedidos||1),avgPct,region:rows.find(r=>(r.razon_social||r.dest)===name)?.region||''};
  }).sort((a,b)=>b.pctRojos-a.pctRojos).slice(0,20);
  document.getElementById('clientes-rojos-tbody').innerHTML=rojosClients.map(r=>`
    <tr><td title="${r.name}">${r.name}</td><td class="num-right">${r.pedidos}</td><td class="num-right">${r.rojos}</td>
    <td class="num-right"><span class="badge ${r.pctRojos>50?'red':'amber'}">${r.pctRojos.toFixed(0)}%</span></td>
    <td class="num-right">${r.avgCajas.toFixed(1)}</td>
    <td class="num-right"><span class="badge red">${r.avgPct.toFixed(1)}%</span></td>
    <td>${r.region}</td></tr>`).join('');

  // ---- ANÁLISIS DE FRECUENCIA ----
  const frecuenciaBody = document.getElementById('frecuencia-tbody');
  if (!frecuenciaBody) return;

  function normProd(s) {
    if (!s) return null;
    const u = s.toUpperCase();
    if (u.includes('CERVEZA')||u.includes('IPA')||u.includes('STOUT')||u.includes('ALE')||u.includes('LAGER')||u.includes('RUBIA')||u.includes('NEGRA')) return 'Cerveza';
    if (u.includes('ALTA MONT')) return 'Alta Montaña';
    if (u.includes('GIN')&&u.includes('500')) return 'Gin 500ml';
    if (u.includes('GIN')&&u.includes('750')) return 'Gin 750ml';
    if (u.includes('GIN')) return 'Gin';
    if (u.includes('VERMÚ')||u.includes('VERMU')||u.includes('FERIADO')) return 'Vermú';
    if (u.includes('BARRIL')) return 'Barril';
    return s.trim().split(' ').slice(0,2).join(' ');
  }

  // Construir datos por cliente con info de región, valor declarado y productos
  const clienteFrecMap = {};
  rows.forEach(r => {
    const k = r.razon_social || r.dest || 'Desconocido';
    if (!clienteFrecMap[k]) clienteFrecMap[k] = { pedidos: 0, totalCajas: 0, totalFlete: 0, totalValDecl: 0, pctLogs: [], region: r.region || '', pallets: 0, prods: {}, fechas: [] };
    const d = clienteFrecMap[k];
    d.pedidos++;
    d.totalCajas  += (r.cajas    || 0);
    d.totalFlete  += (r.total    || 0);
    d.totalValDecl+= (r.val_decl || 0);
    d.pallets     += (r.pallets  || 0);
    if (r.pct_log != null) d.pctLogs.push(r.pct_log);
    if (!d.region && r.region) d.region = r.region;
    if (r.fecha) d.fechas.push(r.fecha);
    if (r.productos) r.productos.split(',').forEach(p => {
      const n = normProd(p); if (n) d.prods[n] = (d.prods[n] || 0) + 1;
    });
  });

  // Encuentra el mínimo de cajas para llegar a zona verde (<8%) o amarilla (<15%)
  function cajasMinimas(region, avgValDeclPorCaja, metaPct) {
    if (!avgValDeclPorCaja || !region) return null;
    for (let cajas = 1; cajas <= 100; cajas++) {
      const flete = calcFlete(region, cajas, 0);
      if (flete == null) continue;
      if (flete / (avgValDeclPorCaja * cajas) < metaPct) return cajas;
    }
    return null;
  }

  const targetInterval = frecTargetInterval || 10;


  const simClientes = Object.entries(clienteFrecMap)
    .filter(([, d]) => d.pedidos >= 2 && d.totalValDecl > 0 && d.totalCajas > 0 && d.region)
    .map(([name, d]) => {
      const avgCajas          = d.totalCajas / d.pedidos;
      const avgPallet         = d.pallets    / d.pedidos;
      const avgValDeclPorCaja = d.totalValDecl / d.totalCajas;
      const currentPct        = d.totalFlete / d.totalValDecl * 100;

      // Calcular intervalo promedio real desde fechas
      let avgInterval = null, periodDays = null;
      if (d.fechas.length >= 2) {
        const sorted = d.fechas.map(f => new Date(f+'T12:00:00')).sort((a,b)=>a-b);
        periodDays = (sorted[sorted.length-1] - sorted[0]) / (1000*60*60*24);
        avgInterval = periodDays > 0 ? periodDays / (d.fechas.length - 1) : null;
      }

      // Si ya pide con menor frecuencia que el target, no aplica
      if (avgInterval !== null && avgInterval >= targetInterval) return null;

      let simCajas, simPedidosN, simFleteUnit, simTotalFlete;
      if (avgInterval !== null && periodDays > 0) {
        simPedidosN  = Math.max(1, periodDays / targetInterval);
        simCajas     = Math.round(d.totalCajas / simPedidosN);
        const simPallets = d.pallets > 0 ? Math.ceil(d.pallets * (simPedidosN / d.pedidos)) : 0;
        simFleteUnit = calcFlete(d.region, simCajas, simPallets);
        if (simFleteUnit == null) return null;
        simTotalFlete = simFleteUnit * Math.ceil(simPedidosN);
      } else {
        // Sin fechas: duplicar cajas como proxy conservador
        simCajas      = Math.round(avgCajas * 2);
        simPedidosN   = d.pedidos / 2;
        simFleteUnit  = calcFlete(d.region, simCajas, avgPallet * 2);
        if (simFleteUnit == null) return null;
        simTotalFlete = simFleteUnit * Math.ceil(simPedidosN);
      }

      const simPct  = Math.max(0, simTotalFlete / d.totalValDecl * 100);
      const ahorro  = d.totalFlete - simTotalFlete;
      const mejora  = currentPct - simPct;

      const minVerde    = cajasMinimas(d.region, avgValDeclPorCaja, 0.08);
      const minAmarilla = cajasMinimas(d.region, avgValDeclPorCaja, 0.15);

      const prodDominante = Object.entries(d.prods).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
      return { name, region: d.region, pedidos: d.pedidos, avgCajas, currentPct, simCajas, simPct, ahorro, mejora, minVerde, minAmarilla, prodDominante, avgInterval };
    })
    .filter(Boolean)
    .filter(c => c.mejora > 0.5)
    .sort((a, b) => b.ahorro - a.ahorro)
    .slice(0, 20);

  // Actualizar header columna comparación
  const thSim = document.getElementById('frec-th-sim');
  if (thSim) thSim.innerHTML = `% actual → cada ${targetInterval}d<br><span style="font-weight:400;font-size:10px" id="frec-th-sim-sub">cajas actuales → cajas simuladas</span>`;

  // Filtrar por búsqueda
  const frecSearch = (document.getElementById('frec-search')?.value || '').toLowerCase().trim();
  const displayClientes = frecSearch
    ? simClientes.filter(c => c.name.toLowerCase().includes(frecSearch))
    : simClientes;

  const totalAhorro = displayClientes.reduce((s,c) => s + Math.max(0, c.ahorro), 0);
  const summaryEl = document.getElementById('frec-summary');
  if (summaryEl) {
    if (displayClientes.length) {
      summaryEl.style.display = '';
      const label = frecSearch
        ? `<strong>${displayClientes[0].name}</strong>`
        : `los <strong>${displayClientes.length} clientes</strong> de abajo`;
      summaryEl.innerHTML = `Si ${label} consolidara${displayClientes.length > 1 ? 'n' : ''} pedidos a cada <strong>${targetInterval} días</strong> → ahorro estimado en el período: <strong style="font-size:15px;color:var(--green-dark)">${peso(totalAhorro)}</strong>`;
    } else {
      summaryEl.style.display = 'none';
    }
  }

  if (!displayClientes.length) {
    frecuenciaBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text3)">' + (frecSearch ? `No se encontró "${frecSearch}" en el listado.` : `No hay clientes que pidan con más frecuencia que cada ${targetInterval} días en el período actual.`) + '</td></tr>';
    return;
  }

  frecuenciaBody.innerHTML = displayClientes.map(c => {
    const actBadge = c.currentPct < 8 ? 'green' : c.currentPct < 15 ? 'amber' : 'red';
    const simBadge = c.simPct < 8 ? 'green' : c.simPct < 15 ? 'amber' : 'red';
    const prodColor = c.prodDominante === 'Cerveza' ? 'var(--amber-dark)' : c.prodDominante.includes('Gin') ? 'var(--text2)' : 'var(--green-dark)';
    const intervaloText = c.avgInterval != null ? `cada ~${Math.round(c.avgInterval)} días` : '';
    return `<tr>
      <td style="white-space:normal;min-width:140px">
        <div style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px" title="${c.name}">${c.name}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${c.region} · <span style="color:${prodColor};font-weight:600">${c.prodDominante}</span></div>
      </td>
      <td class="num-right">
        <span style="font-weight:600">${c.pedidos} pedidos</span><br>
        <span style="font-size:11px;color:var(--text3)">${intervaloText}</span>
      </td>
      <td class="num-right" style="white-space:normal">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
          <span class="badge ${actBadge}">${c.currentPct.toFixed(1)}%</span>
          <span style="color:var(--text3);font-size:13px">→</span>
          <span class="badge ${simBadge}">${c.simPct.toFixed(1)}%</span>
        </div>
        <div style="font-size:10px;color:var(--text3);text-align:right;margin-top:3px">${c.avgCajas.toFixed(1)} cj &nbsp;→&nbsp; ${c.simCajas} cj por envío</div>
      </td>
      <td class="num-right">
        <strong style="color:var(--green-dark);font-size:14px">${peso(c.ahorro)}</strong><br>
        <span style="font-size:10px;color:var(--text3)">−${c.mejora.toFixed(1)} pp</span>
      </td>
    </tr>`;
  }).join('');
}

function renderChartsServicio(){
  const rows=filteredRows;
  const otifRows=rows.filter(r=>r.otif!=='');
  const otif=otifRows.length?otifRows.filter(r=>r.otif==='Sí').length/otifRows.length*100:0;
  const kRows=rows.filter(r=>r.dias_klozer!=null);
  const diasKlozerAvg=kRows.length?kRows.reduce((s,r)=>s+(r.dias_klozer||0),0)/kRows.length:0;
  const pRows=rows.filter(r=>r.dias_prep!=null);
  const diasPrepAvg=pRows.length?pRows.reduce((s,r)=>s+(r.dias_prep||0),0)/pRows.length:0;
  const devueltos=rows.filter(r=>r.estado==='Devuelto').length;
  const eliminados=rows.filter(r=>r.estado==='Eliminado').length;
  const parciales=rows.filter(r=>r.estado==='Entrega Parcial').length;
  const totalInc=devueltos+eliminados+parciales;
  const tasaError=rows.length?totalInc/rows.length*100:0;
  const totalFlete=rows.reduce((s,r)=>s+(r.total||0),0);
  const totalValor=rows.reduce((s,r)=>s+(r.val_decl||0),0);
  const costoSobreFact=totalValor>0?totalFlete/totalValor*100:0;
  const despEnDia=pRows.filter(r=>r.dias_prep!=null&&r.dias_prep<=1).length;
  const pctDespEnDia=pRows.length?despEnDia/pRows.length*100:0;
  document.getElementById('kpi-servicio').innerHTML=`
    <div class="kpi-card accent-green"><div class="label">OTIF Klozer</div><div class="value" style="color:var(--green)">${otif.toFixed(1)}%</div><div class="sub">Meta &gt;85%</div></div>
    <div class="kpi-card accent"><div class="label">Días prom. Klozer</div><div class="value">${diasKlozerAvg.toFixed(2)}</div><div class="sub">Despacho → entrega</div></div>
    <div class="kpi-card ${diasPrepAvg<=1?'accent-green':'accent-amber'}"><div class="label">Prep. interna</div><div class="value" style="color:var(--${diasPrepAvg<=1?'green':'amber'})">${diasPrepAvg.toFixed(1)} d</div><div class="sub">Meta &lt;1 día</div></div>
    <div class="kpi-card ${pctDespEnDia>=90?'accent-green':'accent-amber'}"><div class="label">Desp. en el día</div><div class="value" style="color:var(--${pctDespEnDia>=90?'green':'amber'})">${pctDespEnDia.toFixed(1)}%</div><div class="sub">Meta &gt;90%</div></div>
    <div class="kpi-card ${tasaError<2?'accent-green':'accent-red'}"><div class="label">Tasa de error</div><div class="value" style="color:var(--${tasaError<2?'green':'red'})">${tasaError.toFixed(1)}%</div><div class="sub">Meta &lt;2%</div></div>
    <div class="kpi-card ${costoSobreFact<10?'accent-green':'accent-red'}"><div class="label">Costo log. / Fact.</div><div class="value" style="color:var(--${costoSobreFact<10?'green':'red'})">${costoSobreFact.toFixed(1)}%</div><div class="sub">Meta &lt;8-10%</div></div>
    <div class="kpi-card ${devueltos===0?'':'accent-red'}"><div class="label">Devueltos</div><div class="value ${devueltos>0?'red':''}">${devueltos}</div><div class="sub">Meta &lt;1%</div></div>
    <div class="kpi-card"><div class="label">Fill Rate</div><div class="value" style="color:var(--text3)">Sin datos</div><div class="sub">Requiere unid. pedidas vs entregadas</div></div>`;
  const mesOtif={};
  rows.forEach(r=>{if(!r.mes||r.otif==='')return;if(!mesOtif[r.mes])mesOtif[r.mes]={si:0,tot:0};mesOtif[r.mes].tot++;if(r.otif==='Sí')mesOtif[r.mes].si++;});
  const mL=sortMeses(Object.keys(mesOtif));
  mkChart('c-otif',{type:'line',data:{labels:mL,datasets:[
    {data:mL.map(m=>Math.round(mesOtif[m].si/mesOtif[m].tot*1000)/10),borderColor:COLORS.green,backgroundColor:COLORS.greenL,fill:true,tension:0.2,pointRadius:5,pointBackgroundColor:COLORS.green,label:'OTIF %'},
    {data:mL.map(()=>85),borderColor:'rgba(217,119,6,0.5)',borderDash:[5,5],pointRadius:0,label:'Meta 85%'}
  ]},options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw}%`}}},
    scales:{x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}}},y:{min:0,max:100,grid:{color:gridC},ticks:{color:textC,font:{size:11},callback:v=>v+'%'}}}}});
  mkChart('c-incidencias',{type:'doughnut',data:{labels:['Devueltos','Eliminados','Entregas parciales'],
    datasets:[{data:[devueltos,eliminados,parciales],backgroundColor:[COLORS.red,COLORS.amber,COLORS.purple],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
      plugins:{legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12,padding:10}},tooltip:{callbacks:{label:c=>`${c.label}: ${c.raw}`}}}}});
  document.getElementById('comp-tiempos').innerHTML=`
    <div class="comp-row"><div class="comp-label">Prep. interna</div>
    <div class="comp-bars"><div class="comp-bar" style="width:${Math.min(diasPrepAvg*60,280)}px;background:${COLORS.amber}">${diasPrepAvg.toFixed(1)}d</div></div>
    <div class="comp-vals" style="font-size:13px;font-weight:600">${diasPrepAvg.toFixed(1)} días prom.</div></div>
    <div class="comp-row" style="margin-bottom:20px"><div class="comp-label">Klozer (flete)</div>
    <div class="comp-bars"><div class="comp-bar" style="width:${Math.max(diasKlozerAvg*60,24)}px;background:${COLORS.green}">${diasKlozerAvg.toFixed(2)}d</div></div>
    <div class="comp-vals" style="font-size:13px;font-weight:600">${diasKlozerAvg.toFixed(2)} días prom.</div></div>
    <div style="font-size:13px;color:var(--text2);padding:12px;background:${diasPrepAvg>diasKlozerAvg*2?'var(--amber-light)':'var(--green-light)'};border-radius:var(--radius)">
    ${diasPrepAvg>diasKlozerAvg*2?`Cuello de botella en <strong>preparación interna</strong> (${diasPrepAvg.toFixed(1)} días).`:`Operación equilibrada: prep. ${diasPrepAvg.toFixed(1)} días · Klozer ${diasKlozerAvg.toFixed(2)} días.`}</div>`;

  // ---- INCIDENCIA LOGÍSTICA VS TIEMPO (movido de Resumen) ----
  const mesIncMap={};
  rows.forEach(r=>{
    if(!r.mes||r.pct_log==null)return;
    if(!mesIncMap[r.mes])mesIncMap[r.mes]={sum:0,cnt:0,verde:0,amarillo:0,rojo:0};
    mesIncMap[r.mes].sum+=r.pct_log;mesIncMap[r.mes].cnt++;
    if(r.semaforo==='verde')mesIncMap[r.mes].verde++;
    else if(r.semaforo==='amarillo')mesIncMap[r.mes].amarillo++;
    else if(r.semaforo==='rojo')mesIncMap[r.mes].rojo++;
  });
  const mInc=sortMeses(Object.keys(mesIncMap));
  const avgPctMes=mInc.map(m=>mesIncMap[m].cnt?Math.round(mesIncMap[m].sum/mesIncMap[m].cnt*10)/10:0);
  if(mInc.length>0){
    mkChart('c-pct-tendencia',{type:'bar',data:{labels:mInc,datasets:[
      {type:'bar',label:'Rojo (>15%)',data:mInc.map(m=>mesIncMap[m]?.rojo||0),backgroundColor:COLORS.red,borderRadius:4,borderSkipped:false,stack:'s',yAxisID:'y-cnt',order:2},
      {type:'bar',label:'Amarillo (8-15%)',data:mInc.map(m=>mesIncMap[m]?.amarillo||0),backgroundColor:COLORS.amber,borderRadius:0,borderSkipped:false,stack:'s',yAxisID:'y-cnt',order:2},
      {type:'bar',label:'Verde (<8%)',data:mInc.map(m=>mesIncMap[m]?.verde||0),backgroundColor:COLORS.green,borderRadius:0,borderSkipped:false,stack:'s',yAxisID:'y-cnt',order:2},
      {type:'line',label:'% logístico promedio',data:avgPctMes,borderColor:COLORS.navy,borderWidth:2.5,pointRadius:6,pointBackgroundColor:COLORS.navy,pointBorderColor:'#fff',pointBorderWidth:2,tension:0.2,fill:false,yAxisID:'y-pct',order:1}
    ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12,padding:12}},
        tooltip:{callbacks:{label:c=>c.dataset.label==='% logístico promedio'?`Promedio: ${c.raw}%`:`${c.dataset.label}: ${c.raw} pedidos`}}},
      scales:{
        x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}}},
        'y-cnt':{type:'linear',position:'left',stacked:true,grid:{color:gridC},ticks:{color:textC,font:{size:11}},title:{display:true,text:'Pedidos',color:textC,font:{size:11}}},
        'y-pct':{type:'linear',position:'right',grid:{display:false},ticks:{color:COLORS.navy,font:{size:11},callback:v=>v+'%'},title:{display:true,text:'% logístico',color:COLORS.navy,font:{size:11}},min:0}
      }}});
  }
}

function sortTable(col){
  if(sortCol===col)sortDir=sortDir==='asc'?'desc':'asc';
  else{sortCol=col;sortDir=col==='fecha'?'desc':'asc';}
  renderTable();
  document.querySelectorAll('th[data-sort]').forEach(th=>{th.querySelector('.sort-icon').textContent=th.dataset.sort===sortCol?(sortDir==='asc'?'↑':'↓'):'↕';});
}

function renderTable(){
  const mes=document.getElementById('filter-mes').value;
  const reg=document.getElementById('f-region')?.value||'';
  const sem=document.getElementById('f-semaforo')?.value||'';
  const est=document.getElementById('f-estado')?.value||'';
  const srch=(document.getElementById('f-search')?.value||'').toLowerCase();
  let filtered=allRows.filter(r=>(!mes||r.mes===mes)&&(!reg||r.region===reg)&&(!sem||r.semaforo===sem)&&(!est||r.estado===est)&&(!srch||(r.dest||'').toLowerCase().includes(srch)||(r.razon_social||'').toLowerCase().includes(srch)));
  filtered.sort((a,b)=>{
    let vA=a[sortCol],vB=b[sortCol];
    if(sortCol==='fecha'){vA=vA||'';vB=vB||'';}
    if(vA==null)return 1;if(vB==null)return -1;
    if(typeof vA==='string')return sortDir==='asc'?vA.localeCompare(vB):vB.localeCompare(vA);
    return sortDir==='asc'?vA-vB:vB-vA;
  });
  document.getElementById('main-tbody').innerHTML=filtered.slice(0,300).map(r=>{
    const uid='tbl'+safePidId(r.pid);
    const mix=getProdsMix(r.pid);
    const detContent=mix
      ?`<strong style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">Composición: </strong><span style="font-size:12px">${mix}</span>`
      :`<span style="font-size:12px;color:var(--text3)">Sin detalle de productos para este pedido</span>`;
    return `<tr onclick="togglePedidoDetail('${uid}')" style="cursor:pointer">
    <td><span id="ico-${uid}" style="color:var(--text3);font-size:10px;margin-right:3px">▸</span>${r.pid||''}</td>
    <td>${fmtD(r.fecha)}</td><td>${r.mes||''}</td>
    <td title="${r.razon_social||r.dest}">${r.razon_social||r.dest||''}</td>
    <td>${r.region||''}</td>
    <td class="num-right">${r.cajas||0}</td><td class="num-right">${peso(r.val_decl)}</td>
    <td class="num-right">${peso(r.total)}</td>
    <td>${r.pct_log!=null?`<span class="badge ${r.semaforo}">${r.pct_log.toFixed(1)}%</span>`:'-'}</td>
    <td>${r.otif?`<span class="badge ${r.otif==='Sí'?'green':'red'}">${r.otif}</span>`:'-'}</td>
    <td class="num-right">${r.dias_klozer!=null?r.dias_klozer+' d':'-'}</td>
    <td><span class="badge ${r.estado==='Entregado'?'green':r.estado==='Devuelto'?'red':r.estado?'amber':'gray'}">${r.estado||'-'}</span></td>
    </tr>
    <tr id="det-${uid}" style="display:none">
      <td colspan="12" style="background:var(--surface2);padding:10px 20px;white-space:normal;border-bottom:2px solid var(--border2)">${detContent}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--text3)">Sin resultados</td></tr>';
  renderRankingPedidos(filtered);
}

// ---- EXPORTAR PEDIDOS A EXCEL ----
function exportPedidos(){
  const mes=document.getElementById('filter-mes').value;
  const reg=document.getElementById('f-region')?.value||'';
  const sem=document.getElementById('f-semaforo')?.value||'';
  const est=document.getElementById('f-estado')?.value||'';
  const srch=(document.getElementById('f-search')?.value||'').toLowerCase();
  const rows=allRows.filter(r=>(!mes||r.mes===mes)&&(!reg||r.region===reg)&&(!sem||r.semaforo===sem)&&(!est||r.estado===est)&&(!srch||(r.dest||'').toLowerCase().includes(srch)||(r.razon_social||'').toLowerCase().includes(srch)));
  if(!rows.length){alert('No hay pedidos para exportar con los filtros actuales.');return;}
  const data=rows.map(r=>({
    'Pedido':        r.pid||'',
    'Fecha':         r.fecha||'',
    'Mes':           r.mes||'',
    'Cliente':       r.razon_social||r.dest||'',
    'Región':        r.region||'',
    'Cajas':         r.cajas||0,
    'Pallets':       r.pallets||0,
    'Valor declarado':r.val_decl||0,
    'Total flete':   r.total||0,
    '% Logístico':   r.pct_log!=null?r.pct_log/100:null,
    'Semáforo':      r.semaforo||'',
    'OTIF':          r.otif||'',
    'Días Klozer':   r.dias_klozer!=null?r.dias_klozer:'',
    'Días Prep':     r.dias_prep!=null?r.dias_prep:'',
    'Estado':        r.estado||'',
    'Incidencia':    r.incidencia||'',
    'Localidad':     r.localidad||'',
    'Provincia':     r.provincia||'',
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  // Formato porcentaje para columna % Logístico
  const pctCol='J';
  for(let i=2;i<=data.length+1;i++) if(ws[`${pctCol}${i}`]) ws[`${pctCol}${i}`].z='0.0%';
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Pedidos');
  const sufijo=mes?`_${mes.replace(/\s/g,'-')}`:''
  XLSX.writeFile(wb,`pedidos${sufijo}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ---- RANKING DE PEDIDOS CON MAYOR COSTO LOGÍSTICO ----
function renderRankingPedidos(rows){
  const tbody=document.getElementById('ranking-pedidos-tbody');
  if(!tbody)return;
  // Calcular causa principal del costo elevado para cada pedido
  function analizarCausa(r){
    const causas=[];
    if(r.cajas&&r.cajas<=3) causas.push({tipo:'Pedido chico',det:`Solo ${r.cajas} caja${r.cajas>1?'s':''}`,cls:'amber',peso:3});
    if(r.region&&!['Local - CABA','GBA'].includes(r.region)){
      const zonaCara=['Patagonia (interior)','Santa Cruz y TDF','Patagonia (capitales)','NEA/NOA (interior)','Cuyo (interior)','Centro (interior)'];
      if(zonaCara.includes(r.region)) causas.push({tipo:'Zona cara',det:r.region,cls:'red',peso:4});
      else causas.push({tipo:'Fuera de AMBA',det:r.region,cls:'amber',peso:2});
    }
    if(r.val_decl&&r.val_decl<50000) causas.push({tipo:'Valor bajo',det:`Mercadería: ${peso(r.val_decl)}`,cls:'amber',peso:3});
    if(r.estado==='Devuelto'||r.estado==='Entrega Parcial') causas.push({tipo:'Incidencia',det:r.estado,cls:'red',peso:5});
    if(causas.length===0) causas.push({tipo:'Costo alto absoluto',det:'Pedido grande/caro por monto',cls:'gray',peso:1});
    causas.sort((a,b)=>b.peso-a.peso);
    return causas.slice(0,2);
  }
  // Top 20 por costo total logístico
  const top=rows.filter(r=>r.total).sort((a,b)=>(b.total||0)-(a.total||0)).slice(0,20);
  if(top.length===0){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">Sin pedidos en este filtro</td></tr>';return;}
  tbody.innerHTML=top.map((r,i)=>{
    const causas=analizarCausa(r);
    const causasHtml=causas.map(c=>`<span class="badge ${c.cls}" title="${c.det}" style="font-size:10px;margin-right:4px">${c.tipo}</span>`).join('');
    const uid='top'+safePidId(r.pid);
    const mix=getProdsMix(r.pid);
    const detContent=mix
      ?`<strong style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.04em">Composición: </strong><span style="font-size:12px">${mix}</span>`
      :`<span style="font-size:12px;color:var(--text3)">Sin detalle de productos para este pedido</span>`;
    return `<tr onclick="togglePedidoDetail('${uid}')" style="cursor:pointer">
      <td><strong>${i+1}</strong></td>
      <td><span id="ico-${uid}" style="color:var(--text3);font-size:10px;margin-right:3px">▸</span>${r.pid||''}</td>
      <td title="${r.razon_social||r.dest}">${r.razon_social||r.dest||'-'}</td>
      <td>${r.region||'-'}</td>
      <td class="num-right">${r.cajas||0}</td>
      <td class="num-right"><strong>${peso(r.total)}</strong></td>
      <td>${r.pct_log!=null?`<span class="badge ${r.semaforo}">${r.pct_log.toFixed(1)}%</span>`:'-'}</td>
      <td style="line-height:1.6;white-space:normal;min-width:160px">${causasHtml}<div style="font-size:11px;color:var(--text3);margin-top:2px">${causas[0].det}</div></td>
    </tr>
    <tr id="det-${uid}" style="display:none">
      <td colspan="8" style="background:var(--surface2);padding:10px 20px;white-space:normal;border-bottom:2px solid var(--border2)">${detContent}</td>
    </tr>`;
  }).join('');
}

function renderTarifario(){
  const el=document.getElementById('tarifario-tbody');if(!el)return;
  el.innerHTML=Object.entries(TARIFF).map(([zona,precios])=>`
    <tr><td><strong>${zona}</strong></td>
    ${precios.map(p=>p!=null?`<td class="num-right">$${Math.round(p).toLocaleString('es-AR')}</td>`:`<td class="num-right" style="color:var(--text3)">—</td>`).join('')}
    </tr>`).join('');
}

const ZONA_MAP={'Local - CABA':'Local - CABA','GBA':'GBA','Centro (capitales)':'Centro (capitales)','Centro (interior)':'Centro (interior)','Cuyo (capitales)':'Cuyo (capitales)','Cuyo (interior)':'Cuyo (interior)','Patagonia (capitales)':'Patagonia (capitales)','Patagonia (interior)':'Patagonia (interior)','Santa Cruz y TDF':'Santa Cruz y TDF'};

async function buscarCP(){
  const input=document.getElementById('sim-cp-input');
  const badge=document.getElementById('sim-cp-badge');
  const cp=parseInt((input?.value||'').trim());
  if(!cp||isNaN(cp)){badge.textContent='Ingresá un CP válido';badge.className='badge red';badge.style.display='inline-block';return;}
  badge.textContent='Buscando...';badge.className='badge';badge.style.display='inline-block';
  try{
    const{data,error}=await supabaseClient.from('zonas_cp').select('zona,localidad,provincia').eq('cp',cp).single();
    if(error||!data){badge.textContent='CP no encontrado';badge.className='badge red';return;}
    const zonaSelect=ZONA_MAP[data.zona];
    if(!zonaSelect){badge.textContent=`${data.localidad} — zona "${data.zona}" sin tarifa`;badge.className='badge amber';return;}
    const select=document.getElementById('sim-region');
    if(select){select.value=zonaSelect;calcSim();}
    badge.textContent=`${data.localidad}, ${data.provincia} → ${data.zona}`;badge.className='badge green';
  }catch(e){badge.textContent='Error al consultar';badge.className='badge red';}
}

function calcSim(){
  const region=document.getElementById('sim-region').value;
  const empty=document.getElementById('sim-result-empty');
  const content=document.getElementById('sim-result-content');
  if(!region){empty.style.display='block';content.style.display='none';return;}

  let totalUnidades=0,totalCajas=0,totalValorLista=0,totalValorFinal=0;
  const productosUsados=[];

  for(const r of simRows){
    if(!r.productoId||!r.unidades) continue;
    const prod=listaPrecios.find(p=>String(p.id)===String(r.productoId));
    if(!prod) continue;
    const precioU=parseFloat(prod.precio_unidad)||0;
    const upb=parseFloat(prod.unidades_por_bulto)||1;
    const valorLista=precioU*r.unidades;
    const valorFinal=valorLista*(1-r.descuento/100);
    totalUnidades+=r.unidades;
    totalCajas+=r.unidades/upb;
    totalValorLista+=valorLista;
    totalValorFinal+=valorFinal;
    const dl=r.descuento>0?' (-'+r.descuento+'%)':'';
    productosUsados.push(r.unidades+'u '+prod.descripcion+dl);
  }

  const valorManual=parseFloat(document.getElementById('sim-valor-manual')?.value)||0;
  const cajasManual=parseInt(document.getElementById('sim-cajas-manual')?.value)||0;
  if(cajasManual>0&&valorManual>0){totalCajas+=cajasManual;totalValorLista+=valorManual;totalValorFinal+=valorManual;}

  // Pallets manuales: el flete se calcula desde el tarifario
  const palletsManual=parseInt(document.getElementById('sim-pallets-cant')?.value)||0;
  const palletsValor=parseFloat(document.getElementById('sim-pallets-valor')?.value)||0;
  let fletePallets=0;
  if(palletsManual>0&&palletsValor>0){
    const t=TARIFF[region];
    if(t&&t[6]) fletePallets=t[6]*palletsManual; // t[6] = tarifa por pallet
    totalValorLista+=palletsValor;
    totalValorFinal+=palletsValor;
    productosUsados.push(`${palletsManual} pallet${palletsManual>1?'s':''} (manual)`);
  }

  if(totalCajas<=0&&palletsManual===0||totalValorLista===0){empty.style.display='block';content.style.display='none';return;}
  empty.style.display='none';content.style.display='block';

  const cajasFlete=Math.ceil(totalCajas);
  const palletsAuto=cajasFlete>=31?Math.ceil(cajasFlete/31):0;
  const fleteCajas=calcFlete(region,cajasFlete,palletsAuto)||0;
  const flete=fleteCajas+fletePallets;
  const seguro=totalValorFinal*SEGURO;
  const totalLog=flete+seguro;
  const pctLista=totalValorLista>0?totalLog/totalValorLista*100:0;
  const pctFinal=totalValorFinal>0?totalLog/totalValorFinal*100:0;
  const unidadesFlete=cajasFlete+palletsManual; // suma para mostrar
  const costoCaja=unidadesFlete>0?totalLog/unidadesFlete:totalLog;
  const pctV=pctFinal;

  const box=document.getElementById('sim-verdict-box');
  box.className='result-big '+(pctV<8?'green':pctV<15?'amber':'red');
  const el=n=>document.getElementById(n);
  el('sim-verdict-text').textContent=pctV<8?'Pedido rentable':pctV<15?'Margen ajustado':'Pedido no rentable';
  el('sim-verdict-text').style.color=pctV<8?COLORS.green:pctV<15?COLORS.amber:COLORS.red;
  el('sim-pct-val').textContent=pctLista.toFixed(1)+'%';
  el('sim-pct-val').style.color=pctLista<8?COLORS.green:pctLista<15?COLORS.amber:COLORS.red;
  el('sim-pct-val-desc').textContent=pctFinal.toFixed(1)+'%';
  el('sim-pct-val-desc').style.color=pctFinal<8?COLORS.green:pctFinal<15?COLORS.amber:COLORS.red;
  el('sim-costo-flete').textContent=peso(flete);
  const segLbl=el('sim-seguro-label'); if(segLbl) segLbl.textContent=`Seguro (${(SEGURO*100).toFixed(1).replace('.',',')}%)`;
  el('sim-seguro').textContent=peso(seguro);
  el('sim-total-log').textContent=peso(totalLog);
  el('sim-costo-caja').textContent=peso(costoCaja)+'/cj';
  el('sim-total-cajas').textContent=totalUnidades+' u · '+cajasFlete+' caja'+(cajasFlete>1?'s':'')+(palletsManual>0?' + '+palletsManual+' pallet'+(palletsManual>1?'s':''):'');
  el('sim-valor-mercaderia').textContent=peso(totalValorLista);

  const descTotal=totalValorLista-totalValorFinal;
  const rowD=el('sim-row-descuento'),rowF=el('sim-row-valor-final');
  if(rowD&&rowF){
    if(descTotal>0){
      rowD.style.display='flex';rowF.style.display='flex';
      el('sim-descuento-total').textContent='-'+peso(descTotal);
      el('sim-valor-final').textContent=peso(totalValorFinal);
    }else{rowD.style.display='none';rowF.style.display='none';}
  }

  const detEl=el('sim-productos-detalle');
  if(detEl&&productosUsados.length>0){detEl.textContent=productosUsados.join(' · ');detEl.style.display='block';}
  else if(detEl) detEl.style.display='none';

  // ---- SUGERENCIAS ACCIONABLES ----
  let sugerenciasHTML='';
  if(pctV>=8){
    const sugerencias=[];

    // SUGERENCIA 1: aumentar unidades de los productos ya cargados
    const productosCargados=simRows.filter(r=>r.productoId&&r.unidades>0)
      .map(r=>{
        const prod=listaPrecios.find(p=>String(p.id)===String(r.productoId));
        return prod?{prod,row:r}:null;
      }).filter(Boolean);

    for(const{prod,row} of productosCargados){
      const upb=parseFloat(prod.unidades_por_bulto)||1;
      const precioU=parseFloat(prod.precio_unidad)||0;
      const valorAporta=precioU*(1-row.descuento/100); // valor por unidad después de descuento

      // Probar agregando unidades hasta llegar al 8%
      for(let extraU=upb;extraU<=upb*30;extraU+=upb){ // siempre en múltiplos de unidades por bulto
        const newCajas=Math.ceil(totalCajas + extraU/upb);
        const newPallets=newCajas>=31?Math.ceil(newCajas/31):0;
        const newFlete=calcFlete(region,newCajas,newPallets)||0;
        const newValor=totalValorFinal + extraU*valorAporta;
        const newSeguro=newValor*SEGURO;
        const newPct=(newFlete+newSeguro)/newValor*100;
        if(newPct<8){
          const extraValor=extraU*valorAporta;
          sugerencias.push({
            tipo:'aumentar',
            texto:`Sumar <strong>${extraU} unidad${extraU>1?'es':''}</strong> más de <strong>${prod.descripcion}</strong> (+${peso(extraValor)})`,
            resultado:`Quedaría en <strong>${newPct.toFixed(1)}%</strong>`,
            extraU,
            extraValor
          });
          break;
        }
      }
    }

    // SUGERENCIA 2: agregar otro producto que no esté en el pedido
    const idsActuales=new Set(productosCargados.map(p=>String(p.prod.id)));
    const otrosProductos=listaPrecios.filter(p=>!idsActuales.has(String(p.id)));

    let mejorOtro=null;
    for(const prod of otrosProductos){
      const upb=parseFloat(prod.unidades_por_bulto)||1;
      const precioU=parseFloat(prod.precio_unidad)||0;
      if(!precioU||!upb) continue;

      for(let extraU=upb;extraU<=upb*30;extraU+=upb){
        const newCajas=Math.ceil(totalCajas + extraU/upb);
        const newPallets=newCajas>=31?Math.ceil(newCajas/31):0;
        const newFlete=calcFlete(region,newCajas,newPallets)||0;
        const newValor=totalValorFinal + extraU*precioU;
        const newSeguro=newValor*SEGURO;
        const newPct=(newFlete+newSeguro)/newValor*100;
        if(newPct<8){
          const extraValor=extraU*precioU;
          // Quedarme con el que requiera menor inversión adicional
          if(!mejorOtro || extraValor<mejorOtro.extraValor){
            mejorOtro={prod,extraU,extraValor,newPct};
          }
          break;
        }
      }
    }
    if(mejorOtro){
      sugerencias.push({
        tipo:'otro',
        texto:`Sumar <strong>${mejorOtro.extraU} unidad${mejorOtro.extraU>1?'es':''}</strong> de <strong>${mejorOtro.prod.descripcion}</strong> (+${peso(mejorOtro.extraValor)})`,
        resultado:`Quedaría en <strong>${mejorOtro.newPct.toFixed(1)}%</strong>`,
        extraValor:mejorOtro.extraValor
      });
    }

    // SUGERENCIA 3: aumentar valor del pedido manual (si lo usaron)
    if(cajasManual>0&&valorManual>0){
      // Buscar cuánto valor extra hace falta para llegar a 8% sin cambiar cajas
      const valNecesario=flete/(0.08-SEGURO);
      const valExtra=valNecesario-totalValorFinal;
      if(valExtra>0){
        sugerencias.push({
          tipo:'valor',
          texto:`Sumar <strong>${peso(valExtra)}</strong> en valor de mercadería (manteniendo las cajas)`,
          resultado:`Quedaría en <strong>~8%</strong>`,
          extraValor:valExtra
        });
      }
    }

    // Construir HTML
    if(sugerencias.length===0){
      sugerenciasHTML=`<div style="font-size:13px;color:var(--text2)">Para bajar al 8% necesitarías aumentar significativamente el valor del pedido o reducir descuentos.</div>`;
    }else{
      // Ordenar por menor inversión adicional
      sugerencias.sort((a,b)=>(a.extraValor||0)-(b.extraValor||0));
      const top=sugerencias.slice(0,3);
      sugerenciasHTML=`
        <div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">💡 Sugerencias para hacerlo rentable</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${top.map((s,i)=>`
            <div style="padding:10px 12px;background:rgba(37,99,235,0.05);border-left:3px solid var(--blue,#2563eb);border-radius:6px">
              <div style="font-size:13px;line-height:1.4;color:var(--text)">${i+1}. ${s.texto}</div>
              <div style="font-size:11px;color:var(--text2);margin-top:3px">→ ${s.resultado}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } else {
    sugerenciasHTML=`<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--green)"><span style="font-size:16px">✅</span><span>Este pedido es rentable.</span></div>`;
  }

  const tm=el('sim-threshold-msg');
  if(tm){
    tm.innerHTML=sugerenciasHTML;
    tm.style.padding='12px 14px';
    tm.style.background='var(--surface2)';
    tm.style.borderRadius='var(--radius)';
    tm.style.marginTop='14px';
  }
}


function renderSimThresh(){
  const el=document.getElementById('sim-thresh-tbody');if(!el)return;
  // Construir matriz: zona × rango de cajas con datos REALES
  const ranges=[[1,1,'1'],[2,3,'2-3'],[4,6,'4-6'],[7,10,'7-10'],[11,20,'11-20'],[21,30,'21-30'],[31,9999,'31+']];
  const zonas=Object.keys(TARIFF);
  // Agregamos datos reales por zona y rango
  const matriz={};
  zonas.forEach(z=>{
    matriz[z]={};
    ranges.forEach(([lo,hi,lbl])=>{
      const pedidos=allRows.filter(r=>r.region===z&&r.cajas>=lo&&r.cajas<=hi&&r.pct_log!=null);
      if(pedidos.length>0){
        const avg=pedidos.reduce((s,r)=>s+r.pct_log,0)/pedidos.length;
        matriz[z][lbl]={avg,n:pedidos.length};
      }else{
        matriz[z][lbl]=null;
      }
    });
  });
  el.innerHTML=zonas.map(z=>{
    const cells=ranges.map(([,,lbl])=>{
      const d=matriz[z][lbl];
      if(!d) return `<td class="num-right" style="color:var(--text3);font-size:11px">—</td>`;
      const cls=d.avg<8?'green':d.avg<15?'amber':'red';
      return `<td class="num-right">
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
          <span class="badge ${cls}" style="font-weight:600">${d.avg.toFixed(1)}%</span>
          <span style="font-size:9px;color:var(--text3)">${d.n} ped</span>
        </div>
      </td>`;
    }).join('');
    return `<tr><td><strong>${z}</strong></td>${cells}</tr>`;
  }).join('');
}

function calcBudget(){
  const b=parseFloat(document.getElementById('budget-input').value)||0;
  if(!b||!filteredRows.length){document.getElementById('budget-result').style.display='none';return;}
  const meses=[...new Set(filteredRows.map(r=>r.mes).filter(Boolean))];
  const avgReal=filteredRows.reduce((s,r)=>s+(r.total||0),0)/(meses.length||1);
  const desv=avgReal-b;const desvPct=b>0?desv/b*100:0;
  document.getElementById('budget-result').style.display='block';
  document.getElementById('b-pres').textContent=peso(b);
  document.getElementById('b-real').textContent=peso(avgReal);
  const desvEl=document.getElementById('b-desv');
  desvEl.textContent=peso(Math.abs(desv));desvEl.className='value '+(desv>0?'red':'green');
  document.getElementById('b-desv-pct').textContent=(desv>0?'+':'-')+Math.abs(desvPct).toFixed(1)+'% vs presupuesto';
}

function toggleSidebar(){
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sidebar-overlay').classList.toggle('open');
}
function closeSidebar(){
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay').classList.remove('open');
}

const pageTitles={dashboard:'Resumen',costos:'Costos',clientes:'Clientes',servicio:'Servicio',pedidos:'Pedidos',simulador:'Simulador',comparador:'Comparador',reglas:'Reglas de Venta'};
function switchPage(id,el){
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+id);
  if(pg){pg.style.display='block';setTimeout(()=>pg.classList.add('active'),10);}
  if(el)el.classList.add('active');
  document.getElementById('page-title').textContent=pageTitles[id]||id;
  if(id==='comparador')renderComparador();
  if(id==='reglas')renderReglasVenta();
  closeSidebar();
}

// ---- REGLAS DE VENTA ----
let reglasResults=[], reglasDesc=0; // compartido entre el cálculo y la tabla (buscador)

function renderReglasVenta(){
  const zonaSelect=document.getElementById('reglas-zona');
  const desc=parseInt(document.getElementById('reglas-desc')?.value)||0;
  const zona=zonaSelect?.value||'';
  const cont=document.getElementById('reglas-cont');
  const tabla=document.getElementById('reglas-tabla');
  if(!cont) return;
  if(!zona){
    cont.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text3);font-size:14px">Seleccioná una zona para ver los mínimos</div>`;
    if(tabla) tabla.style.display='none';
    reglasResults=[];
    return;
  }

  // Para cada producto calcular mínimo de unidades para llegar a 8% logístico
  const results=[];
  for(const prod of listaPrecios){
    if(!prod.precio_unidad||!prod.unidades_por_bulto) continue;
    const precioU=parseFloat(prod.precio_unidad);
    const upb=parseFloat(prod.unidades_por_bulto);
    if(!precioU||!upb) continue;

    // Para cada producto buscamos: mínimo de unidades para <8% (verde),
    // mínimo para <15% (no rojo) y el mejor caso alcanzable (piso de %).
    // El % logístico baja con el volumen hasta el bracket de tarifa más barato
    // y ahí se estanca; por eso si no llega al 8% mostramos igual el mejor caso.
    let min8=null, min15=null, floorU=null, floorPct=null;
    for(let u=upb;u<=upb*60;u+=upb){
      const cajas=u/upb;
      const valorLista=precioU*u;
      const valorFinal=valorLista*(1-desc/100);
      const flete=calcFlete(zona,Math.ceil(cajas),cajas>=31?Math.ceil(cajas/31):0)||0;
      if(flete<=0) continue;
      const totalLog=flete+valorFinal*SEGURO; // seguro sobre el valor con descuento (igual que el simulador)
      const pct=valorFinal>0?totalLog/valorFinal*100:999;
      if(floorPct==null||pct<floorPct-1e-9){floorPct=pct;floorU=u;}
      if(pct<8&&min8==null) min8={u,pct};
      if(pct<15&&min15==null) min15={u,pct};
    }
    // Nivel a mostrar: verde si llega a <8%, si no amarillo (<15%), si no el piso.
    const nivel = min8?{...min8,tier:'verde'} : min15?{...min15,tier:'amarillo'} : floorU!=null?{u:floorU,pct:floorPct,tier:'rojo'}:null;

    results.push({
      descripcion:prod.descripcion,
      sku:prod.sku,
      precioU,upb,
      rentable: !!min8,            // alcanza el objetivo <8%
      minU: nivel?nivel.u:null,    // unidades del nivel a mostrar
      pct: nivel?nivel.pct:null,
      tier: nivel?nivel.tier:null,
      cajas: nivel?Math.ceil(nivel.u/upb):null
    });
  }

  // Guardar para la tabla (que tiene su propio buscador, ver renderReglasTabla)
  reglasResults=results;
  reglasDesc=desc;

  // El cartel de "pedido mínimo en $" se quitó: dependía del mix de productos y
  // confundía (el mismo monto puede ser rentable o no según qué se venda). Para
  // el número exacto de un pedido puntual está el Simulador. Acá queda la tabla
  // exacta por producto (abajo).
  cont.innerHTML='';

  // Mostrar la tabla y dibujar sus filas. El buscador y el encabezado son HTML
  // estático, así no se pierde el foco al tipear; solo se redibuja el tbody.
  if(tabla) tabla.style.display='';
  renderReglasTabla();
}

// Dibuja las filas de la tabla de mínimos según el buscador (orden por código asc).
function renderReglasTabla(){
  const tbody=document.getElementById('reglas-tbody');
  const countEl=document.getElementById('reglas-count');
  if(!tbody) return;
  const desc=reglasDesc;
  const srch=(document.getElementById('reglas-search')?.value||'').trim().toLowerCase();
  const matchSearch=r=>!srch||String(r.descripcion||'').toLowerCase().includes(srch)||String(r.sku||'').toLowerCase().includes(srch);
  const skuNum=v=>{const n=parseFloat(String(v).replace(/[^0-9.]/g,''));return isNaN(n)?Infinity:n;};
  const visibles=reglasResults.filter(matchSearch).sort((a,b)=>skuNum(a.sku)-skuNum(b.sku));
  const rentables=visibles.filter(r=>r.rentable);
  if(countEl) countEl.textContent=`${srch?`${visibles.length} resultado${visibles.length===1?'':'s'} · `:''}${rentables.length} de ${visibles.length} llegan al 8%`;
  const badgeCls={verde:'green',amarillo:'amber',rojo:'red'};
  tbody.innerHTML=visibles.length===0?`
      <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3)">${srch?'Ningún producto coincide con la búsqueda.':'Sin productos cargados. Subí la lista de precios desde el admin.'}</td></tr>
    `:visibles.map(r=>{
      if(r.minU==null) return `
      <tr style="opacity:.6">
        <td class="num-right" style="font-size:12px;color:var(--text3)">${r.sku||'-'}</td>
        <td style="font-size:13px">${r.descripcion}</td>
        <td class="num-right" style="font-size:12px">$${Math.round(r.precioU).toLocaleString('es-AR')}</td>
        <td colspan="4" style="font-size:12px;color:var(--text3)">Sin tarifa para esta zona</td>
      </tr>`;
      const cls=badgeCls[r.tier]||'gray';
      const noVerde=!r.rentable; // alcanza el mejor caso (amarillo/rojo) pero no el 8%
      return `
      <tr${noVerde?' style="opacity:.85"':''}>
        <td class="num-right" style="font-size:12px;color:var(--text3)">${r.sku||'-'}</td>
        <td style="font-size:13px">${r.descripcion}</td>
        <td class="num-right" style="font-size:12px">$${Math.round(r.precioU).toLocaleString('es-AR')}</td>
        <td class="num-right"><strong>${r.minU}</strong> <span style="font-size:11px;color:var(--text3)">u</span></td>
        <td class="num-right">${r.cajas} cj</td>
        <td class="num-right" style="font-weight:600">$${Math.round(r.minU*r.precioU*(1-desc/100)).toLocaleString('es-AR')}</td>
        <td class="num-right"><span class="badge ${cls}"${noVerde?' title="Mejor caso posible en esta zona; no baja del 8%"':''}>${r.pct.toFixed(1)}%</span></td>
      </tr>`;
    }).join('');
}

window.addEventListener('DOMContentLoaded',loadData);
