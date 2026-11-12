/* 119hyd-Map2 · js/loc-check.js — 위치 확인 표시 (로드뷰·현장으로 지도 위치가 맞는지 확인했는지) */
AppFiles.reg('js/loc-check.js','v3.16.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 위치 확인 (v3.16.0) ══════════
   소화전마다 '지도 위치가 실제와 맞는지 확인했는지'를 남긴다.
     · 확인됨: 위치 수정으로 저장했거나(자동) [✅ 위치 맞음]을 누른 것 — 정보카드 🟢 '위치 확인 · 11.12 강동규 (미니맵)'
     · 미확인: 정보카드 ⚪ '위치 미확인' + [✅ 위치 맞음], 로드뷰 미니맵에서 점선 테두리, 목록 위 '❔ 위치 미확인 N개'
   저장: 소화전 추가정보(extra)의 _loc_ok = {at, by, method} (DB 칸 추가 없음, '_'로 시작해 엑셀 칸으로 보이지 않음)
         _loc_ok === false 는 '확인 취소' (예전 위치 수정일 loc_fixed_at보다 우선)
   예전에 위치 수정한 소화전(loc_fixed_at 있음)도 확인된 것으로 본다. 폐전·좌표 없는 소화전은 세지 않는다. */
function locOk(d){
  const v=d?.extra?._loc_ok;
  if(v===false)return null;
  if(v&&typeof v==='object'&&v.at)return v;
  if(d?.loc_fixed_at)return {at:d.loc_fixed_at,by:'',method:'위치 수정'};
  return null;
}
function locCountable(d){return !!(d&&d.lat&&d.lng&&!isClosed(d));}
function locUncheckedCount(){return items.filter(d=>locCountable(d)&&!_baseHidden(d)&&!locOk(d)).length;}
function _locDateText(at){const t=new Date(at);return isNaN(t)?'':`${String(t.getFullYear()).slice(-2)}.${t.getMonth()+1}.${t.getDate()}`;}
// 정보카드 좌표 줄 옆 표시
function locBadgeHtml(idx,d){
  if(!d.lat||!d.lng)return '';
  const ok=locOk(d);
  if(ok){
    const tip=`위치 확인 ${_locDateText(ok.at)}${ok.by?' · '+ok.by:''}${ok.method?' ('+ok.method+')':''}`;
    return `<span class="loc-ok" title="${esc(tip)}">🟢 위치 확인 · ${_locDateText(ok.at)}${ok.by?' '+esc(ok.by):''}${ok.method?` <small>(${esc(ok.method)})</small>`:''}`
      +`<button class="loc-undo" onclick="event.stopPropagation();setLocOk(${idx},false)" title="위치 확인 취소">✕</button></span>`;
  }
  return `<span class="loc-no">⚪ 위치 미확인 <button class="loc-yes" onclick="event.stopPropagation();setLocOk(${idx},true)" title="지도 위치가 실제와 맞음 (위치는 그대로, 확인만 기록)">✅ 위치 맞음</button></span>`;
}
// 위치 수정 저장 때 함께 넣을 값 (location.js · batch-fix.js에서 extra에 섞음)
function locOkValue(method){return {at:new Date().toISOString(),by:getInspName()||'',method:method||''};}
// [✅ 위치 맞음] / [✕ 취소]
async function setLocOk(idx,ok,method){
  const d=items[idx];if(!d)return;
  const prev=d.extra;
  const extra={...(d.extra||{}),_loc_ok:ok?locOkValue(method||'확인'):false};
  d.extra=extra;
  try{
    await SupabaseUtil.update('hydmap_items',{extra},{id:d.id});
    logHistory(d,ok?'위치 확인':'위치 확인 취소',{method:ok?(method||'확인'):null});
    showToast(ok?'🟢 위치 확인으로 표시했습니다':'위치 확인을 취소했습니다',ok?'ok':'');
  }catch(e){
    d.extra=prev;
    showToast('저장 실패: '+(e?.message||''),'err');
  }
  locRefresh(idx);
}
// 표시 갱신: 열린 카드 · 목록 꼬리표 · 모아 보기 · 로드뷰 미니맵
function locRefresh(idx){
  if(idx>=0&&overlays[idx]?.popupRendered)hyReRender(idx);
  if(idx>=0)updateListItem(idx);
  if(quickFilter==='locno')applyFilter();else updateQuickChips();
  if(typeof _rvHySync==='function')_rvHySync();
}
