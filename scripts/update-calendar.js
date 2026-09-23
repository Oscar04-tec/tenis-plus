'use strict';
/** Ejecutar en GitHub Actions, nunca en el navegador. No imprime ni publica secretos. */
const fs=require('node:fs');
const path=require('node:path');
const provider=require('../free-provider');
const OUTPUT=path.join(__dirname,'..','data','calendar.json');
function loadPrevious(){
  try {const p=JSON.parse(fs.readFileSync(OUTPUT,'utf8'));return p?.version===1&&p.days&&typeof p.days==='object'?p:null;}
  catch{return null;}
}
async function refresh(){
  const previous=loadPrevious();
  if(!process.env.LIVETENNISAPI_KEY){
    console.log('API sin clave: no se sobreescribe la cartelera. Configura LIVETENNISAPI_KEY en Actions Secrets.');
    return {updated:false,reason:'missing-key'};
  }
  const today=provider.localDate(new Date().toISOString());
  const tomorrow=provider.shift(today,1);
  const window=await provider.getWindow(today);
  if(!Array.isArray(window.records))throw Error('La respuesta no contiene una lista de encuentros.');
  const days={};
  for(const day of [today,tomorrow]){
    const fresh=window.records.filter(m=>m.localDay===day).sort((a,b)=>(a.startAt||a.rawStart||'').localeCompare(b.startAt||b.rawStart||''));
    const old=previous?.days?.[day];
    // No borrar una jornada existente cuando la API está fallando y no devolvió registros.
    if(window.errors.length&&fresh.length===0&&Array.isArray(old?.matches)&&old.matches.length){
      days[day]={...old,complete:false,errors:[...(old.errors||[]),'La última consulta falló o tuvo cobertura parcial; datos anteriores retenidos.']};
      continue;
    }
    days[day]={matches:fresh,complete:window.errors.length===0,errors:window.errors,updatedAt:window.updatedAt};
  }
  if(window.errors.length&&!window.records.length){
    console.log('La API no entregó registros y reportó incidencias: no se reemplaza el archivo anterior.');
    return {updated:false,reason:'provider-error'};
  }
  const payload={version:1,configured:true,source:'Live Tennis API FREE',timezone:'America/Monterrey',updatedAt:window.updatedAt,
    complete:window.errors.length===0,errors:window.errors,days};
  fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
  const safeJSON=JSON.stringify(payload,null,2).replaceAll(process.env.LIVETENNISAPI_KEY,'[REDACTED]');
  fs.writeFileSync(OUTPUT,safeJSON+'\n');
  console.log(`Actualización: ${today} (${days[today].matches.length}), ${tomorrow} (${days[tomorrow].matches.length}). Cobertura: ${payload.complete?'sin avisos':'parcial'}.`);
  return {updated:true,payload};
}
if(require.main===module){refresh().catch(e=>{console.error('No se actualizó el calendario:',e.message);process.exitCode=1;});}
module.exports={refresh,loadPrevious,OUTPUT};
