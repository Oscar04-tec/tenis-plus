'use strict';
/* Tenis Plus — UI local. No inventa partidos, cuotas, probabilidades ni resultados. */
const TIMEZONE='America/Monterrey';
const STORAGE='tenis-plus-v1';
// Cartelera de una sola fecha recopilada de fuentes públicas; NO es alimentación en vivo.
const CRITERIA=[
  ['localia','Localía / sede',true,'País, público, viaje y si el rival es local. Rival local: no dar por hecho que el favorito ganará.'],
  ['superficie','Superficie',true,'Hard, clay, grass e indoor/outdoor: comparar rendimiento en esa superficie.'],
  ['forma','Forma reciente (5–10)',true,'Racha, nivel de adversarios, marcadores y superficie, no solo victorias.'],
  ['oposicion','Calidad de rivales',true,'Strength of schedule; ranking y contexto de los oponentes recientes.'],
  ['ranking','Ranking',false,'Ranking actual/máximo/evolución como referencia, no probabilidad.'],
  ['elo','ELO / nivel real',false,'ELO general y por superficie si existen datos fiables.'],
  ['matchup','Matchup / estilos',true,'Enfrentamiento de estilos y capacidad de neutralizar armas.'],
  ['saque','Saque',false,'Primer/segundo saque, holds, aces, dobles faltas, break points salvados.'],
  ['devolucion','Devolución',false,'Puntos al resto y capacidad de atacar segundo saque.'],
  ['break','Break points',false,'Creación, conversión, salvados y tamaño de muestra.'],
  ['tiebreak','Tie-break',false,'Frecuencia, récord reciente y superficie.'],
  ['duracion','Duración de partidos',false,'Minutos, sets, juegos y partidos consecutivos largos.'],
  ['fatiga','Fatiga',true,'Carga acumulada, partidos recientes y desgaste.'],
  ['descanso','Descanso',true,'Días reales desde el último partido, recuperación disponible.'],
  ['viajes','Viajes',true,'Distancias, zona horaria, continente y ajuste localía+descanso.'],
  ['lesiones','Lesiones / molestias',true,'Solo evidencia actual confirmada; distinguir rumor de noticia verificada.'],
  ['clima','Clima',false,'Outdoor: temperatura, viento, humedad y lluvia. Indoor: justificar no aplica.'],
  ['torneo','Torneo / ronda',false,'Categoría, fase e incentivos verificables.'],
  ['calendario','Calendario',false,'Torneos seguidos, transición de superficie y próximos compromisos.'],
  ['h2h','Head-to-head',false,'Total, reciente y superficie; cuidado con muestras de 1–2 partidos.'],
  ['cuota','Cuota',true,'Precio verificado en casa, probabilidad implícita y fecha de consulta.'],
  ['movimiento','Movimiento de cuota',false,'Cuota inicial vs actual; no interpretar una bajada como garantía.'],
  ['casas','Comparación de casas',false,'Comparar precios y documentar qué casas están disponibles.'],
  ['mercado','Mercado disponible',false,'Prioridad moneyline / ganador, verificar reglas del mercado.'],
  ['trampas','Trampas potenciales',true,'Localía, superficie, lesión, fatiga, viaje, matchup o precio engañoso.'],
  ['probabilidad','Probabilidad estimada',true,'Estimación propia con método y evidencia, separada de la implícita.'],
  ['valor','Valor vs cuota',true,'Comprobar que probabilidad estimada x cuota > 1; sin garantía.'],
  ['confianza','Nivel de confianza',false,'Muy alta 90%+, alta 85–89%, moderada 78–84%, etc.; escala no validada.'],
  ['banca','Gestión de banca',false,'10% reserva / 90% disponible; limitar cada entrada por separado.']
];
const escapeHTML = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=sel=>document.querySelector(sel);
const $$=sel=>Array.from(document.querySelectorAll(sel));
const currency=v=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(Number(v)||0);
const fnum=v=>Number.isFinite(Number(v))?Number(v).toFixed(2):'—';
const dateParts = date => Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
const dayISO=(d=new Date())=>{const p=dateParts(d);return `${p.year}-${p.month}-${p.day}`;};
const nextDay=day=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);};
const dayName=day=>new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
const fullDay=day=>new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
const timeText=match=>match.startAt?new Intl.DateTimeFormat('es-MX',{timeZone:TIMEZONE,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(match.startAt)):('Por definir');
const safeId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const readStorage=()=>{try{return JSON.parse(localStorage.getItem(STORAGE))||{};}catch{return {};}};
const saved=readStorage();
const state={page:'dashboard',day:'today',apiConfigured:false,apiProvider:null,sourceError:null,sourceMeta:{},loading:false,
  calendar:null,lastFetchAt:null,fixtures:{},manual:Array.isArray(saved.manual)?saved.manual:[],evals:saved.evals&&typeof saved.evals==='object'?saved.evals:{},
  bets:Array.isArray(saved.bets)?saved.bets:[],bank:saved.bank||{initial:0,reserve:10,cap:1},active:null,detailCache:{},drawerMode:''};
const save=()=>{try{localStorage.setItem(STORAGE,JSON.stringify({version:1,manual:state.manual,evals:state.evals,bets:state.bets,bank:state.bank}));}catch{toast('No se pudo guardar: revisa espacio o permisos del navegador.');}};
const selectedDay=()=>state.day==='today'?dayISO():nextDay(dayISO());
const allMatches=()=>[...(state.fixtures[selectedDay()]||[]),...state.manual.filter(x=>x.localDay===selectedDay())]
  .filter((m,i,arr)=>arr.findIndex(n=>n.id===m.id)===i).sort((a,b)=>(a.startAt||a.rawStart||'').localeCompare(b.startAt||b.rawStart||''));
const matchById=id=>[...Object.values(state.fixtures).flat(),...state.manual].find(x=>x.id===id);
let toastTimer;
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4400);}
function confidence(p){return p>=90?'Muy alta · 90%+':p>=85?'Alta · 85–89%':p>=78?'Moderada · 78–84%':p>=70?'Riesgo · 70–77%':'Evitar · <70%';}
function evaluation(match){return state.evals[match.id]||{pick:'',probability:'',basis:'',bookmaker:'',odds:'',oddsAt:'',notes:'',checks:{}};}
function decision(match,e=evaluation(match)){
  const p=Number(e.probability),odds=Number(e.odds);
  const reviewed=CRITERIA.filter(([id])=>{const c=e.checks?.[id];return c&&c.status&&c.status!=='pending'&&String(c.note||'').trim().length>=6;}).length;
  const risks=CRITERIA.filter(([id])=>e.checks?.[id]?.status==='risk').map(c=>c[1]);
  const missing=CRITERIA.filter(([id])=>!e.checks?.[id]||!e.checks[id].status||e.checks[id].status==='pending'||String(e.checks[id].note||'').trim().length<6).map(c=>c[1]);
  const unsupported=CRITERIA.filter(([id,,critical])=>critical&&e.checks?.[id]?.status==='na').map(c=>c[1]);
  const validPick=e.pick==='0'||e.pick==='1';
  const implied=odds>1?100/odds:null;
  const ev=p>0&&odds>1?p/100*odds-1:null;
  const past=match.startAt&&new Date(match.startAt).getTime()<=Date.now();
  const reasons=[];
  if(match.status!=='scheduled'||past)reasons.push('Partido iniciado o finalizado: no es una selección prepartido vigente.');
  if(match.draw==='doubles')reasons.push('El checklist individual no está validado para dobles; análisis independiente pendiente.');
  if(!match.timeVerified)reasons.push('Horario/zona horaria no confirmados.');
  if(match.id.startsWith('free:')&&(!state.sourceMeta[match.localDay]?.updatedAt||Date.now()-Date.parse(state.sourceMeta[match.localDay].updatedAt)>18*60*60*1000))reasons.push('La última cartelera publicada es demasiado antigua para autorizar una candidatura.');
  if(match.id.startsWith('free:')&&state.sourceMeta[match.localDay]?.complete!==true)reasons.push('Cartelera de cobertura parcial o sin confirmación de integridad.');
  if(!validPick)reasons.push('Falta seleccionar al jugador.');
  if(!e.bookmaker?.trim())reasons.push('Falta identificar la casa de apuestas.');
  if(!e.oddsAt)reasons.push('Falta fecha de verificación de cuota.');
  else { const checked=new Date(e.oddsAt+':00-06:00').getTime(); if(!Number.isFinite(checked)||checked>Date.now()||(match.startAt&&checked>=new Date(match.startAt).getTime())) reasons.push('La cuota debe estar verificada antes del inicio y no en el futuro.'); }
  if(!Number.isFinite(odds)||odds<1.20)reasons.push('Cuota verificada inferior a 1.20 o ausente.');
  if(!(p>=85&&p<=100)||!e.basis||e.basis.trim().length<15)reasons.push('Probabilidad propia ≥85% y fundamento documentado pendientes.');
  if(ev===null||ev<=0)reasons.push('Sin valor esperado positivo documentado.');
  if(missing.length)reasons.push(`${missing.length} indicadores sin revisión/evidencia.`);
  if(unsupported.length)reasons.push(`Indicadores críticos marcados no aplica: ${unsupported.join(', ')}.`);
  if(risks.length)reasons.push(`Riesgos identificados: ${risks.join(', ')}.`);
  return {ready:!reasons.length,reasons,reviewed,total:CRITERIA.length,implied,ev,p:validPick&&p>=0&&p<=100?p:null,odds:odds>1?odds:null};
}
function net(b){return b.status==='won'?Number(b.stake)*(Number(b.odds)-1):b.status==='lost'?-Number(b.stake):0;}
const settled=()=>state.bets.filter(b=>['won','lost'].includes(b.status));
function currentBank(){return Math.max(0,Number(state.bank.initial||0)+state.bets.reduce((a,b)=>a+net(b),0));}
function bankAvailable(){const bank=currentBank();return Math.max(0,bank*(1-Number(state.bank.reserve)/100)-state.bets.filter(b=>b.status==='pending').reduce((a,b)=>a+Number(b.stake),0));}
function renderMetrics(){
  const matches=allMatches();
  $('#metricMatches').textContent=state.fixtures[selectedDay()]||state.manual.some(x=>x.localDay===selectedDay())?matches.length:'—';
  $('#metricCandidates').textContent=matches.filter(m=>decision(m).ready).length;
  $('#metricBets').textContent=state.bets.length;
  const profit=state.bets.reduce((a,b)=>a+net(b),0);$('#metricProfit').textContent=currency(profit);
  $('#metricProfit').className='stat-num '+(profit<0?'loss-text':profit>0?'success-text':'');
  $('#sideBetCount').textContent=state.bets.filter(b=>b.status==='pending').length;
}
function renderBanner(){
  const box=$('#sourceBanner'),txt=$('#sourceBannerText');
  const meta=state.sourceMeta[selectedDay()],date=meta?.updatedAt;
  const stale=!date||!Number.isFinite(Date.parse(date))||Date.now()-Date.parse(date)>18*3600000;
  const warning=state.sourceError||(state.apiConfigured&&stale?'Datos antiguos o jornada no actualizada; revisa GitHub Actions.':null);
  box.className='notice'+(warning?' error':state.apiConfigured?' connected':'');
  if(state.loading)txt.textContent='Leyendo la última cartelera publicada por GitHub Actions…';
  else if(warning)txt.textContent=warning;
  else if(state.apiConfigured)txt.textContent='Cartelera automática publicada por GitHub Actions · Última consulta del proveedor: '+new Date(date).toLocaleString('es-MX',{timeZone:TIMEZONE})+' (Monterrey). No es tiempo real. Sin cuotas, H2H completo ni predicciones independientes.';
  else txt.textContent='Aún no hay cartelera conectada. Configura LIVETENNISAPI_KEY en Secrets y ejecuta el flujo de GitHub Actions; NO se muestran partidos históricos como actuales.';
  const pill=$('#providerBadge');pill.textContent=state.apiConfigured?'PUBLICADA':'PENDIENTE';pill.className='tag '+(state.apiConfigured&&!warning?'green':'amber');
  $('#sideStatus').textContent=state.apiConfigured?'GitHub Actions · cartelera':'Calendario sin activar';
  $('#sideStatusSub').textContent=state.apiConfigured?(stale?'Actualización antigua':'Datos publicados, no en vivo'):'API gratuita pendiente';
  $('#sideSignal').className='signal'+(state.apiConfigured&&!warning?' good':'');
}
function renderDates(){const day=selectedDay();$('#heroDate').textContent=dayName(day);$('#todayLabel').textContent=dayName(dayISO());$('#tomorrowLabel').textContent=dayName(nextDay(dayISO()));$('#boardTitle').textContent='Partidos por torneo';$$('.day-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.day===state.day));}
function matchRows(matches){
  return matches.map(m=>{
    const d=decision(m), price=m.odds.filter(x=>x&&x>1).sort((a,b)=>a-b)[0];
    const p=m.players||[];
    const verdict=d.ready?'<span class="tag green">CANDIDATO</span>':m.status==='live'?'<span class="tag neutral">EN VIVO</span>':m.status==='finished'?'<span class="tag neutral">FINALIZADO</span>':m.status==='unknown'?'<span class="tag amber">ESTADO NO CONFIRMADO</span>':'<span class="tag amber">NO APOSTAR</span>';
    return `<div class="match-row"><div class="match-time"><strong>${m.scheduleNote?.startsWith('no antes')?'≥ ':''}${escapeHTML(timeText(m))}</strong><small class="${m.status==='live'?'live-text':''}">${m.status==='live'?'● En vivo':m.status==='finished'?'Finalizado':m.scheduleNote?.startsWith('no antes')?'No antes de · MTY':m.scheduleNote?.includes('contrastar')?'Hora por confirmar · MTY':m.timeVerified?'Hora MTY':'Horario sin validar'}</small></div>
      <div class="versus"><strong><span class="flag">${escapeHTML(p[0]?.country||'—')}</span> ${escapeHTML(p[0]?.name||'Jugador pendiente')}</strong><small class="vs">VS</small><strong><span class="flag">${escapeHTML(p[1]?.country||'—')}</span> ${escapeHTML(p[1]?.name||'Jugador pendiente')}</strong></div>
      <div class="match-detail"><strong>${escapeHTML(m.surface||'Superficie sin datos')}</strong><small>${escapeHTML(m.round||'Ronda sin datos')}${m.draw==='doubles'?' · DOBLES':m.draw==='singles'?' · Individuales':''}</small></div>
      <div class="odds-block"><strong>${price?fnum(price):'—'}</strong><small>${price?'Cuota publicada*':'Sin cuota verificada'}</small></div>
      <div class="decision">${verdict}<small>${d.reviewed}/${d.total} revisados</small>${m.sourceUrl?`<small><a href="${escapeHTML(m.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--lime)">Fuente ↗</a></small>`:''}</div><button class="analysis-btn" data-open-match="${escapeHTML(m.id)}">Analizar ↗</button></div>`;
  }).join('');
}
function filteredMatches(){const text=$('#searchInput').value.trim().toLowerCase(),tour=$('#tourFilter').value,verdict=$('#verdictFilter').value;
 return allMatches().filter(m=>(tour==='all'||m.tour===tour)&&(!text||[m.tournament,m.location,...m.players.map(p=>p.name)].join(' ').toLowerCase().includes(text))&&(verdict==='all'||(verdict==='ready')===decision(m).ready));}
function boardHTML(matches){
  if(!matches.length)return `<div class="empty"><div class="empty-orb">⌕</div><h3>Sin partidos para mostrar</h3><p>${state.loading?'Leyendo archivo de jornada…':'No hay partidos publicados para estos filtros o esta fecha. Verifica el estado de GitHub Actions; nunca se rellenan partidos inventados.'}</p><button class="outline-btn" data-switch-settings>Configurar fuente o importar JSON →</button></div>`;
  const groups=new Map();for(const m of matches){const key=m.tour+':'+(m.tournamentId??m.tournament);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
  return [...groups.values()].map(list=>{const m=list[0];return `<section class="tournament"><div class="tourney-head"><div class="tour-icon">${escapeHTML(m.tour)}</div><div><strong>${escapeHTML(m.tournament)}</strong><small>⌖ ${escapeHTML(m.location)} · ${escapeHTML(m.surface||'Superficie no publicada')} · ${escapeHTML(m.tier||m.tour)}</small></div><span class="tourney-count">${list.length} partido${list.length!==1?'s':''}</span></div>${matchRows(list)}</section>`;}).join('');
}
function renderBoard(){const matches=filteredMatches(),meta=state.sourceMeta[selectedDay()];$('#boardMeta').textContent=`${matches.length} resultados · ${meta?.updatedAt?'Publicado '+new Intl.DateTimeFormat('es-MX',{timeZone:TIMEZONE,hour:'2-digit',minute:'2-digit'}).format(new Date(meta.updatedAt)):'Sin consulta reciente'}${meta?.complete===false?' · COBERTURA PARCIAL':''}`;
 $('#matchesContainer').innerHTML=boardHTML(matches);$('#matchesMirror').innerHTML=`<div class="content-heading"><h2>${escapeHTML(fullDay(selectedDay()))}</h2><button class="outline-btn" data-switch-dashboard>Filtrar / cambiar día →</button></div>${boardHTML(matches)}`;renderMetrics();}
function renderBets(){const won=state.bets.filter(b=>b.status==='won'),lost=state.bets.filter(b=>b.status==='lost');const completed=settled(),staked=completed.reduce((a,b)=>a+Number(b.stake),0);
 $('#betTotal').textContent=state.bets.length;$('#betWon').textContent=won.length;$('#betLost').textContent=lost.length;$('#betRoi').textContent=staked?`${(completed.reduce((a,b)=>a+net(b),0)/staked*100).toFixed(1)}%`:'—';
 $('#betsContainer').innerHTML=state.bets.length?state.bets.slice().reverse().map(b=>`<div class="bet-row"><div><strong>${escapeHTML(b.pickName)} vs ${escapeHTML(b.opponentName)}</strong><small>${escapeHTML(b.tournament)} · ${escapeHTML(b.tour)} · ${escapeHTML(b.matchDay||'Fecha no verificada')}</small></div><div><strong class="money">${currency(b.stake)}</strong><small>${escapeHTML(b.bookmaker)} · cuota ${fnum(b.odds)}</small></div><div><strong class="${net(b)<0?'loss-text':net(b)>0?'success-text':''}">${b.status==='pending'?'Pendiente':currency(net(b))}</strong><small>${escapeHTML(b.status==='won'?'Ganada':b.status==='lost'?'Perdida':b.status==='void'?'Anulada':'Sin liquidar')}</small></div><div><span class="tag ${b.status==='won'?'green':b.status==='lost'?'red':b.status==='void'?'neutral':'amber'}">${escapeHTML(b.status==='won'?'GANADA':b.status==='lost'?'PERDIDA':b.status==='void'?'ANULADA':'PENDIENTE')}</span><small>${b.analysisSnapshot?.ready?'Evaluada favorablemente':'No superó filtro'}</small></div><div class="bet-actions"><button data-open-bet="${escapeHTML(b.id)}">Liquidar / ver ↗</button></div></div>`).join(''):`<div class="empty"><div class="empty-orb">▤</div><h3>Aún no registraste apuestas</h3><p>Abre cualquier partido en el panel y utiliza «Registrar apuesta REAL» únicamente después de haberla realizado.</p><button class="outline-btn" data-switch-dashboard>Ir a los partidos →</button></div>`;
}
function renderBank(){const b=state.bank,amt=currentBank(),reserve=Math.min(100,Math.max(0,Number(b.reserve)||0));$('#bankInitial').value=b.initial;$('#bankReserve').value=b.reserve;$('#bankCap').value=b.cap;$('#bankCurrent').textContent=currency(amt);$('#bankReserveBar').style.width=reserve+'%';$('#bankReserved').textContent=currency(amt*reserve/100);$('#bankAvailable').textContent=currency(bankAvailable());$('#bankStakeCap').textContent=currency(amt*(Number(b.cap)||0)/100);}
function render(){renderDates();renderBanner();renderBoard();renderBets();renderBank();}
function showPage(page){state.page=page;$$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+page));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const names={dashboard:'RESUMEN DIARIO',matches:'PARTIDOS',bets:'MIS APUESTAS',bank:'GESTIÓN DE BANCA',settings:'FUENTES Y DATOS'};$('#breadcrumb').textContent=names[page]||'TENIS PLUS';render();window.scrollTo({top:0,behavior:'smooth'});}
async function syncSource(){
  state.loading=true;state.lastFetchAt=Date.now();renderBanner();
  try{
    const response=await fetch('./data/calendar.json?refresh='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const payload=await response.json();
    if(payload.version!==1||!payload.days||typeof payload.days!=='object')throw Error('Archivo de cartelera incompatible.');
    state.calendar=payload;state.apiConfigured=Boolean(payload.configured);
    state.apiProvider=payload.source||'Live Tennis API FREE';state.fixtures={};state.sourceMeta={};
    for(const [day,value] of Object.entries(payload.days)){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!value||!Array.isArray(value.matches))continue;
      state.fixtures[day]=value.matches;
      state.sourceMeta[day]={complete:value.complete,updatedAt:value.updatedAt,errors:value.errors||[],attemptedAt:new Date().toISOString()};
    }
    const day=selectedDay(),meta=state.sourceMeta[day];
    const errs=[...(payload.errors||[]),...(meta?.errors||[])];
    if(!state.apiConfigured)state.sourceError='Falta la primera actualización con la clave gratuita. Añade el secreto y ejecuta Actions.';
    else if(!meta)state.sourceError='La última publicación no contiene la jornada '+day+'. Ejecuta Actions y comprueba su resultado.';
    else if(errs.length)state.sourceError='Cobertura parcial o incidencia del proveedor: '+[...new Set(errs)].join(' · ');
    else state.sourceError=null;
  }catch(e){state.sourceError='No se pudo leer la cartelera publicada: '+e.message+'. Si ya existe una, se conserva en esta sesión.';}
  finally{state.loading=false;render();}
}
async function loadMatches(){render();}
function openDrawer(title,eyebrow,content){$('#drawerTitle').textContent=title;$('#drawerEyebrow').textContent=eyebrow;$('#drawerBody').innerHTML=content;$('#overlay').hidden=false;document.body.style.overflow='hidden';}
function closeDrawer(){$('#overlay').hidden=true;document.body.style.overflow='';state.active=null;state.drawerMode='';render();}
function hintLocalia(m){const country=(m.hostCountry||'').toUpperCase();if(!country)return 'No se publicó país de sede. Verificar localía antes de decidir.';const locals=m.players.filter(p=>(p.country||'').toUpperCase()===country).map(p=>p.name);return locals.length?`Posible local: ${locals.join(' / ')} (${country}). Confirmar ciudad, público y adaptación; no elegir favorito automáticamente.`:`No se identifica un jugador del país sede (${country}); aún deben revisarse viajes y región.`;}
function oddsOptions(m){return m.odds.map((o,i)=>o?`${m.players[i].name}: ${fnum(o)}`:null).filter(Boolean).join(' · ')||'No hay cuotas publicadas para este partido.';}
function localDateTime(iso){if(!iso)return '';const p=dateParts(new Date(iso));const hh=new Intl.DateTimeFormat('en-GB',{timeZone:TIMEZONE,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));return `${p.year}-${p.month}-${p.day}T${hh}`;}
function drawerTop(m,e){const d=decision(m,e);return `<div class="drawer-summary"><h3>${escapeHTML(m.tournament)} · ${escapeHTML(m.tour)}</h3><p>⌖ ${escapeHTML(m.location)} · ${escapeHTML(m.surface||'Superficie no publicada')} · ${escapeHTML(m.round||'Ronda sin datos')}</p><p>◷ ${escapeHTML(timeText(m))} · ${escapeHTML(m.localDay||'Fecha por confirmar')} · ${m.scheduleNote?escapeHTML(m.scheduleNote):m.timeVerified?'hora convertida a Monterrey':'HORARIO SIN ZONA CONFIRMADA'}</p>${m.sourceUrl?`<p>Fuente del encuentro: <a href="${escapeHTML(m.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(m.sourceLabel||'Abrir fuente')} ↗</a> · ${m.sourceLabel==='Live Tennis API FREE'?'Consulta automática en caché; comprueba cambios de última hora.':'Referencia externa: confirmar que siga vigente antes del partido.'}</p>`:''}<p>Mercado externo: ${escapeHTML(oddsOptions(m))}. *Verifica casa y vigencia por separado.</p><span id="currentVerdict" class="tag ${d.ready?'green':'amber'}">${d.ready?'CANDIDATO REVISADO':'NO APOSTAR'}</span><p id="currentReason">${escapeHTML(d.ready?'Cumple los controles configurados; no garantiza resultado.':d.reasons[0]||'Datos insuficientes.')}</p><p id="currentProgress">${d.reviewed}/${d.total} indicadores documentados</p></div>`;}
function indicatorsHTML(e){return CRITERIA.map(([key,title,critical,hint],i)=>{const c=e.checks?.[key]||{};return `<div class="criteria-row"><div class="criteria-num">${String(i+1).padStart(2,'0')}</div><div class="criteria-name">${escapeHTML(title)}${critical?' <span class="warning-text">*</span>':''}</div><select aria-label="Estado de ${escapeHTML(title)}" data-criterion="${key}" data-part="status"><option value="pending" ${!c.status||c.status==='pending'?'selected':''}>Sin revisar</option><option value="good" ${c.status==='good'?'selected':''}>Favorable / verificado</option><option value="neutral" ${c.status==='neutral'?'selected':''}>Neutro / verificado</option><option value="risk" ${c.status==='risk'?'selected':''}>Riesgo / veto</option><option value="na" ${c.status==='na'?'selected':''}>No aplica (justificar)</option></select><input class="criteria-note" data-criterion="${key}" data-part="note" aria-label="Evidencia de ${escapeHTML(title)}" placeholder="Fuente, dato y fecha o justificación…" value="${escapeHTML(c.note||'')}"/><div class="explain">${escapeHTML(hint)}</div></div>`;}).join('');}
function matchAnalysisHTML(m){const e=evaluation(m);const d=decision(m,e);return `${drawerTop(m,e)}
  <div class="analysis-section"><div class="criteria-toolbar"><h3>01 · Selección y precio</h3><span class="tag neutral">Mercado prioritario: ganador</span></div><div class="field"><label>Jugador a analizar<select data-eval="pick"><option value="">Selecciona un jugador</option>${m.players.map((p,i)=>`<option value="${i}" ${e.pick===String(i)?'selected':''}>${escapeHTML(p.name)}</option>`).join('')}</select></label></div>
    <div class="field two"><label>Cuota decimal verificada (mín. 1.20)<input type="number" min="1.01" step="0.01" data-eval="odds" value="${escapeHTML(e.odds||'')}" placeholder="1.25"/></label><label>Casa de apuestas<input data-eval="bookmaker" value="${escapeHTML(e.bookmaker||'')}" placeholder="Nombre real de la casa"/></label></div>
    <div class="field"><label>Fecha de verificación de cuota (hora Monterrey)<input type="datetime-local" data-eval="oddsAt" value="${escapeHTML(e.oddsAt||'')}"/></label></div><div class="field two"><label>Probabilidad propia estimada (%)<input type="number" min="0" max="100" step="0.1" data-eval="probability" value="${escapeHTML(e.probability||'')}" placeholder="Sin estimación automática"/></label><label>Valor esperado (automático)<input id="evField" value="${d.ev!==null?(d.ev*100).toFixed(2)+'%':'Sin datos'}" readonly/></label></div>
    <div class="field"><label>Fundamento verificable de la estimación<textarea data-eval="basis" placeholder="Modelo, muestra, fuente, condiciones y limitaciones…">${escapeHTML(e.basis||'')}</textarea></label><small class="hint">La probabilidad implícita se calcula a partir de la cuota; no es nuestra probabilidad propia.</small><small id="impliedField" class="hint">Implícita: ${d.implied?d.implied.toFixed(1)+'%':'—'} · Nivel: ${e.probability?escapeHTML(confidence(Number(e.probability))):'sin estimación'}</small></div>
  </div><div class="analysis-section"><div class="criteria-toolbar"><h3>02 · Checklist de los 29 indicadores</h3><span id="criteriaCounter" class="tag neutral">${d.reviewed}/29 revisados</span></div><p>Los indicadores con * son críticos: «no aplica» no permite aprobar la selección. Cada revisión exige evidencia o justificación (mín. 6 caracteres). Cualquier riesgo bloquea la candidatura.</p><div class="detail-box"><h4>Alerta de localía</h4><p>${escapeHTML(hintLocalia(m))}</p></div>${indicatorsHTML(e)}</div>
  <div class="analysis-section"><h3>03 · Datos gratuitos disponibles</h3><div class="detail-box"><p>El proveedor publica identificadores, jugadores, superficie y algunos rankings según cobertura. No entrega en el plan gratuito H2H completo, cuotas ni probabilidades propias. Documenta cada dato adicional y su fuente en el checklist.</p><p>${m.players.map(p=>`${escapeHTML(p.name)} · ranking publicado: ${escapeHTML(p.ranking??'no disponible')}`).join('<br>')}</p></div></div>
  <div class="analysis-section"><h3>04 · Evaluación y registro real</h3><div id="fullVerdict" class="detail-box"><h4>${d.ready?'Candidato tras revisión':'NO APOSTAR'}</h4>${d.reasons.length?`<div class="detail-list">${d.reasons.map(r=>`<div>• ${escapeHTML(r)}</div>`).join('')}</div>`:'<p>Todos los controles configurados están satisfechos. Esto no significa que el resultado sea seguro.</p>'}</div><div class="field"><label>Notas adicionales<textarea data-eval="notes" placeholder="Contexto de decisión, por qué se descartó, dudas…">${escapeHTML(e.notes||'')}</textarea></label></div><div class="drawer-footer"><button class="primary-btn" id="saveEval">Guardar evaluación</button><button class="outline-btn" id="showBetForm">Registrar apuesta REAL →</button></div><div id="betFormMount"></div></div>`;}
function openMatch(id){const m=matchById(id);if(!m){toast('El partido ya no está en la cartelera.');return;}state.active=id;state.drawerMode='analysis';openDrawer(`${m.players[0].name} vs ${m.players[1].name}`,'FICHA DE ANÁLISIS · 30 PUNTOS',matchAnalysisHTML(m));if(state.detailCache[id])$('#externalDetails').innerHTML=detailsHTML(m,state.detailCache[id]);}
function updateEvalField(target){const m=matchById(state.active);if(!m)return;let e=state.evals[m.id];if(!e)e=state.evals[m.id]={pick:'',probability:'',basis:'',bookmaker:'',odds:'',oddsAt:'',notes:'',checks:{}};
 if(target.dataset.eval){e[target.dataset.eval]=target.value;}else if(target.dataset.criterion){e.checks ||= {};e.checks[target.dataset.criterion]||={status:'pending',note:''};e.checks[target.dataset.criterion][target.dataset.part]=target.value;}
 e.updatedAt=new Date().toISOString();save();updateVerdict(m);}
function updateVerdict(m){const d=decision(m),e=evaluation(m);const verdict=$('#currentVerdict');if(!verdict)return;verdict.className='tag '+(d.ready?'green':'amber');verdict.textContent=d.ready?'CANDIDATO REVISADO':'NO APOSTAR';$('#currentReason').textContent=d.ready?'Cumple los controles configurados; no garantiza resultado.':d.reasons[0]||'Datos incompletos';$('#currentProgress').textContent=`${d.reviewed}/${d.total} indicadores documentados`;$('#criteriaCounter').textContent=`${d.reviewed}/29 revisados`;$('#evField').value=d.ev!==null?(d.ev*100).toFixed(2)+'%':'Sin datos';$('#impliedField').textContent=`Implícita: ${d.implied?d.implied.toFixed(1)+'%':'—'} · Nivel: ${e.probability?confidence(Number(e.probability)):'sin estimación'}`;
 $('#fullVerdict').innerHTML=`<h4>${d.ready?'Candidato tras revisión':'NO APOSTAR'}</h4>${d.reasons.length?`<div class="detail-list">${d.reasons.map(r=>`<div>• ${escapeHTML(r)}</div>`).join('')}</div>`:'<p>Todos los controles configurados están satisfechos. No existe garantía de victoria.</p>'}`;renderBoard();}
function detailsHTML(m,data){const profiles=data.profiles||[],recent=data.recent||[],h=data.h2h||{};const out=['<div class="detail-box"><h4>Comparativa con datos disponibles</h4>'];
 for(let i=0;i<2;i++){const p=profiles[i]||{};out.push(`<p><strong>${escapeHTML(m.players[i].name)}</strong> · Ranking: ${escapeHTML(p.currentRank||p.curRank?.position||'s/d')} · Mejor ranking: ${escapeHTML(p.bestRank?.position||'s/d')}</p>`);
 const items=recent[i]||[];out.push(`<p class="muted">Últimos ${items.length}: ${items.length?items.map(r=>`${r.won?'V':'D'} vs ${r.opponent||'rival s/d'} (${r.score||'marcador s/d'})`).map(escapeHTML).join(' · '):'sin historial recibido'}</p>`);}
 out.push(`<p>H2H archivado: ${escapeHTML(m.players[0].name)} ${h.winsA??'s/d'} — ${h.winsB??'s/d'} ${escapeHTML(m.players[1].name)}${h.limited?' (hasta 100 registros)':''}</p></div>`);
 for(let i=0;i<2;i++){out.push(`<details class="detail-box"><summary>${escapeHTML(m.players[i].name)}: superficie y estadísticas originales</summary><pre style="white-space:pre-wrap;word-break:break-word;font-size:10px;color:#acc2ad">${escapeHTML(JSON.stringify({surface:data.surface?.[i],stats:data.stats?.[i]},null,2))}</pre></details>`);}
 if(Object.keys(data.errors||{}).length)out.push(`<p class="warning-text">Algunas fuentes de estadísticas no respondieron: ${escapeHTML(Object.keys(data.errors).join(', '))}.</p>`);out.push(`<p class="subtle">Proveedor: ${escapeHTML(data.source||'Tennis API')} · ${escapeHTML(data.updatedAt||'fecha no disponible')}. Comprueba superficie, nivel de rivales y vigencia; este panel no emite probabilidades propias.</p>`);return out.join('');}
function loadDetails(){toast('El plan gratuito y GitHub Pages no proporcionan análisis estadístico avanzado: utiliza fuentes documentadas.');}
function betForm(m){const e=evaluation(m),d=decision(m);return `<div class="detail-box"><h4>Confirmar apuesta realmente realizada</h4><p>Registrar aquí no coloca apuestas en ninguna casa. Se guardará la cuota contratada y una fotografía inmutable de la evaluación (${d.ready?'candidato revisado':'NO APOSTAR / evaluación incompleta'}).</p><div class="field"><label>Selección real<select id="betPick"><option value="">Selecciona</option>${m.players.map((p,i)=>`<option value="${i}" ${e.pick===String(i)?'selected':''}>${escapeHTML(p.name)}</option>`).join('')}</select></label></div><div class="field two"><label>Cuota realmente contratada<input id="betOdds" type="number" min="1.01" step="0.01" value="${escapeHTML(e.odds||'')}"/></label><label>Importe apostado (MXN)<input id="betStake" type="number" min="0.01" step="0.01" placeholder="0.00"/></label></div><div class="field two"><label>Casa de apuestas<input id="betBook" value="${escapeHTML(e.bookmaker||'')}" placeholder="Casa real"/></label><label>Momento de registro (hora Monterrey)<input type="datetime-local" id="betPlaced" value="${escapeHTML(localDateTime(new Date().toISOString()))}"/></label></div><label class="subtle" style="display:flex;align-items:center;gap:8px"><input id="betConfirm" type="checkbox"/> Confirmo que SÍ realicé esta apuesta fuera de Tenis Plus.</label><div class="drawer-footer"><button id="confirmBet" class="primary-btn">Confirmar y guardar registro</button><button id="cancelBet" class="outline-btn">Cancelar</button></div><p class="subtle">Banca disponible estimada: ${currency(bankAvailable())}; límite configurable por apuesta: ${currency(currentBank()*state.bank.cap/100)}. Se registran también apuestas que incumplieron el filtro para poder evaluar decisiones reales.</p></div>`;}
function showBetForm(){const m=matchById(state.active);if(!m)return;$('#betFormMount').innerHTML=betForm(m);$('#betFormMount').scrollIntoView({behavior:'smooth',block:'nearest'});}
function registerBet(){const m=matchById(state.active);if(!m)return;const pick=$('#betPick').value,odds=Number($('#betOdds').value),stake=Number($('#betStake').value),bookmaker=$('#betBook').value.trim(),placed=$('#betPlaced').value;
 if(!['0','1'].includes(pick)||!Number.isFinite(odds)||odds<=1||!Number.isFinite(stake)||stake<=0||!bookmaker||!placed){toast('Completa selección, cuota, importe, casa y momento real.');return;}
 if(!$('#betConfirm').checked){toast('Confirma que la apuesta se realizó realmente.');return;}
 if(state.bets.length>=5000){toast('Límite local de 5,000 registros; exporta un respaldo.');return;}
 const i=Number(pick),e=evaluation(m),d=decision(m);state.bets.push({id:safeId(),matchId:m.id,tour:m.tour,tournament:m.tournament,tournamentId:m.tournamentId,
 matchDay:m.localDay,matchStart:m.startAt,p1Id:m.players[0].id,p2Id:m.players[1].id,pickId:m.players[i].id,pickIndex:i,pickName:m.players[i].name,opponentName:m.players[1-i].name,
 odds,stake,bookmaker,placedAt:placed,loggedAt:new Date().toISOString(),status:'pending',score:'',resultSource:'',settledAt:null,
 analysisSnapshot:{ready:d.ready,reasons:d.reasons,estimatedProbability:d.p,expectedValue:d.ev,criteriaReviewed:d.reviewed},evaluationSnapshot:JSON.parse(JSON.stringify(e))});save();toast('Apuesta REAL registrada. Aparecerá pendiente en «Mis apuestas».');closeDrawer();showPage('bets');}
function openBet(id){const b=state.bets.find(x=>x.id===id);if(!b)return;state.active=id;state.drawerMode='bet';const est=b.analysisSnapshot||{};
 openDrawer(`${b.pickName} vs ${b.opponentName}`,'REGISTRO · RESULTADO Y LIQUIDACIÓN',`<div class="drawer-summary"><h3>${escapeHTML(b.tournament)} · ${escapeHTML(b.tour)}</h3><p>Jugador seleccionado: ${escapeHTML(b.pickName)}</p><p>Casa: ${escapeHTML(b.bookmaker)} · Cuota contratada: ${fnum(b.odds)} · Stake: ${currency(b.stake)}</p><p>Registro declarado: ${escapeHTML(b.placedAt)} · Capturado: ${escapeHTML(b.loggedAt)}</p><span class="tag ${b.status==='won'?'green':b.status==='lost'?'red':b.status==='void'?'neutral':'amber'}">${escapeHTML(b.status.toUpperCase())}</span><p>Evaluación original: ${est.ready?'Candidato revisado':'No superó filtro'} · ${est.criteriaReviewed??0}/29 indicadores · Probabilidad propia: ${est.estimatedProbability??'sin dato'}%.</p></div>
 <div class="analysis-section"><h3>01 · Comprobar resultado deportivo</h3><p>Esta edición estática no verifica resultados automáticamente. Contrasta el resultado deportivo y la liquidación en la casa de apuestas antes de registrar ganada o perdida.</p><div id="resultLookup" class="detail-box"><p>${escapeHTML(b.resultSource||'No se ha consultado un resultado deportivo.')}${b.score?' · '+escapeHTML(b.score):''}</p></div></div>
 <div class="analysis-section"><h3>02 · Liquidación real de la casa</h3><div class="field"><label>Estado de la apuesta<select id="settlement"><option value="pending" ${b.status==='pending'?'selected':''}>Pendiente</option><option value="won" ${b.status==='won'?'selected':''}>Ganada</option><option value="lost" ${b.status==='lost'?'selected':''}>Perdida</option><option value="void" ${b.status==='void'?'selected':''}>Anulada / devuelta</option></select></label></div><div class="field"><label>Marcador o comprobante (opcional)<input id="betScore" value="${escapeHTML(b.score||'')}" placeholder="Ej. 6-4 6-3; resultado de la casa"/></label></div><div class="drawer-footer"><button id="saveSettlement" class="primary-btn">Guardar liquidación</button><button id="deleteBet" class="danger-btn">Eliminar registro</button></div></div>`);
}
function verifyResult(){toast('Verificación automática no disponible en esta edición estática. Comprueba la fuente oficial y liquida manualmente.');}
function saveSettlement(){const b=state.bets.find(x=>x.id===state.active);if(!b)return;b.status=$('#settlement').value;b.score=$('#betScore').value.trim();b.settledAt=b.status==='pending'?null:new Date().toISOString();if(!b.resultSource&&b.status!=='pending')b.resultSource='Liquidación registrada manualmente por el usuario';save();toast('Resultado de tu apuesta guardado.');closeDrawer();showPage('bets');}
function manualForm(){return `<div class="drawer-summary"><h3>Partido incorporado por ti</h3><p>Utiliza datos reales. Si el horario, las cuotas o el lugar son inciertos, déjalos sin verificar; la evaluación permanecerá en NO APOSTAR.</p></div><form id="manualForm" class="manual-grid"><label>Jugador A*<input name="p1" required maxlength="120"/></label><label>Jugador B*<input name="p2" required maxlength="120"/></label><label>País jugador A (código)<input name="c1" maxlength="3" placeholder="MEX"/></label><label>País jugador B (código)<input name="c2" maxlength="3" placeholder="ESP"/></label><label>Torneo*<input name="tournament" required maxlength="150"/></label><label>Circuito<select name="tour"><option value="ATP">ATP</option><option value="WTA">WTA</option></select></label><label>Sede / ciudad<input name="location" maxlength="150"/></label><label>País sede (código)<input name="hostCountry" maxlength="3"/></label><label>Superficie<select name="surface"><option value="">Sin verificar</option><option>Hard</option><option>Clay</option><option>Grass</option><option>Indoor hard</option><option>Outdoor hard</option></select></label><label>Ronda<input name="round" maxlength="60"/></label><label class="full">Inicio del partido (hora de Monterrey)*<input name="datetime" type="datetime-local" required/></label><label>Cuota A (opcional)<input name="odd1" type="number" min="1.01" step="0.01"/></label><label>Cuota B (opcional)<input name="odd2" type="number" min="1.01" step="0.01"/></label><label class="full" style="display:flex;align-items:center;gap:8px"><input name="verified" type="checkbox" style="width:auto;margin:0"/> Confirmo que la hora del partido está contrastada en Monterrey</label><button class="primary-btn full" type="submit">Guardar partido real</button></form>`;}
function createManual(){state.active='manual';state.drawerMode='manual';openDrawer('Añadir partido','ENTRADA MANUAL · DATOS REALES',manualForm());}
function sanitizeImported(row){if(!row||typeof row!=='object'||!Array.isArray(row.players)||row.players.length!==2)return null;
 const player=row.players.map(p=>({id:Number.isInteger(Number(p.id))&&p.id!==null&&p.id!==''?Number(p.id):null,name:String(p.name||'').trim().slice(0,120),country:String(p.country||'').trim().toUpperCase().slice(0,3),ranking:null}));
 if(player.some(p=>!p.name)||!String(row.tournament||'').trim())return null;
 const iso=typeof row.startAt==='string'&&/(?:Z|[+-]\d\d:\d\d)$/i.test(row.startAt)&&!Number.isNaN(Date.parse(row.startAt))?new Date(row.startAt).toISOString():null;
 const date=iso?dayISO(new Date(iso)):String(row.localDay||row.rawStart||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const odds=Array.isArray(row.odds)?row.odds.slice(0,2).map(x=>Number(x)>1?Number(x):null):[null,null];
 return {id:'import:'+safeId(),tour:['ATP','WTA','CHALLENGER','ITF','JUNIORS','OTROS'].includes(String(row.tour||'').toUpperCase())?String(row.tour).toUpperCase():'OTROS',sourceId:null,tournamentId:Number.isInteger(Number(row.tournamentId))&&row.tournamentId?Number(row.tournamentId):null,
 tournament:String(row.tournament).trim().slice(0,150),tier:String(row.tier||'').slice(0,80)||null,location:String(row.location||'Sede no publicada').slice(0,160),hostCountry:String(row.hostCountry||'').toUpperCase().slice(0,3)||null,
 surface:String(row.surface||'').slice(0,40)||null,round:String(row.round||'').slice(0,60)||null,startAt:iso,rawStart:String(row.rawStart||'').slice(0,60)||null,
 timeVerified:Boolean(iso&&row.timeVerified),localDay:date,status:['scheduled','live','finished'].includes(row.status)?row.status:'scheduled',score:null,players:player,odds,oddsSource:'Importación manual; cotejar con casa',fetchedAt:null};}
function createManualSubmit(form){const data=new FormData(form);const day=String(data.get('datetime')||'');if(!/^\d{4}-\d{2}-\d{2}T\d\d:\d\d$/.test(day))return toast('Introduce fecha y hora válidas.');
 const p1=String(data.get('p1')||'').trim(),p2=String(data.get('p2')||'').trim(),tour=data.get('tour');if(!p1||!p2||p1===p2)return toast('Indica dos jugadores diferentes.');
 const asDate=new Date(day+':00-06:00'),iso=Number.isNaN(asDate.getTime())?null:asDate.toISOString();if(!iso)return toast('Fecha inválida.');
 const odd1=Number(data.get('odd1')),odd2=Number(data.get('odd2'));
 const m={id:'manual:'+safeId(),sourceId:null,tour,tournamentId:null,tournament:String(data.get('tournament')||'').trim(),tier:null,location:String(data.get('location')||'').trim()||'Sede no publicada',hostCountry:String(data.get('hostCountry')||'').trim().toUpperCase()||null,surface:data.get('surface')||null,round:data.get('round')||null,
 startAt:iso,rawStart:day,timeVerified:data.get('verified')==='on',localDay:day.slice(0,10),status:'scheduled',score:null,players:[{id:null,name:p1,country:String(data.get('c1')||'').toUpperCase(),ranking:null},{id:null,name:p2,country:String(data.get('c2')||'').toUpperCase(),ranking:null}],odds:[odd1>1?odd1:null,odd2>1?odd2:null],oddsSource:'Entrada manual',fetchedAt:null};
 state.manual.push(m);save();state.day=m.localDay===dayISO()?'today':m.localDay===nextDay(dayISO())?'tomorrow':state.day;toast('Partido manual guardado.');closeDrawer();showPage('dashboard');if(m.localDay!==selectedDay())toast('Partido guardado para '+m.localDay+'. El tablero muestra hoy y mañana.');}
function download(name,data){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function importJSON(file,restore=false){if(!file)return;if(file.size>5e6)return toast('El archivo supera 5 MB.');const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(restore){if(data?.application!=='Tenis Plus'||data.version!==1||!Array.isArray(data.bets)||!Array.isArray(data.manual)||!data.evals||!data.bank)throw Error('Formato de respaldo no válido.');
 if(!window.confirm('¿Restaurar y REEMPLAZAR todos los datos locales por este respaldo?'))return;state.bets=data.bets;state.manual=data.manual;state.evals=data.evals;state.bank=data.bank;save();render();toast('Respaldo restaurado.');return;}
 const input=Array.isArray(data)?data:data.matches;if(!Array.isArray(input))throw Error('Se espera un arreglo o un objeto con «matches».');const rows=input.map(sanitizeImported).filter(Boolean);if(!rows.length)throw Error('No se encontraron encuentros válidos. Revisa la plantilla.');state.manual.push(...rows);save();render();toast(`${rows.length} encuentros reales importados como datos manuales. ${input.length-rows.length} rechazados.`);
 }catch(e){toast('No se pudo importar: '+e.message);}};reader.readAsText(file);}
function template(){return {description:'Plantilla de datos reales. Sustituir por partidos verificados: este ejemplo está vacío deliberadamente.',matches:[]};}
function saveBank(){const initial=Number($('#bankInitial').value),reserve=Number($('#bankReserve').value),cap=Number($('#bankCap').value);if(!Number.isFinite(initial)||initial<0||!Number.isFinite(reserve)||reserve<0||reserve>100||!Number.isFinite(cap)||cap<=0||cap>100){toast('Revisa los valores de la banca y porcentajes.');return;}state.bank={initial,reserve,cap};save();renderBank();toast('Banca guardada en este navegador.');}
function eventBindings(){
 $$('.nav-item').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
 $$('.day-tabs button').forEach(b=>b.addEventListener('click',()=>{state.day=b.dataset.day;render();loadMatches();}));
 ['searchInput','tourFilter','verdictFilter'].forEach(id=>$('#'+id).addEventListener(id==='searchInput'?'input':'change',renderBoard));
 $('#refreshBtn').addEventListener('click',async()=>{await syncSource();await loadMatches(true);});
 $('#openManual').addEventListener('click',createManual);
 $('#closeDrawer').addEventListener('click',closeDrawer);$('#overlay').addEventListener('click',e=>{if(e.target.id==='overlay')closeDrawer();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#overlay').hidden)closeDrawer();});
 $('#goSettingsBanner').addEventListener('click',()=>showPage('settings'));
 $('#matchesContainer').addEventListener('click',handleListAction);$('#matchesMirror').addEventListener('click',handleListAction);$('#betsContainer').addEventListener('click',handleListAction);
 $('#drawerBody').addEventListener('input',e=>{if(e.target.matches('[data-eval],[data-criterion]'))updateEvalField(e.target);});
 $('#drawerBody').addEventListener('change',e=>{if(e.target.matches('[data-eval],[data-criterion]'))updateEvalField(e.target);});
 $('#drawerBody').addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;switch(btn.id){case 'loadDetails':loadDetails();break;case 'saveEval':save();toast('Evaluación guardada localmente.');break;case 'showBetForm':showBetForm();break;case 'confirmBet':registerBet();break;case 'cancelBet':$('#betFormMount').innerHTML='';break;case 'verifyResult':verifyResult();break;case 'saveSettlement':saveSettlement();break;case 'deleteBet':if(window.confirm('¿Eliminar definitivamente este registro de apuesta?')){state.bets=state.bets.filter(b=>b.id!==state.active);save();closeDrawer();showPage('bets');toast('Registro eliminado.');}break;}});
 $('#drawerBody').addEventListener('submit',e=>{if(e.target.id==='manualForm'){e.preventDefault();createManualSubmit(e.target);}});
 $('#saveBank').addEventListener('click',saveBank);
 $('#exportBets').addEventListener('click',()=>download(`tenis-plus-apuestas-${dayISO()}.json`,{application:'Tenis Plus',version:1,exportedAt:new Date().toISOString(),bets:state.bets}));
 $('#exportAll').addEventListener('click',()=>download(`tenis-plus-respaldo-${dayISO()}.json`,{application:'Tenis Plus',version:1,exportedAt:new Date().toISOString(),manual:state.manual,bets:state.bets,evals:state.evals,bank:state.bank}));
 $('#importJson').addEventListener('click',()=>$('#jsonFile').click());$('#jsonFile').addEventListener('change',e=>{importJSON(e.target.files[0]);e.target.value='';});
 $('#restoreAll').addEventListener('click',()=>$('#restoreFile').click());$('#restoreFile').addEventListener('change',e=>{importJSON(e.target.files[0],true);e.target.value='';});
 $('#downloadTemplate').addEventListener('click',()=>download('tenis-plus-plantilla.json',template()));
 $('#testSource').addEventListener('click',async()=>{await syncSource();toast(state.apiConfigured?'Archivo de cartelera leído. Consulta fecha y cobertura en el panel.':'Sin cartelera publicada; revisa el secreto y el flujo de GitHub Actions.');});
}
function handleListAction(e){const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.openMatch)openMatch(btn.dataset.openMatch);if(btn.dataset.openBet)openBet(btn.dataset.openBet);if(btn.hasAttribute('data-switch-settings'))showPage('settings');if(btn.hasAttribute('data-switch-dashboard'))showPage('dashboard');}
let lastClockDay=dayISO();
function autoTick(){
  const day=dayISO();$('#topTime').textContent=new Intl.DateTimeFormat('es-MX',{timeZone:TIMEZONE,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
  if(lastClockDay!==day){lastClockDay=day;state.day='today';render();void syncSource();return;}
  if(!state.loading&&(!state.lastFetchAt||Date.now()-state.lastFetchAt>30*60*1000))void syncSource();
}
async function init(){eventBindings();render();await syncSource();autoTick();setInterval(autoTick,60*1000);}
init();
