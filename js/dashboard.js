// ============================================================
// DASHBOARD.JS — v3.0
// Novedades: tarifario visual en simulador, ordenamiento tabla
// pedidos (clic en header + selector), precios desde Supabase
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
const TARIFF_HEADERS = ['1 caja','2-3 cajas','4-6 cajas','7-10 cajas','11-20 cajas','21-30 cajas','Pallet x1','Pallet x2'];

// Precios por defecto — se sobreescriben con los de Supabase si existen
let PRODUCTS = {
  'Cerveza':            { price: 13821,  key: 'sim-qty-cerveza' },
  'Vermú 750ml':        { price: 52290,  key: 'sim-qty-vermu' },
  'Gin 500ml':          { price: 54390,  key: 'sim-qty-gin500' },
  'Gin 750ml':          { price: 81585,  key: 'sim-qty-gin750' },
  'Alta Montaña 750ml': { price: 122378, key: 'sim-qty-alta' },
};

let allRows = [], filteredRows = [], charts = {};
let sortCol = 'fecha', sortDir = 'desc';

// ---- UTILIDADES ----
function peso(n) {
  if (n==null||isNaN(n)) return '-';
  return '$'+Math.round(n).toLocaleString('es-AR');
}
function fmtD(s) {
  if (!s) return '';
  try { return new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}); }
  catch { return s; }
}
function getTarifa(region, cajas) {
  const t = TARIFF[region]; if (!t) return null;
  const i = cajas<=1?0:cajas<=3?1:cajas<=6?2:cajas<=10?3:cajas<=20?4:cajas<=30?5:6;
  return t[i];
}
function calcFlete(region, cajas, pallets) {
  if (pallets>=1) { const t=TARIFF[region]; if(t&&t[6]) return t[6]*pallets; }
  const u = getTarifa(region, cajas);
  return u ? u*cajas : null;
}
function sortMeses(meses) {
  const mo={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,octubre:10,noviembre:11,diciembre:12};
  return meses.sort((a,b)=>{
    const partsA=a.toLowerCase().split(' '), partsB=b.toLowerCase().split(' ');
    const yA=parseInt(partsA[partsA.length-1])||0, yB=parseInt(partsB[partsB.length-1])||0;
    if(yA!==yB) return yA-yB;
    return (mo[partsA[0]]||0)-(mo[partsB[0]]||0);
  });
}

// ---- CARGA DE DATOS ----
async function loadData() {
  showLoading(true);
  try {
    // Cargar precios actualizados desde Supabase si existen
    await loadPrices();

    let allData=[], from=0;
    while(true) {
      const {data,error} = await supabaseClient.from('pedidos').select('*').range(from,from+999).order('fecha',{ascending:true});
      if(error) throw error;
      allData=allData.concat(data||[]);
      if(!data||data.length<1000) break;
      from+=1000;
    }
    if(!allData.length){showLoading(false);showEmptyState();return;}
    allRows=allData;
    populateFilters();
    applyGlobalFilter();
    renderSimThresh();
    renderTarifario();
    showLoading(false);
  } catch(err) {
    showLoading(false);
    showError('No se pudo conectar con la base de datos.');
    console.error(err);
  }
}

async function loadPrices() {
  try {
    const {data} = await supabaseClient.from('precios').select('*');
    if(data && data.length) {
      data.forEach(p => {
        if(PRODUCTS[p.producto]) PRODUCTS[p.producto].price = p.precio;
      });
    }
  } catch(e) { /* tabla puede no existir todavía, usar defaults */ }
}

function showLoading(show){document.getElementById('loading-overlay').classList.toggle('hidden',!show);}
function showEmptyState(){document.getElementById('empty-state').style.display='flex';document.getElementById('page-dashboard').style.display='none';}
function showError(msg){const el=document.getElementById('error-banner');if(el){el.textContent=msg;el.style.display='block';}}

function populateFilters() {
  const mesesRaw=[...new Set(allRows.map(r=>r.mes).filter(Boolean))];
  const meses=sortMeses(mesesRaw);
  document.getElementById('filter-mes').innerHTML='<option value="">Todos los meses</option>'+meses.map(m=>`<option>${m}</option>`).join('');
  const regs=[...new Set(allRows.map(r=>r.region).filter(Boolean))].sort();
  const fReg=document.getElementById('f-region');
  if(fReg) fReg.innerHTML='<option value="">Todas las regiones</option>'+regs.map(r=>`<option>${r}</option>`).join('');
  const fechas=allRows.map(r=>r.fecha).filter(Boolean).sort();
  if(fechas.length){
    const desde=fmtD(fechas[0]),hasta=fmtD(fechas[fechas.length-1]);
    document.getElementById('period-chip').textContent=desde===hasta?desde:`${desde} — ${hasta}`;
  }
  const chip=document.getElementById('total-pedidos-chip');
  if(chip) chip.textContent=allRows.length+' pedidos';
}

function applyGlobalFilter(){
  const mes=document.getElementById('filter-mes').value;
  filteredRows=mes?allRows.filter(r=>r.mes===mes):allRows;
  renderAll();
}

function renderAll(){
  renderKPIs();renderChartsMain();renderChartsCostos();
  renderChartsClientes();renderChartsServicio();renderTable();renderThresholds();
}

// ---- KPIs ----
function renderKPIs(){
  const rows=filteredRows;
  const total=rows.reduce((s,r)=>s+(r.total||0),0);
  const valid=rows.filter(r=>r.pct_log!=null);
  const avgPct=valid.length?valid.reduce((s,r)=>s+(r.pct_log||0),0)/valid.length:0;
  const otifRows=rows.filter(r=>r.otif!=='');
  const otif=otifRows.length?otifRows.filter(r=>r.otif==='Sí').length/otifRows.length*100:0;
  const rojos=rows.filter(r=>r.semaforo==='rojo').length;
  const inc=rows.filter(r=>r.incidencia==='Sí').length;
  const totalCajas=rows.reduce((s,r)=>s+(r.cajas||0),0);
  const incAbril=rows.filter(r=>r.total_abril!=null).reduce((s,r)=>s+((r.total_abril||0)-(r.total||0)),0);
  document.getElementById('kpi-grid').innerHTML=`
    <div class="kpi-card accent"><div class="label">Gasto total</div><div class="value">${peso(total)}</div><div class="sub">${rows.length} pedidos · ${totalCajas} cajas</div></div>
    <div class="kpi-card accent"><div class="label">Promedio por pedido</div><div class="value">${peso(rows.length?total/rows.length:0)}</div><div class="sub">${(totalCajas/(rows.length||1)).toFixed(1)} cajas prom.</div></div>
    <div class="kpi-card accent-${avgPct<8?'green':avgPct<15?'amber':'red'}"><div class="label">% logístico prom.</div><div class="value" style="color:var(--${avgPct<8?'green':avgPct<15?'amber':'red'})">${avgPct.toFixed(1)}%</div><div class="sub">s/ valor mercadería</div></div>
    <div class="kpi-card accent-green"><div class="label">OTIF Klozer</div><div class="value" style="color:var(--green)">${otif.toFixed(1)}%</div><div class="sub">Despacho → entrega ≤1 día</div></div>
    <div class="kpi-card accent-red"><div class="label">Pedidos rojos</div><div class="value" style="color:var(--red)">${rojos}</div><div class="sub">${rows.length?(rojos/rows.length*100).toFixed(0):0}% del total &gt;15%</div></div>
    <div class="kpi-card ${inc>0?'accent-amber':''}"><div class="label">Incidencias</div><div class="value ${inc>0?'amber':''}">${inc}</div><div class="sub">${rows.length?(inc/rows.length*100).toFixed(1):0}% tasa</div></div>
    <div class="kpi-card accent-amber"><div class="label">Impacto tarifa</div><div class="value" style="color:var(--amber)">+${peso(incAbril)}</div><div class="sub">incremento estimado</div></div>
    <div class="kpi-card"><div class="label">Costo por caja</div><div class="value">${totalCajas?peso(total/totalCajas):'-'}</div><div class="sub">promedio del período</div></div>`;
}

// ---- CHARTS ----
function dc(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
function mkChart(id,config){dc(id);const el=document.getElementById(id);if(!el)return;charts[id]=new Chart(el,config);}
const COLORS={blue:'#2563eb',green:'#16a34a',amber:'#d97706',red:'#dc2626',teal:'#0d9488',purple:'#7c3aed',navy:'#1e3a5f',gray:'#64748b',greenL:'rgba(22,163,74,0.1)',redL:'rgba(220,38,38,0.1)'};
const gridC='rgba(0,0,0,0.05)',textC='#94a3b8';

function renderChartsMain(){
  const rows=filteredRows;
  const mesMap={};rows.forEach(r=>{if(r.mes)mesMap[r.mes]=(mesMap[r.mes]||0)+(r.total||0);});
  const mL=sortMeses(Object.keys(mesMap));
  mkChart('c-mensual',{type:'bar',data:{labels:mL,datasets:[{data:mL.map(m=>Math.round(mesMap[m]||0)),backgroundColor:COLORS.blue,borderRadius:4,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'$'+Math.round(c.raw).toLocaleString('es-AR')}}},
      scales:{x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}}},y:{grid:{color:gridC},ticks:{color:textC,font:{size:11},callback:v=>'$'+Math.round(v/1000)+'k'}}}}});
  const v=rows.filter(r=>r.semaforo==='verde').length,am=rows.filter(r=>r.semaforo==='amarillo').length,ro=rows.filter(r=>r.semaforo==='rojo').length;
  mkChart('c-semaforo',{type:'doughnut',data:{labels:['Verde (<8%)','Amarillo (8-15%)','Rojo (>15%)'],datasets:[{data:[v,am,ro],backgroundColor:[COLORS.green,COLORS.amber,COLORS.red],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',labels:{color:textC,font:{size:11},boxWidth:12,padding:10}},tooltip:{callbacks:{label:c=>`${c.label}: ${c.raw} pedidos`}}}}});
  const regMap={};rows.forEach(r=>{if(r.region)regMap[r.region]=(regMap[r.region]||0)+(r.total||0);});
  const rL=Object.keys(regMap).sort((a,b)=>regMap[b]-regMap[a]).slice(0,8);
  mkChart('c-region',{type:'bar',data:{labels:rL,datasets:[{data:rL.map(r=>Math.round(regMap[r])),backgroundColor:COLORS.teal,borderRadius:4,borderSkipped:false}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'$'+Math.round(c.raw).toLocaleString('es-AR')}}},
      scales:{x:{grid:{color:gridC},ticks:{color:textC,font:{size:10},callback:v=>'$'+Math.round(v/1000)+'k'}},y:{grid:{display:false},ticks:{color:textC,font:{size:10}}}}}});
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
}

function renderChartsCostos(){
  const rows=filteredRows;
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
  const mesMap={};rows.forEach(r=>{if(r.mes)mesMap[r.mes]=(mesMap[r.mes]||0)+(r.total||0);});
  const mL=sortMeses(Object.keys(mesMap));
  let acc=0;
  mkChart('c-acumulado',{type:'line',data:{labels:mL,datasets:[{data:mL.map(m=>{acc+=mesMap[m]||0;return Math.round(acc);}),borderColor:COLORS.navy,backgroundColor:'rgba(30,58,95,0.08)',fill:true,tension:0.2,pointRadius:5,pointBackgroundColor:COLORS.navy}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'$'+Math.round(c.raw).toLocaleString('es-AR')}}},
      scales:{x:{grid:{color:gridC},ticks:{color:textC,font:{size:11}}},y:{grid:{color:gridC},ticks:{color:textC,font:{size:11},callback:v=>'$'+Math.round(v/1000)+'k'}}}}});
  renderThresholds();
}

function renderThresholds(){
  const tbody=document.getElementById('thresh-tbody');if(!tbody)return;
  const prices=Object.values(PRODUCTS).map(p=>p.price).slice(0,4);
  tbody.innerHTML=Object.keys(TARIFF).map(z=>{
    const t=TARIFF[z];
    const mins=prices.map(p=>{for(let c=1;c<=31;c++){const u=getTarifa(z,c);if(u&&p>0&&(u/p)<0.08)return c;}return '>30';});
    return `<tr><td><strong>${z}</strong></td>${mins.map(m=>`<td class="num-right"><span class="badge ${m==='>30'?'red':m>15?'amber':'green'}">${m} cj</span></td>`).join('')}<td class="num-right">$${Math.round(t[0]).toLocaleString('es-AR')}</td></tr>`;
  }).join('');
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
    return {name,pedidos:d.pedidos,rojos:d.rojos,pctRojos:d.rojos/d.pedidos*100,avgCajas:d.cajas/(d.pedidos||1),avgPct,region:rows.find(r=>(r.razon_social||r.dest)===name)?.region||''};
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

// ---- TABLA PEDIDOS CON ORDENAMIENTO (FIX 3) ----
function sortTable(col) {
  if(sortCol===col) sortDir=sortDir==='asc'?'desc':'asc';
  else { sortCol=col; sortDir=col==='fecha'?'desc':'asc'; }
  renderTable();
  // Actualizar indicadores visuales
  document.querySelectorAll('th[data-sort]').forEach(th=>{
    th.querySelector('.sort-icon').textContent = th.dataset.sort===sortCol ? (sortDir==='asc'?'↑':'↓') : '↕';
  });
}

function renderTable(){
  const mes=document.getElementById('filter-mes').value;
  const reg=document.getElementById('f-region')?.value||'';
  const sem=document.getElementById('f-semaforo')?.value||'';
  const est=document.getElementById('f-estado')?.value||'';
  const srch=(document.getElementById('f-search')?.value||'').toLowerCase();
  const orden=document.getElementById('f-orden')?.value||'pct_log_desc';

  let filtered=allRows.filter(r=>
    (!mes||r.mes===mes)&&(!reg||r.region===reg)&&
    (!sem||r.semaforo===sem)&&(!est||r.estado===est)&&
    (!srch||(r.dest||'').toLowerCase().includes(srch)||(r.razon_social||'').toLowerCase().includes(srch))
  );

  // Ordenamiento por selector o por clic en header
  const effectiveCol = sortCol;
  const effectiveDir = sortDir;
  filtered.sort((a,b)=>{
    let vA=a[effectiveCol], vB=b[effectiveCol];
    if(effectiveCol==='fecha'){vA=vA||'';vB=vB||'';}
    if(vA==null) return 1; if(vB==null) return -1;
    if(typeof vA==='string') return effectiveDir==='asc'?vA.localeCompare(vB):vB.localeCompare(vA);
    return effectiveDir==='asc'?vA-vB:vB-vA;
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
}

// ---- TARIFARIO VISUAL (FIX 1) ----
function renderTarifario(){
  const el=document.getElementById('tarifario-tbody'); if(!el) return;
  el.innerHTML=Object.entries(TARIFF).map(([zona,precios])=>`
    <tr>
      <td><strong>${zona}</strong></td>
      ${precios.map((p,i)=>p!=null
        ? `<td class="num-right">$${Math.round(p).toLocaleString('es-AR')}</td>`
        : `<td class="num-right" style="color:var(--text3)">—</td>`
      ).join('')}
    </tr>`).join('');
}

// ---- SIMULADOR ----
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
  } else msg=`Este pedido es rentable con ${totalCajas} caja${totalCajas>1?'s':''}.`;
  document.getElementById('sim-threshold-msg').textContent=msg;
}

function renderSimThresh(){
  const el=document.getElementById('sim-thresh-tbody');if(!el)return;
  const prods=Object.values(PRODUCTS).map(p=>p.price);
  el.innerHTML=Object.keys(TARIFF).map(z=>{
    const mins=prods.map(p=>{for(let c=1;c<=31;c++){const u=getTarifa(z,c);if(u&&p>0&&(u/p)<0.08)return c;}return '>30';});
    return `<tr><td><strong>${z}</strong></td>${mins.map(m=>`<td class="num-right"><span class="badge ${m==='>30'?'red':typeof m==='number'&&m>15?'amber':'green'}">${m} cj</span></td>`).join('')}</tr>`;
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
  desvEl.textContent=peso(Math.abs(desv));
  desvEl.className='value '+(desv>0?'red':'green');
  document.getElementById('b-desv-pct').textContent=(desv>0?'+':'-')+Math.abs(desvPct).toFixed(1)+'% vs presupuesto';
}

const pageTitles={dashboard:'Resumen',costos:'Costos',clientes:'Clientes',servicio:'Servicio',pedidos:'Pedidos',simulador:'Simulador'};
function switchPage(id,el){
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg=document.getElementById('page-'+id);
  if(pg){pg.style.display='block';setTimeout(()=>pg.classList.add('active'),10);}
  if(el)el.classList.add('active');
  document.getElementById('page-title').textContent=pageTitles[id]||id;
}

window.addEventListener('DOMContentLoaded', loadData);
