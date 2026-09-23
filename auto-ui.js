'use strict';

/**
 * Capa visual automática.
 * Se carga después de app.js y aprovecha m.autoAnalysis ya generado por Actions.
 */
(function(){
  const oldDecision=decision;

  decision=function(match,e=evaluation(match)){
    const manual=oldDecision(match,e);
    const a=match?.autoAnalysis;
    const hasManual=e && (e.pick!=='' || e.probability || e.odds || Object.keys(e.checks||{}).length);
    if(hasManual || !a) return manual;

    return {
      ready:a.verdict==='BET',
      watch:a.verdict==='WATCH',
      reasons:[...(a.reasons||[]),...(a.warnings||[])],
      reviewed:Object.keys(a.evidence||{}).length,
      total:29,
      implied:a.marketProbability||null,
      ev:Number.isFinite(Number(a.edge))?Number(a.edge)/100:null,
      p:Number.isFinite(Number(a.probability))?Number(a.probability):null,
      odds:Number.isFinite(Number(a.odds))?Number(a.odds):null,
      auto:true,
      pickName:a.pickName||null
    };
  };

  matchRows=function(matches){
    return matches.map(m=>{
      const d=decision(m), a=m.autoAnalysis||{}, p=m.players||[];
      const price=d.odds;
      let verdict='<span class="tag amber">NO APOSTAR</span>';
      if(a.verdict==='BET') verdict='<span class="tag green">APOSTAR</span>';
      else if(a.verdict==='WATCH') verdict='<span class="tag neutral">PRESELECCIÓN</span>';
      else if(m.status==='live') verdict='<span class="tag neutral">EN VIVO</span>';
      else if(m.status==='finished') verdict='<span class="tag neutral">FINALIZADO</span>';

      const pick=a.pickName?`<small style="color:var(--lime)">Selección modelo: ${escapeHTML(a.pickName)}</small>`:'';
      const prob=a.probability?`<small>Prob. modelo: ${escapeHTML(a.probability)}%</small>`:'';
      return `<div class="match-row">
        <div class="match-time"><strong>${escapeHTML(timeText(m))}</strong><small>${m.timeVerified?'Hora MTY':'Horario sin validar'}</small></div>
        <div class="versus"><strong><span class="flag">${escapeHTML(p[0]?.country||'—')}</span> ${escapeHTML(p[0]?.name||'Jugador pendiente')}</strong><small class="vs">VS</small><strong><span class="flag">${escapeHTML(p[1]?.country||'—')}</span> ${escapeHTML(p[1]?.name||'Jugador pendiente')}</strong></div>
        <div class="match-detail"><strong>${escapeHTML(m.surface||'Superficie sin datos')}</strong><small>${escapeHTML(m.round||'Ronda sin datos')}${m.draw==='doubles'?' · DOBLES':''}</small></div>
        <div class="odds-block"><strong>${price?fnum(price):'—'}</strong><small>${price?'Cuota/mercado automático':'Sin cuota automática'}</small></div>
        <div class="decision">${verdict}${pick}${prob}<small>${escapeHTML((a.reasons||[])[0]||(a.warnings||[])[0]||'Análisis automático')}</small></div>
        <button class="analysis-btn" data-open-match="${escapeHTML(m.id)}">Ver análisis ↗</button>
      </div>`;
    }).join('');
  };

  // Cambia textos del tablero para dejar claro qué hace el motor.
  const label=document.querySelector('.stat-card:nth-child(2) .stat-caption');
  if(label) label.innerHTML='SELECCIONES DEL MODELO <span>◎</span>';

  const note=document.querySelector('.method-note p');
  if(note) note.textContent='El motor automático prioriza individuales, ranking, superficie, localía y carga de calendario. APOSTAR solo aparece si también existe un precio automático compatible y supera los umbrales; no es una garantía de resultado.';

  render();
})();
