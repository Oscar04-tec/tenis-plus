'use strict';

/**
 * Tenis Plus — análisis automático conservador.
 * Usa datos realmente disponibles. Nunca considera una apuesta "segura".
 * En plan FREE produce PRESELECCIÓN / NO APOSTAR.
 * Si la misma clave se actualiza a PRO, intenta usar mercado match-winner
 * para habilitar APOSTAR cuando también se cumplen los filtros cuantitativos.
 */

const MAX_PROFILE_MATCHES = 10;
const MIN_ODDS = 1.20;
const MIN_PROB = 0.82;
const MIN_EDGE = 0.03;

const n = v => Number.isFinite(Number(v)) ? Number(v) : null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const isDoubles=m=>m.draw==='doubles'||(m.players||[]).some(p=>String(p.name||'').includes('/'));
const rankProb=(fav,dog)=>{
  if(!(fav>0&&dog>0)) return null;
  return clamp(1/(1+Math.exp(-1.35*Math.log(dog/fav))),0.5,0.92);
};

function scoreCandidate(m){
  if(!m || m.status!=='scheduled' || !m.timeVerified || isDoubles(m)) return -999;
  const r=(m.players||[]).map(p=>n(p.ranking));
  if(!(r[0]>0&&r[1]>0)) return -100;
  const fav=Math.min(...r), dog=Math.max(...r);
  let s=Math.log2(Math.max(1,dog/fav))*20 + Math.min(35,(dog-fav)/4);
  if(['ATP','WTA'].includes(m.tour)) s+=15;
  else if(m.tour==='CHALLENGER') s+=8;
  if(m.surface) s+=5;
  return s;
}

async function getProfiles(records,provider){
  const top=[...records].sort((a,b)=>scoreCandidate(b)-scoreCandidate(a))
    .filter(x=>scoreCandidate(x)>0).slice(0,MAX_PROFILE_MATCHES);
  const ids=[...new Set(top.flatMap(m=>(m.players||[]).map(p=>p.id)).filter(Boolean))].slice(0,MAX_PROFILE_MATCHES*2);
  const out=new Map();
  for(const id of ids){
    try{
      const raw=await provider.upstream('/players/'+encodeURIComponent(id),false);
      const obj=raw?.data && !Array.isArray(raw.data) ? raw.data : raw;
      if(obj && typeof obj==='object') out.set(String(id),obj);
    }catch(e){
      if(e?.status===429) break;
    }
  }
  return out;
}

function profileRank(profile){
  const candidates=[
    profile?.ranking, profile?.current_rank, profile?.currentRank,
    profile?.curRank?.position, profile?.rank
  ].map(n).filter(x=>x>0);
  return candidates[0]||null;
}

function localRisk(m,pick){
  const host=String(m.hostCountry||'').toUpperCase();
  const pc=String(m.players?.[pick]?.country||'').toUpperCase();
  const oc=String(m.players?.[1-pick]?.country||'').toUpperCase();
  if(!host) return {risk:false,note:'País sede no publicado.'};
  if(oc && oc===host && pc!==host) return {risk:true,note:'El rival aparece como local del país sede.'};
  if(pc && pc===host && oc!==host) return {risk:false,note:'La selección aparece como local del país sede.'};
  return {risk:false,note:'No se detecta una localía exclusiva con los códigos disponibles.'};
}

function scheduleRisk(m,records,pick){
  const ids=[m.players?.[pick]?.id,m.players?.[1-pick]?.id].filter(Boolean).map(String);
  if(!ids.length || !m.startAt) return {risk:false,note:'Sin datos suficientes para detectar carga cercana.'};
  const t=Date.parse(m.startAt);
  const close=records.filter(x=>x.id!==m.id && x.startAt && Math.abs(Date.parse(x.startAt)-t)<=36*3600000)
    .filter(x=>(x.players||[]).some(p=>ids.includes(String(p.id))));
  return close.length
    ? {risk:true,note:'Hay otro partido programado para uno de los jugadores dentro de ±36 h.'}
    : {risk:false,note:'No se detecta otro partido para estos jugadores dentro de ±36 h.'};
}

function readMarketProbability(payload,pickIndex){
  // La documentación describe las quotes como probabilidades de ganar el partido.
  // Como el esquema detallado puede variar por versión, se buscan estructuras comunes.
  const prices=Array.isArray(payload?.prices)?payload.prices:[];
  if(!prices.length) return null;

  const newest=prices[0];
  const sideKeys=pickIndex===0 ? ['p1','player1','side1','1'] : ['p2','player2','side2','2'];
  const candidates=[];

  const scan=(obj,path='')=>{
    if(!obj||typeof obj!=='object') return;
    for(const [k,v] of Object.entries(obj)){
      const low=k.toLowerCase();
      if(typeof v==='number' && v>0 && v<1.01){
        if(sideKeys.some(s=>low===s || path.toLowerCase().includes(s))) candidates.push(v);
      } else if(v&&typeof v==='object') scan(v,path+'.'+low);
    }
  };
  scan(newest);
  if(candidates.length) return candidates[0];
  return null;
}

async function tryMarket(match,provider,pick){
  try{
    const p=await provider.upstream('/markets/'+encodeURIComponent(match.sourceId)+'/prices?limit=5',false);
    const prob=readMarketProbability(p,pick);
    if(prob && prob>0 && prob<1) return {prob,odds:1/prob,source:'Live Tennis API PRO'};
    return null;
  }catch(e){
    // 403 = plan FREE/BASIC; se considera simplemente sin mercado automático.
    return null;
  }
}

async function analyseOne(m,records,profiles,provider){
  const out={
    generatedAt:new Date().toISOString(),
    verdict:'NO_BET',
    pickIndex:null,pickName:null,
    probability:null,confidence:null,
    marketProbability:null,odds:null,edge:null,
    reasons:[],warnings:[],evidence:{}
  };

  if(isDoubles(m)){ out.reasons.push('Dobles: fuera del modelo automático individual.'); return out; }
  if(m.status!=='scheduled'){ out.reasons.push('El partido no está en estado prepartido programado.'); return out; }
  if(!m.timeVerified) out.reasons.push('Horario no verificado.');
  if(!m.surface) out.reasons.push('Superficie no publicada.');

  let ranks=(m.players||[]).map(p=>n(p.ranking));
  for(let i=0;i<2;i++){
    if(!(ranks[i]>0) && m.players?.[i]?.id){
      const pr=profileRank(profiles.get(String(m.players[i].id)));
      if(pr>0) ranks[i]=pr;
    }
  }
  if(!(ranks[0]>0&&ranks[1]>0)){
    out.reasons.push('No hay ranking actual para ambos jugadores.');
    return out;
  }

  const pick=ranks[0]<=ranks[1]?0:1, other=1-pick;
  const p=rankProb(ranks[pick],ranks[other]);
  out.pickIndex=pick;
  out.pickName=m.players[pick].name;
  out.probability=Math.round(p*1000)/10;
  out.confidence=p>=0.90?'MUY ALTA':p>=0.85?'ALTA':p>=0.78?'MODERADA':p>=0.70?'RIESGO':'EVITAR';
  out.evidence.ranking={pickRank:ranks[pick],opponentRank:ranks[other]};
  out.evidence.surface=m.surface||null;

  const loc=localRisk(m,pick);
  out.evidence.localia=loc.note;
  if(loc.risk) out.reasons.push(loc.note);

  const sched=scheduleRisk(m,records,pick);
  out.evidence.fatiga=sched.note;
  if(sched.risk) out.reasons.push(sched.note);

  if(p<MIN_PROB) out.reasons.push('Probabilidad del modelo inferior a 82%.');

  const market=await tryMarket(m,provider,pick);
  if(market){
    out.marketProbability=Math.round(market.prob*1000)/10;
    out.odds=Math.round(market.odds*100)/100;
    out.edge=Math.round((p*market.odds-1)*1000)/10;
    out.evidence.market=market.source;
    if(out.odds<MIN_ODDS) out.reasons.push('Cuota equivalente inferior a 1.20.');
    if((p*market.odds-1)<MIN_EDGE) out.reasons.push('Valor esperado automático inferior a 3%.');
  } else {
    out.warnings.push('No hay cuota automática disponible con el plan actual.');
  }

  // Plan FREE: sí hace análisis y priorización, pero no autoriza APOSTAR sin precio.
  if(!market){
    out.verdict=(p>=MIN_PROB && !loc.risk && !sched.risk && m.timeVerified && m.surface)
      ? 'WATCH' : 'NO_BET';
    return out;
  }

  out.verdict=(
    p>=MIN_PROB && out.odds>=MIN_ODDS && (p*market.odds-1)>=MIN_EDGE &&
    !loc.risk && !sched.risk && m.timeVerified && m.surface
  ) ? 'BET' : 'NO_BET';

  return out;
}

async function analyseCalendar(records,provider){
  const profiles=await getProfiles(records,provider);
  const ranked=[...records].sort((a,b)=>scoreCandidate(b)-scoreCandidate(a));
  const deep=new Set(ranked.filter(x=>scoreCandidate(x)>0).slice(0,MAX_PROFILE_MATCHES).map(x=>x.id));

  for(const m of records){
    if(deep.has(m.id)) m.autoAnalysis=await analyseOne(m,records,profiles,provider);
    else {
      m.autoAnalysis={
        generatedAt:new Date().toISOString(),verdict:'NO_BET',pickIndex:null,pickName:null,
        probability:null,confidence:null,marketProbability:null,odds:null,edge:null,
        reasons:[isDoubles(m)?'Dobles: fuera del modelo automático individual.':'Fuera del cupo diario de análisis profundo.'],
        warnings:[],evidence:{}
      };
    }
  }
  return records;
}

module.exports={analyseCalendar,scoreCandidate};
