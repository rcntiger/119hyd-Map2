/* 119hyd-Map2 · js/closed.js — 폐전 표시 (지우지 않고 표시만: 회색 마커 · 진행률과 인쇄에서 제외 · 되돌리기 가능) */
AppFiles.reg('js/closed.js','v3.5.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 폐전 표시 ══════════
   폐전된 소화전은 지우지 않고 표시만 한다. 지우면 과거 점검 기록·이력이 사라지고, 같은 엑셀을 다시 올리면 되살아나기 때문.
   저장 위치: hydmap_items.extra 안의 _closed_at(처리 시각) · _closed_by(처리한 사람) — 표를 바꾸지 않으므로 SQL 실행이 필요 없다.
   ('_'로 시작하는 extra 값은 정보카드의 추가정보 줄에 나오지 않는다)
   폐전으로 표시하면: 마커 회색(✕) · 목록에 "폐전" · 진행률/홈 카드 개수에서 제외 · 인쇄(목록표·지도)에서 제외.
   점검 입력·완료 버튼은 숨기고 메모와 사진은 남긴다 (철거 현장 사진 등을 붙일 수 있게).
   폐전 처리·취소는 관리자만 할 수 있다 (버튼은 관리자에게만 보이고, 함수에서도 한 번 더 막는다). */
function isClosed(d){return !!(d&&d.extra&&d.extra._closed_at);}
function closedCount(){return items.filter(d=>isClosed(d)&&!_baseHidden(d)).length;}

async function toggleClosed(idx){
  const d=items[idx];if(!d||!currentProject)return;
  if(!requireAdmin())return; // 폐전 처리·취소는 관리자만
  const was=isClosed(d);
  if(!was){
    if(!confirm(`${d.name}\n\n이 소화전을 "폐전"으로 표시할까요?\n· 마커가 회색으로 바뀌고 진행률과 인쇄에서 빠집니다\n· 점검 기록과 이력은 그대로 남고, 언제든 취소할 수 있습니다`))return;
  }else if(!confirm(`${d.name}\n\n폐전 표시를 취소하고 다시 점검 대상으로 돌릴까요?`))return;
  const extra={...(d.extra||{})};
  if(was){delete extra._closed_at;delete extra._closed_by;}
  else{extra._closed_at=new Date().toISOString();extra._closed_by=getInspName()||'';}
  const next=Object.keys(extra).length?extra:null;
  try{
    await SupabaseUtil.update('hydmap_items',{extra:next},{id:d.id});
  }catch(e){showToast('폐전 표시 저장 실패: '+(e?.message||''),'err');return;}
  d.extra=next;
  logHistory(d,was?'폐전 취소':'폐전 처리');
  syncClosedMarker(idx);
  hyReRender(idx);       // 정보카드를 폐전용/일반용으로 다시 그림
  updateListItem(idx);
  applyFilter();         // 진행률 · 모아 보기 버튼 · 겹침 이름표 갱신
  showToast(was?'폐전 표시를 취소했습니다':'🚫 폐전으로 표시했습니다','ok');
}
// 마커 색·아이콘·이름표를 폐전 여부에 맞춘다
function syncClosedMarker(idx){
  const d=items[idx],o=overlays[idx];if(!d||!o)return;
  const mk=o.overlay?.getContent&&o.overlay.getContent();
  if(mk)mk.classList.toggle('closed',isClosed(d));
  updateMarkerIcon(idx);
  const lb=o.labelOverlay?.getContent&&o.labelOverlay.getContent();
  if(lb){lb.textContent=labelText(d);lb.style.opacity=isClosed(d)?'.65':'';}
}
// 폐전된 소화전의 정보카드: 점검 입력·완료 버튼 대신 폐전 안내와 취소 버튼. 메모·사진은 그대로 쓸 수 있다.
function renderClosedPopup(iwEl,idx,d){
  const memo=memoMap[d.id]||'';
  const at=new Date(d.extra._closed_at);
  const when=isNaN(at)?'':`${at.getFullYear()}.${at.getMonth()+1}.${at.getDate()}`;
  const by=d.extra._closed_by||'';
  iwEl.innerHTML=`
    <div class="iw-header">
      <span class="iw-team-badge" style="background:#e5e7eb;color:#4b5563">🚫 폐전</span>
      <span class="iw-close" onclick="closeIw()">✕</span>
    </div>
    <div class="iw-name-row">
      <div class="iw-name" style="color:#6b7280">${esc(d.name)}</div>
      <div class="iw-name-btns">
        <button class="iw-rv-inline" onclick="showHistory(${idx})" title="이 소화전의 위치·점검 변경 기록">📜 이력</button>
      </div>
    </div>
    ${d.address?`<div class="iw-addr-row"><span class="iw-addr iw-addr-full">📍 ${esc((d.address||'').replace(/^서울특별시\s*/,''))}</span></div>`:''}
    <div class="iw-latlng-row">🧭 위도 ${d.lat?d.lat.toFixed(6):'-'}, 경도 ${d.lng?d.lng.toFixed(6):'-'}${d.group_name?` · ${esc(d.group_name)}`:''}</div>
    <div class="iw-closed-box">
      <b>폐전된 소화전입니다</b>${when?` — ${when}`:''}${by?` · ${esc(by)}`:''}<br>
      진행률과 인쇄에서 빠집니다. 점검 기록과 이력은 남아 있습니다.
      <button class="iw-closed-undo admin-only" onclick="toggleClosed(${idx})">↩ 폐전 취소 (다시 점검 대상으로)</button>
    </div>
    <div class="iw-divider"></div>
    <div class="iw-memo">
      <div class="iw-memo-header">
        <span class="iw-memo-title">📝 메모</span>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end">
          <span class="iw-memo-status" id="memoSt-${idx}"></span>
          <button class="iw-memo-save" onclick="saveMemoNow(${idx})">💾 저장</button>
          <button class="iw-memo-del" onclick="deleteMemoNow(${idx})">🗑 삭제</button>
          <button class="iw-rv-inline" onclick="openPhotoSheet(${idx})" title="사진 추가">📷 사진+</button>
        </div>
      </div>
      <textarea id="memo-${idx}" placeholder="폐전 사유, 확인 내용 등..." oninput="onMemoInput(${idx},this)">${esc(memo)}</textarea>
      <div class="iw-memo-actions"><span class="iw-memo-len" id="memoLen-${idx}">${memo.length}/300자</span></div>
    </div>
    <div class="iw-divider"></div>
    <div class="iw-photos" id="photoGrid-${idx}"></div>`;
  renderPhotoGrid(idx,photoMap[d.id]||[]);
}
