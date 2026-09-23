'use strict';
/** Ejecutar en GitHub Actions. Nunca imprime ni publica secretos. */
const fs=require('node:fs');
const path=require('node:path');
const provider=require('../free-provider');
const auto=require('./auto-analysis');

const OUTPUT=path.join(__dirname,'..','data','calendar.json');

function loadPrevious(){
  try{
    const p=JSON.parse(fs.readFileSync(OUTPUT,'utf8'));
    return p?.version===1&&p.days&&typeof p.days==='object'?p:null;
  }catch{return null;}
}

async function refresh(){
  const previous=loadPrevious();
  if(!process.env.LIVETENNISAPI_KEY){
    console.log('API sin clave: no se sobreescribe la cartelera.');
    return {updated:false,reason:'missing-key'};
  }

  const today=provider.localDate(new Date().toISOString());
  const tomorrow=provider.shift(today,1);
  const window=await provider.getWindow(today);

  if(!Array.isArray(window.records)) throw Error('La respuesta no contiene una lista de encuentros.');

  console.log('Aplicando análisis automático conservador...');
  await auto.analyseCalendar(window.records,provider);

  const days={};
  for(const day of [today,tomorrow]){
    const fresh=window.records.filter(m=>m.localDay===day)
      .sort((a,b)=>(a.startAt||a.rawStart||'').localeCompare(b.startAt||b.rawStart||''));
    const old=previous?.days?.[day];

    if(window.errors.length&&fresh.length===0&&Array.isArray(old?.matches)&&old.matches.length){
      days[day]={...old,complete:false,errors:[...(old.errors||[]),'La última consulta falló; datos anteriores retenidos.']};
      continue;
    }

    days[day]={
      matches:fresh,
      complete:window.errors.length===0,
      errors:window.errors,
      updatedAt:window.updatedAt,
      analysisUpdatedAt:new Date().toISOString()
    };
  }

  if(window.errors.length&&!window.records.length){
    console.log('La API no entregó registros y reportó incidencias: no se reemplaza el archivo anterior.');
    return {updated:false,reason:'provider-error'};
  }

  const payload={
    version:1,
    configured:true,
    source:'Live Tennis API',
    timezone:'America/Monterrey',
    updatedAt:window.updatedAt,
    complete:window.errors.length===0,
    errors:window.errors,
    automaticAnalysis:true,
    analysisMode:'Con FREE: preselección cuantitativa. Con PRO: puede usar mercado match-winner para habilitar APOSTAR.',
    days
  };

  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  const safeJSON=JSON.stringify(payload,null,2).replaceAll(process.env.LIVETENNISAPI_KEY,'[REDACTED]');
  fs.writeFileSync(OUTPUT,safeJSON+'\n');
  const bets=[today,tomorrow].flatMap(d=>days[d].matches).filter(m=>m.autoAnalysis?.verdict==='BET').length;
  const watches=[today,tomorrow].flatMap(d=>days[d].matches).filter(m=>m.autoAnalysis?.verdict==='WATCH').length;
  console.log(`Actualización: ${today} (${days[today].matches.length}), ${tomorrow} (${days[tomorrow].matches.length}). APOSTAR: ${bets}. PRESELECCIÓN: ${watches}.`);
  return {updated:true,payload};
}

if(require.main===module){
  refresh().catch(e=>{console.error('No se actualizó el calendario:',e.message);process.exitCode=1;});
}
module.exports={refresh,loadPrevious,OUTPUT};
