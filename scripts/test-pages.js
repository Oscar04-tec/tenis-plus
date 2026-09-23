'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'data','calendar.json');
const original=fs.readFileSync(output);
const initialFetch=global.fetch,initialKey=process.env.LIVETENNISAPI_KEY;
process.env.LIVETENNISAPI_KEY='FAKE_TEST_KEY_NEVER_PUBLISH';
const free=require('../free-provider'),updater=require('./update-calendar');
const today=free.localDate(new Date().toISOString()),tomorrow=free.shift(today,1);
const atDay=d=>d+'T17:00:00Z';
const match=(id,day,tour='atp',status='upcoming')=>({id,tournament:'Torneo '+tour,tour,draw:'singles',tournament_id:tour==='atp'?'456':null,
  tier:tour==='itf'?'itf_m25':'atp_250',scheduled_time:atDay(day),status,surface:'hard',round_code:'R32',players:{p1:{id:10+id,name:'Persona '+id+' A',country:'mex',ranking:10},p2:{id:100+id,name:'Persona '+id+' B',country:'arg',ranking:20}}});
const upcoming=Array.from({length:201},(_,i)=>match(i+1,i===200?tomorrow:today,i===1?'wta':i===2?'challenger':i===3?'itf':i===4?'juniors':'atp'));
let calls=0;
global.fetch=async (address,options)=>{
  assert.equal(options.headers['X-API-Key'],process.env.LIVETENNISAPI_KEY);
  calls++;
  const u=new URL(address);let data=[],meta={has_more:false};
  if(u.pathname.endsWith('/matches')&&u.searchParams.get('status')==='upcoming'){
    const offset=Number(u.searchParams.get('offset'));data=upcoming.slice(offset,offset+200);meta.has_more=offset===0;
  }else if(u.pathname.endsWith('/matches')&&u.searchParams.get('status')==='live')data=[match(1,today,'atp','live')];
  else if(u.pathname.endsWith('/fixtures'))data=[{id:202,event_date:today,start_time:null,player1_name:'Sin hora A',player2_name:'Sin hora B',tour:'itf',tournament:'ITF sin hora'}];
  else if(u.pathname.endsWith('/tournaments/456'))return {ok:true,status:200,json:async()=>({id:'456',city:'Ciudad publicada',country:'MX',surface:'hard',tier:'atp_500'})};
  return {ok:true,status:200,json:async()=>({data,meta})};
};
(async()=>{
  try{
    const result=await updater.refresh();assert.equal(result.updated,true);
    const payload=JSON.parse(fs.readFileSync(output,'utf8'));
    assert.equal(payload.configured,true);assert.equal(payload.days[today].matches.length,201);
    assert.equal(payload.days[tomorrow].matches.length,1);
    for(const c of ['ATP','WTA','CHALLENGER','ITF','JUNIORS'])assert.ok(payload.days[today].matches.some(m=>m.tour===c),c);
    assert.equal(payload.days[today].matches.find(m=>m.sourceId===1).status,'live');
    assert.equal(payload.days[today].matches.find(m=>m.sourceId===202).timeVerified,false);
    assert.equal(payload.days[today].matches.find(m=>m.sourceId===1).location,'Ciudad publicada, MX');
    assert.equal(payload.days[today].matches.find(m=>m.sourceId===1).tier,'ATP 250','No se debe usar el tier actual del catálogo como tier histórico');
    assert.ok(calls<=26,'Máximo de 26 llamadas por ejecución');
    assert.ok(!fs.readFileSync(output,'utf8').includes('FAKE_TEST_KEY_NEVER_PUBLISH'));
    console.log('PASS: 200+ encuentros y separación de hoy/mañana sin perder ATP/WTA/Challenger/ITF/Junior.');
    console.log('PASS: deduplicación, horario sin confirmar, sede y tier de edición conservado.');
    console.log('PASS: límite de peticiones y secreto fuera de datos públicos.');
    execFileSync(process.execPath,[path.join(__dirname,'build-site.js')],{stdio:'pipe'});
    const dist=path.join(root,'dist'),publicFiles=fs.readdirSync(dist).sort();
    assert.deepEqual(publicFiles,['.nojekyll','app.js','data','favicon.svg','index.html','styles.css']);
    assert.ok(!fs.readFileSync(path.join(dist,'data','calendar.json'),'utf8').includes('FAKE_TEST_KEY_NEVER_PUBLISH'));
    const js=fs.readFileSync(path.join(dist,'app.js'),'utf8');
    assert.ok(js.includes("'./data/calendar.json?refresh='"));
    assert.ok(!js.includes('/api/')&&!js.includes('RESEARCH_SNAPSHOT'));
    console.log('PASS: dist/ es 100% estático, sin claves, sin servidor y sin cartera histórica falsa.');
    delete process.env.LIVETENNISAPI_KEY;
    const before=fs.readFileSync(output,'utf8');
    const noKey=await updater.refresh();assert.equal(noKey.updated,false);assert.equal(fs.readFileSync(output,'utf8'),before);
    console.log('PASS: ausencia de clave conserva los datos anteriores sin publicarlos falsamente como nuevos.');
    console.log('TODAS LAS PRUEBAS DE GITHUB PAGES SUPERADAS');
  }finally{
    fs.writeFileSync(output,original);
    if(initialKey===undefined)delete process.env.LIVETENNISAPI_KEY;else process.env.LIVETENNISAPI_KEY=initialKey;
    global.fetch=initialFetch;
  }
})().catch(err=>{console.error(err);process.exitCode=1});
