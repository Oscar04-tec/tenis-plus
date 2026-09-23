'use strict';

/* Tenis Plus v2.1 — presentación del análisis automático */
(function(){
  const oldDecision=decision;

  decision=function(match,e=evaluation(match)){
    const manual=oldDecision(match,e);
    const a=match?.autoAnalysis;
    const hasManual=e && (e.pick!=='' || e.probability || e.odds || Object.keys(e.checks||{}).length);
    if(hasManual || !a) return manual;

    return {
      ready:['BET','BET_CONDITIONAL'].includes(a.verdict),
      watch:a.verdict==='WATCH',
      conditional:a.verdict==='BET_CONDITIONAL',
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
      let verdict='<span class="tag amber">NO APOSTAR</span>';
      if(a.verdict==='BET') verdict='<span class="tag green">APOSTAR</span>';
      else if(a.verdict==='BET_CONDITIONAL') verdict='<span class="tag green">APOSTAR SI CUOTA ≥ 1.20</span>';
      else if(a.verdict==='WATCH') verdict='<span class="tag neutral">PRESELECCIÓN</span>';
      else if(m.status==='live') verdict='<span class="tag neutral">EN VIVO</span>';
      else if(m.status==='finished') verdict='<span class="tag neutral">FINALIZADO</span>';

      const pick=a.pickName?`<small style="color:var(--lime)">Modelo: ${escapeHTML(a.pickName)}</small>`:'';
      const prob=a.probability?`<small>Prob. modelo: ${escapeHTML(a.probability)}% · ${escapeHTML(a.confidence||'')}</small>`:'';
      const elo=a.evidence?.elo?`<small>Elo: ${escapeHTML(a.evidence.elo.pick)} vs ${escapeHTML(a.evidence.elo.opponent)}</small>`:'';
      const reason=(a.reasons||[])[0]||(a.warnings||[])[0]||'Análisis automático';

      return `<div class="match-row">
        <div class="match-time"><strong>${escapeHTML(timeText(m))}</strong><small>${m.timeVerified?'Hora MTY':'Horario sin validar'}</small></div>
        <div class="versus"><strong><span class="flag">${escapeHTML(p[0]?.country||'—')}</span> ${escapeHTML(p[0]?.name||'Jugador pendiente')}</strong><small class="vs">VS</small><strong><span class="flag">${escapeHTML(p[1]?.country||'—')}</span> ${escapeHTML(p[1]?.name||'Jugador pendiente')}</strong></div>
        <div class="match-detail"><strong>${escapeHTML(m.surface||'Superficie sin datos')}</strong><small>${escapeHTML(m.round||'Ronda sin datos')}${m.draw==='doubles'?' · DOBLES':''}</small></div>
        <div class="odds-block"><strong>${d.odds?fnum(d.odds):'—'}</strong><small>${d.odds?'Precio automático':'Verificar cuota en casa'}</small></div>
        <div class="decision">${verdict}${pick}${prob}${elo}<small>${escapeHTML(reason)}</small></div>
        <button class="analysis-btn" data-open-match="${escapeHTML(m.id)}">Ver análisis ↗</button>
      </div>`;
    }).join('');
  };

  const label=document.querySelector('.stat-card:nth-child(2) .stat-caption');
  if(label) label.innerHTML='SELECCIONES DEL MODELO <span>◎</span>';

  const note=document.querySelector('.method-note p');
  if(note) note.textContent='En FREE, “APOSTAR SI CUOTA ≥ 1.20” significa que ranking + Elo + controles automáticos superaron el filtro, pero debes confirmar el momio y noticias de última hora. No es una garantía de victoria.';

  render();
})();
