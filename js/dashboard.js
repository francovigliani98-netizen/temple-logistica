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
  return {total,totalCajas,avgPct,otif,rojos,inc,diasKlozer,diasPrep,topRegion,pctCABA,count:rows.length,promPedido:rows.length?total/rows.length:0,promCaja:totalCajas?total/totalCajas:0};
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
    try{ await withTimeout(loadPrices(),5000); }catch(e){ console.warn('loadPrices timeout',e); }
    try{ await withTimeout(loadTarifario(),5000); }catch(e){ console.warn('loadTarifario timeout',e); }

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
    const{data,error}=await supabaseClient.from('pedido_productos').select('pid,mes,producto,cantidad');
    if(error||!data){mixData=[];return;}
    mixData=data;
  }catch(e){ mixData=[]; }
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
  // Calcular métricas del mes anterior para deltas
  let prevRows=null;
  if(mes){
    const mesesDisp=sortMeses([...new Set(allRows.map(r=>r.mes).filter(Boolean))]);
    const idx=mesesDisp.indexOf(mes);
    if(idx>0)prevRows=allRows.filter(r=>r.mes===mesesDisp[idx-1]);
  }
  const m=calcMetrics(rows);
  const p=prevRows?calcMetrics(prevRows):null;

  const dTotal=p?getDelta(m.total,p.total,false):null;
  const dProm=p?getDelta(m.promPedido,p.promPedido,false):null;
  const dPct=p?getDelta(m.avgPct,p.avgPct,false):null;  // menor es mejor
  const dOtif=p?getDelta(m.otif,p.otif,true):null;       // mayor es mejor
  const dRojos=p?getDelta(m.rojos,p.rojos,false):null;
  const dInc=p?getDelta(m.inc,p.inc,false):null;
  const incAbril=rows.filter(r=>r.total_abril!=null).reduce((s,r)=>s+((r.total_abril||0)-(r.total||0)),0);

  document.getElementById('kpi-grid').innerHTML=`
    <div class="kpi-card accent">
      <div class="label">Gasto total</div>
      <div class="value">${peso(m.total)}</div>
      <div class="sub">${m.count} pedidos · ${m.totalCajas} cajas</div>
      ${deltaChip(dTotal)}
    </div>
    <div class="kpi-card accent">
      <div class="label">Promedio por pedido</div>
      <div class="value">${peso(m.promPedido)}</div>
      <div class="sub">${(m.totalCajas/(m.count||1)).toFixed(1)} cajas prom.</div>
      ${deltaChip(dProm)}
    </div>
    <div class="kpi-card accent-${m.avgPct<8?'green':m.avgPct<15?'amber':'red'}">
      <div class="label">% logístico prom.</div>
      <div class="value" style="color:var(--${m.avgPct<8?'green':m.avgPct<15?'amber':'red'})">${m.avgPct.toFixed(1)}%</div>
      <div class="sub">s/ valor mercadería</div>
      ${deltaChip(dPct)}
    </div>
    <div class="kpi-card accent-green">
      <div class="label">OTIF Klozer</div>
      <div class="value" style="color:var(--green)">${m.otif.toFixed(1)}%</div>
      <div class="sub">Despacho → entrega ≤1 día</div>
      ${deltaChip(dOtif,true)}
    </div>
    <div class="kpi-card accent-red">
      <div class="label">Pedidos rojos</div>
      <div class="value" style="color:var(--red)">${m.rojos}</div>
      <div class="sub">${m.count?(m.rojos/m.count*100).toFixed(0):0}% del total &gt;15%</div>
      ${deltaChip(dRojos)}
    </div>
    <div class="kpi-card ${m.inc>0?'accent-amber':''}">
      <div class="label">Incidencias</div>
      <div class="value ${m.inc>0?'amber':''}">${m.inc}</div>
      <div class="sub">${m.count?(m.inc/m.count*100).toFixed(1):0}% tasa</div>
      ${deltaChip(dInc)}
    </div>
    <div class="kpi-card accent-amber">
      <div class="label">Impacto tarifa</div>
      <div class="value" style="color:var(--amber)">+${peso(incAbril)}</div>
      <div class="sub">incremento estimado</div>
      <span class="kpi-delta neutral">—</span>
    </div>
    <div class="kpi-card">
      <div class="label">Costo por caja</div>
      <div class="value">${m.totalCajas?peso(m.total/m.totalCajas):'-'}</div>
      <div class="sub">promedio del período</div>
      ${p&&p.totalCajas?deltaChip(getDelta(m.total/m.totalCajas,p.total/p.totalCajas,false)):'<span class="kpi-delta neutral">—</span>'}
    </div>`;
}

// ---- CHARTS ----
function dc(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
function mkChart(id,config){dc(id);const el=document.getElementById(id);if(!el)return;charts[id]=new Chart(el,config);}
const COLORS={blue:'#2563eb',green:'#16a34a',amber:'#d97706',red:'#dc2626',teal:'#0d9488',purple:'#7c3aed',navy:'#1e3a5f',gray:'#64748b',greenL:'rgba(22,163,74,0.1)',redL:'rgba(220,38,38,0.1)'};
const gridC='rgba(0,0,0,0.05)',textC='#94a3b8';

function renderChartsMain(){
  const rows=filteredRows;
  // Gasto mensual
  const mesMap={};rows.forEach(r=>{if(r.mes)mesMap[r.mes]=(mesMap[r.mes]||0)+(r.total||0);});
  const mL=sortMeses(Object.keys(mesMap));
  mkChart('c-mensual',{type:'bar',data:{labels:mL,datasets:[{data:mL.map(m=>Math.round(mesMap[m]||0)),backgroundColor:COLORS.blue,borderRadius:4,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'$'+Math.round(c.raw).toLocaleString('es-AR')}}},
      scales:{x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}}},y:{grid:{color:gridC},ticks:{color:textC,font:{size:11},callback:v=>'$'+Math.round(v/1000)+'k'}}}}});
  // Semáforo
  const v=rows.filter(r=>r.semaforo==='verde').length,am=rows.filter(r=>r.semaforo==='amarillo').length,ro=rows.filter(r=>r.semaforo==='rojo').length;
  mkChart('c-semaforo',{type:'doughnut',data:{labels:['Verde (<8%)','Amarillo (8-15%)','Rojo (>15%)'],datasets:[{data:[v,am,ro],backgroundColor:[COLORS.green,COLORS.amber,COLORS.red],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12,padding:10}},tooltip:{callbacks:{label:c=>`${c.label}: ${c.raw} pedidos`}}}}});
  // Región
  const regMap={};rows.forEach(r=>{if(r.region)regMap[r.region]=(regMap[r.region]||0)+(r.total||0);});
  const rL=Object.keys(regMap).sort((a,b)=>regMap[b]-regMap[a]).slice(0,8);
  mkChart('c-region',{type:'bar',data:{labels:rL,datasets:[{data:rL.map(r=>Math.round(regMap[r])),backgroundColor:COLORS.teal,borderRadius:4,borderSkipped:false}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'$'+Math.round(c.raw).toLocaleString('es-AR')}}},
      scales:{x:{grid:{color:gridC},ticks:{color:textC,font:{size:10},callback:v=>'$'+Math.round(v/1000)+'k'}},y:{grid:{display:false},ticks:{color:textC,font:{size:10}}}}}});
  // % logístico por tamaño
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
  // ---- MIX DE PRODUCTOS POR MES (barras apiladas) ----
  const mesFiltro=document.getElementById('filter-mes').value;
  // Filtrar mixData por mes si hay filtro global
  const mixFilt=mesFiltro?mixData.filter(r=>r.mes===mesFiltro):mixData;
  // Agrupar: mes → producto → cantidad total
  const mixMap={};
  mixFilt.forEach(r=>{
    if(!r.mes||!r.producto)return;
    if(!mixMap[r.mes])mixMap[r.mes]={};
    mixMap[r.mes][r.producto]=(mixMap[r.mes][r.producto]||0)+(parseFloat(r.cantidad)||0);
  });
  const mixMeses=sortMeses(Object.keys(mixMap));
  // Obtener todos los productos únicos ordenados por volumen total
  const prodTotals={};
  mixFilt.forEach(r=>{if(r.producto)prodTotals[r.producto]=(prodTotals[r.producto]||0)+(parseFloat(r.cantidad)||0);});
  const mixProds=Object.keys(prodTotals).sort((a,b)=>prodTotals[b]-prodTotals[a]);
  const mixColors=[COLORS.blue,COLORS.teal,COLORS.amber,COLORS.purple,COLORS.red,COLORS.green,COLORS.navy,COLORS.gray];
  if(mixMeses.length>0&&mixProds.length>0){
    mkChart('c-mix-productos',{
      type:'bar',
      data:{
        labels:mixMeses,
        datasets:mixProds.map((prod,i)=>({
          label:prod,
          data:mixMeses.map(m=>Math.round(mixMap[m]?.[prod]||0)),
          backgroundColor:mixColors[i%mixColors.length],
          borderRadius:i===0?4:0,
          borderSkipped:false,
          stack:'mix'
        }))
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12,padding:10}},
          tooltip:{callbacks:{
            label:c=>`${c.dataset.label}: ${c.raw} cajas`,
            footer:items=>{const tot=items.reduce((s,i)=>s+i.raw,0);return `Total: ${tot} cajas`;}
          }}
        },
        scales:{
          x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}},stacked:true},
          y:{grid:{color:gridC},ticks:{color:textC,font:{size:11}},stacked:true,
            title:{display:true,text:'Cajas',color:textC,font:{size:11}}}
        }
      }
    });
    document.getElementById('c-mix-productos-wrap').style.display='block';
  } else {
    document.getElementById('c-mix-productos-wrap').style.display='none';
  }

  // Incidencia logística vs tiempo
  const mesIncMap={};
  rows.forEach(r=>{
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

function renderChartsCostos(){
  const rows=filteredRows;
  // % por producto
  const prodKeywords={'Cerveza':['CERVEZA','IPA','STOUT','PORTER','ALE','LAGER'],'Gin':['GIN','BOSQUE','ALTA MONTA'],'Vermú':['VERMÚ','VERMU','FERIADO'],'Barril':['BARRIL']};
  const prodPct={};
  rows.forEach(r=>{
    let found='Otro';
    for(const[k,kws]of Object.entries(prodKeywords)){if(kws.some(kw=>(r.productos||'').toUpperCase().includes(kw))){found=k;break;}}
    if(!prodPct[found])prodPct[found]=[];
    if(r.pct_log!=null)prodPct[found].push(r.pct_log);
  });
  const pL=Object.keys(prodPct),pAvg=pL.map(k=>prodPct[k].length?Math.round(prodPct[k].reduce((s,v)=>s+v,0)/prodPct[k].length*10)/10:0);
  mkChart('c-producto',{type:'bar',data:{labels:pL,datasets:[{data:pAvg,backgroundColor:pL.map((_,i)=>[COLORS.blue,COLORS.teal,COLORS.amber,COLORS.purple,COLORS.gray][i%5]),borderRadius:4,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.raw}% logístico`}}},
      scales:{x:{grid:{display:false},ticks:{color:textC,font:{size:11}}},y:{grid:{color:gridC},ticks:{color:textC,font:{size:11},callback:v=>v+'%'},min:0}}}});
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
  const dias=n=>n.toFixed(1)+' d';

  document.getElementById('cmp-header-a').textContent=mesA;
  document.getElementById('cmp-header-b').textContent=mesB;

  document.getElementById('cmp-tbody').innerHTML=[
    cmpRow('Pedidos totales',    mA.count,        mB.count,        num, false),
    cmpRow('Gasto total',        mA.total,         mB.total,         p,   false),
    cmpRow('Prom. por pedido',   mA.promPedido,    mB.promPedido,    p,   false),
    cmpRow('Prom. por caja',     mA.promCaja,      mB.promCaja,      p,   false),
    cmpRow('Cajas totales',      mA.totalCajas,    mB.totalCajas,    num, true),
    cmpRow('% logístico prom.',  mA.avgPct,        mB.avgPct,        pct, false),
    cmpRow('OTIF',               mA.otif,          mB.otif,          pct, true),
    cmpRow('Pedidos rojos',      mA.rojos,         mB.rojos,         num, false),
    cmpRow('Incidencias',        mA.inc,           mB.inc,           num, false),
    cmpRow('Días prom. Klozer',  mA.diasKlozer,    mB.diasKlozer,    dias,false),
    cmpRow('Días prom. prep.',   mA.diasPrep,      mB.diasPrep,      dias,false),
    cmpRow('% CABA del total',   mA.pctCABA,       mB.pctCABA,       pct, false),
  ].join('');

  // Gráfico radar de comparación
  const radarLabels=['Gasto','Cajas prom.','% logístico','OTIF','Rojos','Klozer días'];
  const normalize=(v,max)=>max>0?Math.round(v/max*100):0;
  const maxTotal=Math.max(mA.total,mB.total)||1;
  const maxCaja=Math.max(mA.totalCajas/mA.count,mB.totalCajas/mB.count)||1;
  const maxPct=Math.max(mA.avgPct,mB.avgPct)||1;
  const maxKlz=Math.max(mA.diasKlozer,mB.diasKlozer)||1;
  const dA=[normalize(mA.total,maxTotal),normalize(mA.totalCajas/mA.count,maxCaja),100-normalize(mA.avgPct,maxPct),Math.round(mA.otif),100-normalize(mA.rojos,Math.max(mA.rojos,mB.rojos)||1),100-normalize(mA.diasKlozer,maxKlz)];
  const dB=[normalize(mB.total,maxTotal),normalize(mB.totalCajas/mB.count,maxCaja),100-normalize(mB.avgPct,maxPct),Math.round(mB.otif),100-normalize(mB.rojos,Math.max(mA.rojos,mB.rojos)||1),100-normalize(mB.diasKlozer,maxKlz)];
  mkChart('c-radar-cmp',{type:'radar',data:{labels:radarLabels,datasets:[
    {label:mesA,data:dA,borderColor:COLORS.blue,backgroundColor:'rgba(37,99,235,0.2)',pointBackgroundColor:COLORS.blue,pointRadius:5,borderWidth:2.5},
    {label:mesB,data:dB,borderColor:COLORS.amber,backgroundColor:'rgba(217,119,6,0.2)',pointBackgroundColor:COLORS.amber,pointRadius:5,borderWidth:2.5}
  ]},options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12}}},
    scales:{r:{grid:{color:gridC},ticks:{display:false},pointLabels:{color:textC,font:{size:11}},min:0,max:100}}}});
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
    <div class="rank-val">${peso(d.gasto)}</div></div>`).join('');
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
  document.getElementById('main-tbody').innerHTML=filtered.slice(0,300).map(r=>`
    <tr><td>${r.pid||''}</td><td>${fmtD(r.fecha)}</td><td>${r.mes||''}</td>
    <td title="${r.razon_social||r.dest}">${r.razon_social||r.dest||''}</td><td>${r.region||''}</td>
    <td class="num-right">${r.cajas||0}</td><td class="num-right">${peso(r.val_decl)}</td>
    <td class="num-right">${peso(r.total)}</td>
    <td>${r.pct_log!=null?`<span class="badge ${r.semaforo}">${r.pct_log.toFixed(1)}%</span>`:'-'}</td>
    <td>${r.otif?`<span class="badge ${r.otif==='Sí'?'green':'red'}">${r.otif}</span>`:'-'}</td>
    <td class="num-right">${r.dias_klozer!=null?r.dias_klozer+' d':'-'}</td>
    <td><span class="badge ${r.estado==='Entregado'?'green':r.estado==='Devuelto'?'red':r.estado?'amber':'gray'}">${r.estado||'-'}</span></td></tr>`).join('')||
    '<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--text3)">Sin resultados</td></tr>';
  renderRankingPedidos(filtered);
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
    return `<tr>
      <td><strong>${i+1}</strong></td>
      <td>${r.pid||''}</td>
      <td title="${r.razon_social||r.dest}">${r.razon_social||r.dest||'-'}</td>
      <td>${r.region||'-'}</td>
      <td class="num-right">${r.cajas||0}</td>
      <td class="num-right"><strong>${peso(r.total)}</strong></td>
      <td>${r.pct_log!=null?`<span class="badge ${r.semaforo}">${r.pct_log.toFixed(1)}%</span>`:'-'}</td>
      <td style="line-height:1.6">${causasHtml}<div style="font-size:11px;color:var(--text3);margin-top:2px">${causas[0].det}</div></td>
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
  let totalCajas=0,totalValor=0,productosUsados=[];
  for(const[nombre,prod]of Object.entries(PRODUCTS)){
    const qty=parseInt(document.getElementById(prod.key)?.value)||0;
    if(qty>0){totalCajas+=qty;totalValor+=qty*prod.price;productosUsados.push(`${qty} ${nombre}`);}
  }
  const valorManual=parseFloat(document.getElementById('sim-valor-manual')?.value)||0;
  const cajasManual=parseInt(document.getElementById('sim-cajas-manual')?.value)||0;
  if(cajasManual>0&&valorManual>0){totalCajas+=cajasManual;totalValor+=valorManual;}
  if(totalCajas===0||totalValor===0){empty.style.display='block';content.style.display='none';return;}
  empty.style.display='none';content.style.display='block';
  const pallets=totalCajas>=31?Math.ceil(totalCajas/31):0;
  const flete=calcFlete(region,totalCajas,pallets)||0;
  const seguro=totalValor*0.012;
  const totalLog=flete+seguro;
  const pctL=totalValor>0?totalLog/totalValor*100:0;
  const costoCaja=totalCajas>0?totalLog/totalCajas:totalLog;
  const box=document.getElementById('sim-verdict-box');
  box.className='result-big '+(pctL<8?'green':pctL<15?'amber':'red');
  const color=pctL<8?COLORS.green:pctL<15?COLORS.amber:COLORS.red;
  document.getElementById('sim-verdict-text').textContent=pctL<8?'Pedido rentable':pctL<15?'Margen ajustado':'Pedido no rentable';
  document.getElementById('sim-verdict-text').style.color=color;
  document.getElementById('sim-pct-val').textContent=pctL.toFixed(1)+'%';
  document.getElementById('sim-pct-val').style.color=color;
  document.getElementById('sim-costo-flete').textContent=peso(flete);
  document.getElementById('sim-seguro').textContent=peso(seguro);
  document.getElementById('sim-total-log').textContent=peso(totalLog);
  document.getElementById('sim-costo-caja').textContent=peso(costoCaja)+'/cj';
  document.getElementById('sim-total-cajas').textContent=totalCajas+' cajas';
  document.getElementById('sim-valor-mercaderia').textContent=peso(totalValor);
  const detEl=document.getElementById('sim-productos-detalle');
  if(productosUsados.length>0){detEl.textContent=productosUsados.join(' · ');detEl.style.display='block';}
  else detEl.style.display='none';
  let msg='';
  if(pctL>=8){
    for(let c=totalCajas+1;c<=50;c++){
      const pUnit=totalCajas>0?totalValor/totalCajas:0;
      const extraVal=(c-totalCajas)*pUnit;
      const f2=calcFlete(region,c,c>=31?Math.ceil(c/31):0)||0;
      const tot2=f2+(totalValor+extraVal)*0.012;
      const pct2=tot2/(totalValor+extraVal)*100;
      if(pct2<8){msg=`Agregando ${c-totalCajas} cajas más (total ${c}) quedaría en ${pct2.toFixed(1)}% logístico.`;break;}
    }
    if(!msg)msg='Para bajar al 8%, aumentá el valor de la mercadería o consolidá con otro pedido al mismo destino.';
  }else msg=`Este pedido es rentable con ${totalCajas} caja${totalCajas>1?'s':''}.`;
  document.getElementById('sim-threshold-msg').textContent=msg;
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

const pageTitles={dashboard:'Resumen',costos:'Costos',clientes:'Clientes',servicio:'Servicio',pedidos:'Pedidos',simulador:'Simulador',comparador:'Comparador'};
function switchPage(id,el){
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+id);
  if(pg){pg.style.display='block';setTimeout(()=>pg.classList.add('active'),10);}
  if(el)el.classList.add('active');
  document.getElementById('page-title').textContent=pageTitles[id]||id;
  if(id==='comparador')renderComparador();
}

window.addEventListener('DOMContentLoaded',loadData);
