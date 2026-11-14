/* 119hyd-Map2 · js/loc-check.js — 로드뷰 확인 표시 (로드뷰로 보고 지도 위치를 맞췄는지) */
AppFiles.reg('js/loc-check.js','v3.16.4'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 로드뷰 확인 (v3.16.0 → v3.16.4) ══════════
   소화전마다 '로드뷰로 보고 지도 위치를 맞췄는지(확인했는지)'를 남긴다.
     · 🟢 로드뷰 확인: 로드뷰 미니맵에서 위치를 옮겨 저장(미니맵·📐 조준)했거나, 미니맵 마커 메뉴 [✅ 로드뷰 확인]을 누른 것
     · ⚪ 로드뷰 미확인: 그 밖의 모든 것 — GPS·지도 클릭·일괄 위치수정으로 옮긴 것, 예전 위치 수정(loc_fixed_at)도 여기 (v3.16.4)
     · 정보카드는 표시와 [✕ 취소]만 (확인 버튼은 미니맵에만 — 로드뷰를 보고 누르도록)
     · 날짜·확인자·보정/맞음 구분은 툴팁과 📜 이력에
   저장: 소화전 추가정보(extra)의 _loc_ok = {at, by, method, kind} (DB 칸 추가 없음). method에 '로드뷰'가 들어간 것만 인정.
   _loc_ok === false 는 '취소'. 폐전·좌표 없는 소화전은 세지 않는다. */
function locOk(d){
  const v=d?.extra?._loc_ok;
  if(v&&typeof v==='object'&&v.at&&/로드뷰/.test(v.method||''))return v;
  return null;
}
function locCountable(d){return !!(d&&d.lat&&d.lng&&!isClosed(d));}
function locUncheckedCount(){return items.filter(d=>locCountable(d)&&!_baseHidden(d)&&!locOk(d)).length;}
function _locDateText(at){const t=new Date(at);return isNaN(t)?'':`${String(t.getFullYear()).slice(-2)}.${t.getMonth()+1}.${t.getDate()}`;}
// 보정(위치를 옮겨 저장) / 확인(옮기지 않고 [✅ 위치 맞음]) 구분 (v3.16.1)
function locKind(ok){
  if(!ok)return '';
  if(ok.kind)return ok.kind;
  return /확인/.test(ok.method||'')?'check':'fix';
}
function locLabel(ok){return '로드뷰 확인';}
function locKindText(ok){return locKind(ok)==='check'?'위치 맞음':'위치 보정';}
// 정보카드 표시 — 짧게. 날짜·확인자·방법은 손가락을 대거나 마우스를 올리면 보이고, 📜 이력에 남음
function locBadgeHtml(idx,d){
  if(!d.lat||!d.lng)return '';
  const ok=locOk(d);
  if(ok){
    const tip=`로드뷰 확인(${locKindText(ok)}) ${_locDateText(ok.at)}${ok.by?' · '+ok.by:''}${ok.method?' · '+ok.method:''}`;
    return `<span class="loc-ok" title="${esc(tip)}">🟢 ${locLabel(ok)}`
      +`<button class="loc-undo" onclick="event.stopPropagation();setLocOk(${idx},false)" title="${esc(tip)} — 누르면 표시 취소(로드뷰 미확인으로)">✕</button></span>`;
  }
  return `<span class="loc-no" title="로드뷰 미니맵에서 위치를 맞추거나 마커 메뉴의 [✅ 로드뷰 확인]을 누르면 바뀝니다">⚪ 로드뷰 미확인</span>`;
}
// 위치 수정 저장 때 함께 넣을 값 (location.js · batch-fix.js에서 extra에 섞음)
function locOkValue(method,kind){return {at:new Date().toISOString(),by:getInspName()||'',method:method||'',kind:kind||'fix'};}
// 미니맵 [✅ 로드뷰 확인] / 정보카드 [✕ 취소]
async function setLocOk(idx,ok,method){
  const d=items[idx];if(!d)return;
  const prev=d.extra;
  const extra={...(d.extra||{}),_loc_ok:ok?locOkValue(method||'확인','check'):false};
  d.extra=extra;
  try{
    await SupabaseUtil.update('hydmap_items',{extra},{id:d.id});
    logHistory(d,ok?'로드뷰 확인':'로드뷰 확인 취소',{method:ok?(method||'확인'):null});
    showToast(ok?'🟢 로드뷰 확인으로 표시했습니다':'⚪ 로드뷰 미확인으로 되돌렸습니다',ok?'ok':'');
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
