'use strict';
/** Calendario Live Tennis API FREE. Nunca expone claves ni rellena datos faltantes. */
const BASE='https://api.livetennisapi.com/api/public/v1';
const TZ='America/Monterrey';
const TTL=4*60*60*1000;
const MAX_CALLS=84; // colchón para el límite gratuito oficial de 100/día.
const LIMIT=200;
const buckets=new Map();
const tournamentCache=new Map();
const calls=[];
const inflight=new Map();
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const text=v=>typeof v==='string'?v.trim():'';
function localDate(iso){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}
function shift(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function key(){return process.env.LIVETENNISAPI_KEY||'';}
function normalizedTour(v){const t=text(v).toLowerCase();if(t.startsWith('challenger'))return 'CHALLENGER';if(t.startsWith('itf'))return 'ITF';if(t.startsWith('juniors'))return 'JUNIORS';if(t==='atp'||t.startsWith('atp_'))return 'ATP';if(t==='wta'||t.startsWith('wta_'))return 'WTA';return 'OTROS';}
function validTime(v){return typeof v==='string'&&/Z$|[+-]\d\d:\d\d$/.test(v)&&Number.isFinite(Date.parse(v));}
function country(v){const a=object(v);return text(a.country).toUpperCase()||null;}
function normalizeMatch(row){const p=object(row.players),p1=object(p.p1),p2=object(p.p2);
  const startAt=validTime(row.scheduled_time)?new Date(row.scheduled_time).toISOString():null;
  const day=startAt?localDate(startAt):(text(row.event_date).slice(0,10)||null);
  return {
    id:'free:'+String(row.id),sourceId:row.id,tour:normalizedTour(row.tour),draw:row.draw||null,
    tournamentId:row.tournament_id||null,tournament:text(row.tournament)||'Torneo no identificado',
    tier:text(row.tier).replace(/_/g,' ').toUpperCase()||null,
    location:'Sede no publicada',hostCountry:null,
    surface:text(row.surface)||null,round:text(row.round_code)||text(row.round)||null,
    startAt,rawStart:text(row.scheduled_time)||null,timeVerified:Boolean(startAt),localDay:day,
    scheduleNote:startAt?'Hora programada, sujeta a cambios':'Solo fecha publicada: hora sin confirmar',
    status:row.status==='live'?'live':row.status==='completed'?'finished':row.status==='upcoming'?'scheduled':'unknown',
    score:null,players:[{id:p1.id??null,name:text(p1.name)||'Jugador por confirmar',country:country(p1),ranking:p1.ranking??null},
      {id:p2.id??null,name:text(p2.name)||'Jugador por confirmar',country:country(p2),ranking:p2.ranking??null}],
    odds:[null,null],oddsSource:null,sourceUrl:'https://livetennisapi.com/',sourceLabel:'Live Tennis API FREE',
    fetchedAt:new Date().toISOString()
  };
}
function normalizeFixture(row){const t=normalizedTour(row.tour);
  const startAt=validTime(row.start_time)?new Date(row.start_time).toISOString():null;
  const eventDate=text(row.event_date).slice(0,10);
  return {
    id:'free:'+String(row.id),sourceId:row.id,tour:t,draw:row.draw||null,
    tournamentId:null,tournament:text(row.tournament)||'Torneo no identificado',tier:null,
    location:'Sede no publicada',hostCountry:null,surface:text(row.surface)||null,
    round:text(row.round_code)||text(row.round)||null,startAt,rawStart:text(row.start_time)||null,
    timeVerified:Boolean(startAt),localDay:startAt?localDate(startAt):eventDate||null,
    scheduleNote:startAt?'Hora anunciada, sujeta a cambios':'Fecha del proveedor (UTC); día local y horario por confirmar',
    status:row.status==='live'?'live':row.status==='upcoming'||!row.status?'scheduled':'unknown',score:null,
    players:[{id:row.player1_id??null,name:text(row.player1_name)||'Jugador por confirmar',country:null,ranking:null},
      {id:row.player2_id??null,name:text(row.player2_name)||'Jugador por confirmar',country:null,ranking:null}],
    odds:[null,null],oddsSource:null,sourceUrl:'https://livetennisapi.com/',sourceLabel:'Live Tennis API FREE',
    fetchedAt:new Date().toISOString()
  };
}
async function enrichTournamentLocations(records, errors){
  // Una consulta por torneo puede aportar sede a decenas de partidos. Priorizar
  // el mayor número de encuentros y limitar la búsqueda para proteger 100/día.
  const groups=new Map();
  for(const match of records.values()){
    if(match.tournamentId===null||match.tournamentId===undefined)continue;
    const id=String(match.tournamentId);
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(match);
  }
  const now=Date.now();
  const sorted=[...groups].sort((a,b)=>b[1].length-a[1].length);
  let newLookups=0;
  for(const [id,matches] of sorted){
    let item=tournamentCache.get(id);
    if(!item||item.expires<=now){
      if(newLookups>=8)continue;
      newLookups++;
      try{
        const response=object(await upstream('/tournaments/'+encodeURIComponent(id),false));
        item={value:response,expires:now+7*86400000};
        tournamentCache.set(id,item);
      }catch(e){
        item={value:null,expires:now+86400000};
        tournamentCache.set(id,item);
        if(e.status===429){errors.push('No fue posible consultar más sedes: límite de la API alcanzado.');break;}
        continue;
      }
    }
    const t=object(item.value),city=text(t.city),countryCode=text(t.country).toUpperCase();
    for(const m of matches){
      if(city||countryCode)m.location=[city,countryCode].filter(Boolean).join(', ');
      // country de torneo es ISO alpha-2; jugadores usan IOC alpha-3.
      // No atribuir localía automáticamente comparando códigos diferentes.
      if(!m.surface&&text(t.surface))m.surface=text(t.surface);
      // Tier pertenece a la edición del partido: no copiar el nivel del catálogo actual.
    }
  }
}
async function upstream(route,requireList=true){
  if(!key()){const e=new Error('Falta LIVETENNISAPI_KEY en el servidor.');e.status=503;throw e;}
  const now=Date.now();while(calls.length&&calls[0]<now-86400000)calls.shift();
  if(calls.length>=MAX_CALLS){const e=new Error('Límite preventivo gratuito alcanzado (84 llamadas/24 horas). Se mostrarán datos en caché si existen.');e.status=429;throw e;}
  calls.push(now);
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{
    const response=await fetch(BASE+route,{headers:{'X-API-Key':key(),Accept:'application/json'},signal:ctrl.signal});
    const json=await response.json().catch(()=>({}));
    if(!response.ok){const e=new Error(response.status===429?'La API alcanzó su límite: no se volverá a intentar hasta la próxima recarga de caché.':text(json.error)||text(json.message)||`HTTP ${response.status}`);e.status=response.status===429?429:502;throw e;}
    if(requireList&&!Array.isArray(json.data))throw new Error('Respuesta del proveedor sin lista de encuentros.');
    return json;
  }catch(e){if(e.name==='AbortError'){const err=new Error('Tiempo de espera de la API.');err.status=504;throw err;}throw e;}
  finally{clearTimeout(timer);}
}
async function pages(route,maxPages,cutoff){let out=[],complete=true;
  for(let i=0;i<maxPages;i++){
    const qs=route+(route.includes('?')?'&':'?')+`limit=${LIMIT}&offset=${i*LIMIT}`;
    const json=await upstream(qs),data=json.data;
    out.push(...data);
    const more=typeof object(json.meta).has_more==='boolean'?json.meta.has_more:data.length===LIMIT;
    if(!more)return {data:out,complete};
    if(cutoff&&data.length&&data.every(row=>{const d=text(row.event_date).slice(0,10)||(validTime(row.start_time)?row.start_time.slice(0,10):'');return d&&d>cutoff;}))return {data:out,complete};
    if(i===maxPages-1)complete=false;
  }
  return {data:out,complete};
}
function windowDay(day){const today=localDate(new Date().toISOString());return day===today||day===shift(today,1)?today:day;}
async function getWindow(day){
  const base=windowDay(day),now=Date.now(),existing=buckets.get(base);
  if(existing&&existing.expires>now)return existing.payload;
  if(inflight.has(base))return inflight.get(base);
  const job=(async()=>{
    const errors=[],records=new Map();
    const from=shift(base,-1),to=shift(base,3),cutoff=shift(base,2);
    const streams=[
      {label:'Próximos partidos',url:`/matches?status=upcoming&from=${from}&to=${to}`,max:8,kind:'match'},
      {label:'En juego',url:`/matches?status=live&from=${from}&to=${to}`,max:2,kind:'match'},
      {label:'Agenda adicional',url:'/fixtures',max:8,kind:'fixture',cutoff}
    ];
    for(const stream of streams){
      try{
        const result=await pages(stream.url,stream.max,stream.cutoff);
        if(!result.complete)errors.push(`${stream.label}: se alcanzó el tope de páginas; cobertura parcial.`);
        for(const row of result.data){
          if(row.id===null||row.id===undefined)continue;
          const match=stream.kind==='fixture'?normalizeFixture(row):normalizeMatch(row);
          const old=records.get(match.id);
          // La ficha de un partido (con tour y perfiles) prevalece sobre el índice de fixture.
          if(!old||stream.kind==='match'||(!old.timeVerified&&match.timeVerified))records.set(match.id,match);
        }
      }catch(e){errors.push(`${stream.label}: ${e.message}`);if(e.status===429)break;}
    }
    await enrichTournamentLocations(records,errors);
    const payload={records:[...records.values()],errors,complete:!errors.length,updatedAt:new Date().toISOString()};
    // Conservar partidos observados que desaparecen del feed FREE; NO asumir que terminaron.
    const previous=buckets.get(base)?.payload;
    if(previous){for(const m of previous.records){if(!records.has(m.id)&&[base,shift(base,1)].includes(m.localDay))records.set(m.id,{...m,status:'unknown',scheduleNote:'Ya no aparece en la cartelera FREE; estado y resultado sin verificar.'});}payload.records=[...records.values()];}
    buckets.set(base,{payload,expires:Date.now()+(errors.length?20*60000:TTL)});
    return payload;
  })();
  inflight.set(base,job);
  try{return await job;}finally{inflight.delete(base);}
}
async function fixtures(day){const data=await getWindow(day);
  const matches=data.records.filter(r=>r.localDay===day).sort((a,b)=>(a.startAt||a.rawStart||'').localeCompare(b.startAt||b.rawStart||''));
  return {day,timezone:TZ,matches,errors:data.errors,complete:data.complete,source:'Live Tennis API FREE',updatedAt:data.updatedAt,
    coverage:'ATP/WTA/Challenger/ITF/Juniors/otros del proveedor; resultados terminados, cuotas e historial no incluidos en FREE.',
    free:true};
}
async function getMatch(matchId){
  if(!/^\d{1,12}$/.test(String(matchId))){const e=new Error('ID de partido inválido.');e.status=400;throw e;}
  return upstream(`/matches/${matchId}`,false);
}
module.exports={fixtures,normalizeMatch,normalizeFixture,normalizedTour,windowDay,upstream,getMatch,getWindow,localDate,shift};
