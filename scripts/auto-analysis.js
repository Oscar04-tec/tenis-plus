'use strict';

/**
 * Tenis Plus — motor automático conservador v2.1
 * Corrige falsos avisos de fatiga por partidos FUTUROS del mismo torneo.
 * FREE: puede generar "APOSTAR SI CUOTA >= 1.20" cuando ranking + Elo
 * confirman una ventaja fuerte. La cuota debe verificarse en tu casa.
 * PRO: además puede validar el precio del mercado automáticamente.
 */

const MAX_PROFILE_MATCHES = 20;
const MIN_ODDS = 1.20;
const MIN_PROB = 0.86;
const MIN_EDGE = 0.03;

const n = v => Number.isFinite(Number(v)) ? Number(v) : null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const isDoubles=m=>m.draw==='doubles'||(m.players||[]).some(p=>String(p.name||'').includes('/'));

const rankProb=(fav,dog)=>{
  if(!(fav>0&&dog>0)) return null;
  return clamp(1/(1+Math.exp(-1.35*Math.log(dog/fav))),0.5,0.92);
};
const eloProb=(e1,e2)=>{
  if(!(Number.isFinite(e1)&&Number.isFinite(e2))) return null;
  return clamp(1/(1+Math.pow(10,(e2-e1)/400)),0.05,0.95);
};

function walkNumbers(obj,path=[],out=[]){
  if(!obj || typeof obj!=='object') return out;
  for(const [k,v] of Object.entries(obj)){
    const p=[...path,String(k).toLowerCase()];
    if(typeof v==='number' && Number.isFinite(v)) out.push({path:p,value:v});
    else if(v && typeof v==='object') walkNumbers(v,p,out);
  }
  return out;
}

function currentElo(profile,surface){
  const nums=walkNumbers(profile?.stats?.ratings||{});
  const surf=String(surface||'').toLowerCase();
  const eloRows=nums.filter(x=>x.path.some(k=>k.includes('elo')) && x.value>500 && x.value<4000);
  if(!eloRows.length) return null;

  const surfaceHit=eloRows.find(x=>surf && x.path.some(k=>k===surf || k.includes(surf)));
  if(surfaceHit) return {value:surfaceHit.value,label:`Elo ${surf}`};

  const overall=eloRows.find(x=>x.path.some(k=>k.includes('overall')||k.includes('general')));
  return overall ? {value:overall.value,label:'Elo general'} : {value:eloRows[0].value,label:'Elo actual'};
}

function scoreCandidate(m){
  if(!m || m.status!=='scheduled' || !m.timeVerified || isDoubles(m)) return -999;
  const r=(m.players||[]).map(p=>n(p.ranking));
  if(!(r[0]>0&&r[1]>0)) return -100;
  const fav=Math.min(...r), dog=Math.max(...r);
  let s=Math.log2(Math.max(1,dog/fav))*20 + Math.min(35,(dog-fav)/4);
  if(['ATP','WTA'].includes(m.tour)) s+=18;
  else if(m.tour==='CHALLENGER') s+=10;
  else if(m.tour==='ITF') s-=8;
  if(m.surface) s+=5;
  return s;
}

async function getProfiles(records,provider){
  const top=[...records].sort((a,b)=>scoreCandidate(b)-scoreCandidate(a))
    .filter(x=>scoreCandidate(x)>0).slice(0,MAX_PROFILE_MATCHES);
  const ids=[...new Set(top.flatMap(m=>(m.players||[]).map(p=>p.id)).filter(Boolean))]
    .slice(0,MAX_PROFILE_MATCHES*2);

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
  return [
    profile?.ranking, profile?.current_rank, profile?.currentRank,
    profile?.curRank?.position, profile?.rank
  ].map(n).find(x=>x>0)||null;
}

function localRisk(m,pick){
  const host=String(m.hostCountry||'').toUpperCase();
  const pc=String(m.players?.[pick]?.country||'').toUpperCase();
  const oc=String(m.players?.[1-pick]?.country||'').toUpperCase();
  if(!host) return {risk:false,note:'País sede no publicado; localía sin confirmar.'};
  if(oc && oc===host && pc!==host) return {risk:true,note:'El rival aparece como local del país sede.'};
  if(pc && pc===host && oc!==host) return {risk:false,note:'La selección aparece como local del país sede.'};
  return {risk:false,note:'No se detecta una localía exclusiva con los códigos disponibles.'};
}

function scheduleRisk(m,records,pick){
  const ids=[m.players?.[pick]?.id,m.players?.[1-pick]?.id].filter(Boolean).map(String);
  if(!ids.length || !m.startAt) return {risk:false,note:'Sin datos suficientes para revisar carga previa.'};

  const t=Date.parse(m.startAt);

  // IMPORTANTE v2.1:
  // solo miramos partidos ANTERIORES. La v2 contaba una ronda futura posible
  // del mismo torneo como "fatiga", bloqueando todos los candidatos.
  const prior=records.filter(x=>{
    if(x.id===m.id || !x.startAt) return false;
    const xt=Date.parse(x.startAt);
    return Number.isFinite(xt) && xt<t && (t-xt)<=36*3600000;
  }).filter(x=>(x.players||[]).some(p=>ids.includes(String(p.id))));

  return prior.length
    ? {risk:true,note:'Se detecta otro partido ANTERIOR para uno de los jugadores dentro de las últimas 36 h.'}
    : {risk:false,note:'No se detecta otro partido anterior en las últimas 36 h dentro del calendario disponible.'};
}

function readMarketProbability(payload,pickIndex){
  const prices=Array.isArray(payload?.prices)?payload.prices:[];
  if(!prices.length) return null;
  const newest=prices[0];
  const sideKeys=pickIndex===0 ? ['p1','player1','side1','1'] : ['p2','player2','side2','2'];
  const candidates=[];
  const scan=(obj,path='')=>{
    if(!obj||typeof obj!=='object') return;
    for(const [k,v] of Object.entries(obj)){
      const low=k.toLowerCase(), here=(path+'.'+low).toLowerCase();
      if(typeof v==='number' && v>0 && v<1.01 && sideKeys.some(s=>low===s||here.includes(s)))
        candidates.push(v);
      else if(v&&typeof v==='object') scan(v,here);
    }
  };
  scan(newest);
  return candidates[0]||null;
}

async function tryMarket(match,provider,pick){
  try{
    const p=await provider.upstream('/markets/'+encodeURIComponent(match.sourceId)+'/prices?limit=5',false);
    const prob=readMarketProbability(p,pick);
    if(prob && prob>0 && prob<1) return {prob,odds:1/prob,source:'Live Tennis API PRO'};
    return null;
  }catch{
    return null;
  }
}

async function analyseOne(m,records,profiles,provider){
  const out={
    version:'2.1',
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
  const rp=rankProb(ranks[pick],ranks[other]);

  out.pickIndex=pick;
  out.pickName=m.players[pick].name;
  out.evidence.ranking={pickRank:ranks[pick],opponentRank:ranks[other]};
  out.evidence.surface=m.surface||null;

  const pa=profiles.get(String(m.players[pick]?.id));
  const pb=profiles.get(String(m.players[other]?.id));
  const ea=currentElo(pa,m.surface);
  const eb=currentElo(pb,m.surface);
  const ep=ea&&eb ? eloProb(ea.value,eb.value) : null;

  if(ep!==null){
    out.evidence.elo={
      pick:Math.round(ea.value), opponent:Math.round(eb.value),
      type:ea.label===eb.label?ea.label:'Elo actual'
    };
  } else {
    out.warnings.push('Elo actual no disponible para ambos jugadores.');
  }

  // Para una recomendación verde FREE exigimos que ranking Y Elo existan.
  // Ranking pesa 35%, Elo 65%.
  const p=ep!==null ? clamp(0.35*rp + 0.65*ep,0.5,0.95) : rp;
  out.probability=Math.round(p*1000)/10;
  out.confidence=p>=0.90?'MUY ALTA':p>=0.86?'ALTA':p>=0.80?'MODERADA':p>=0.72?'RIESGO':'EVITAR';

  const loc=localRisk(m,pick);
  out.evidence.localia=loc.note;
  if(loc.risk) out.reasons.push(loc.note);

  const sched=scheduleRisk(m,records,pick);
  out.evidence.fatiga=sched.note;
  if(sched.risk) out.reasons.push(sched.note);

  if(p<MIN_PROB) out.reasons.push('Probabilidad del modelo inferior a 86%.');

  const market=await tryMarket(m,provider,pick);
  if(market){
    out.marketProbability=Math.round(market.prob*1000)/10;
    out.odds=Math.round(market.odds*100)/100;
    out.edge=Math.round((p*market.odds-1)*1000)/10;
    out.evidence.market=market.source;

    if(out.odds<MIN_ODDS) out.reasons.push('Cuota equivalente inferior a 1.20.');
    if((p*market.odds-1)<MIN_EDGE) out.reasons.push('Valor esperado automático inferior a 3%.');

    out.verdict=(
      p>=MIN_PROB && out.odds>=MIN_ODDS && (p*market.odds-1)>=MIN_EDGE &&
      !loc.risk && !sched.risk && m.timeVerified && m.surface &&
      ['ATP','WTA','CHALLENGER'].includes(m.tour)
    ) ? 'BET' : 'NO_BET';

    return out;
  }

  // FREE: no existe precio. Aun así, mostramos de forma útil cuáles son las
  // preselecciones fuertes del modelo y la condición exacta que falta.
  const strong=(
    ep!==null &&
    p>=MIN_PROB &&
    !loc.risk &&
    !sched.risk &&
    m.timeVerified &&
    Boolean(m.surface) &&
    ['ATP','WTA','CHALLENGER'].includes(m.tour)
  );

  if(strong){
    out.verdict='BET_CONDITIONAL';
    out.warnings.push('APOSTAR SOLO SI tu casa ofrece moneyline >= 1.20 y no hay lesión/noticia adversa de última hora.');
  }else if(p>=0.80 && !loc.risk && !sched.risk){
    out.verdict='WATCH';
    out.warnings.push('Preselección: falta confirmación adicional antes de apostar.');
  }else{
    out.verdict='NO_BET';
  }

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
        version:'2.1',generatedAt:new Date().toISOString(),
        verdict:'NO_BET',pickIndex:null,pickName:null,probability:null,confidence:null,
        marketProbability:null,odds:null,edge:null,
        reasons:[isDoubles(m)?'Dobles: fuera del modelo automático individual.':'Fuera del cupo diario de análisis profundo.'],
        warnings:[],evidence:{}
      };
    }
  }
  return records;
}

module.exports={analyseCalendar,scoreCandidate};
