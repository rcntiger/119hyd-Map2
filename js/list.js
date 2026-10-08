/* 119hyd-Map2 · js/list.js — 목록 그리기 */
AppFiles.reg('js/list.js','v3.1.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ━━ 목록 렌더 ━━
function renderList(){
  const el=document.getElementById('listEl');
  el.innerHTML='';
  if(!items.length){el.innerHTML='<div style="text-align:center;color:var(--mt);font-size:12px;padding:30px">📂 엑셀 업로드로 대상을 추가하세요</div>';return;}
  const frag=document.createDocumentFragment();
  const order=displayIndexOrder&&displayIndexOrder.length===items.length?displayIndexOrder:items.map((_,i)=>i);
  order.forEach(i=>frag.appendChild(buildListItem(i)));
  el.appendChild(frag);
}

// 목록 항목 DOM 생성 (renderList와 updateListItem이 공유)
function buildListItem(i){
  const d=items[i];
  const isDone=!!doneMap[d.id];
  const color=groupColor(d);
  const noCoord=!(d.lat&&d.lng);
  const div=document.createElement('div');
  div.className='item'+(isHidden(d)?' hidden':'')+(isDone?' done-item':'');
  div.id=`item-${i}`;
  div.innerHTML=`${pickMode?`<input type="checkbox" class="pick-chk" data-id="${d.id}" ${pickedIds.has(d.id)?'checked':''} onclick="event.stopPropagation();togglePicked(${d.id})">`:''}<div class="team-dot" style="background:${noCoord?'#94a3b8':color}"></div>
    <div class="ibody">
      <div class="iname">${esc(d.name)}</div>
      <div class="isub">${esc((d.address||'').replace('서울특별시 금천구 ',''))}</div>
      <div class="itags">
        ${d.group_name?`<span class="itag">${esc(d.group_name)}</span>`:''}
        ${hydrantMap[d.id]?`<span class="itag" style="background:${hyStatusInfo(hydrantMap[d.id]).bg};color:${hyStatusInfo(hydrantMap[d.id]).fg}">${hyStatusInfo(hydrantMap[d.id]).label}</span>`:''}
        ${isDone?'<span class="itag done-tag">✓ 완료</span>':''}
        ${memoMap[d.id]?'<span class="itag">📝 메모</span>':''}
        ${(photoMap[d.id]?.length)?`<span class="itag">📷 ${photoMap[d.id].length}</span>`:''}
        ${noCoord?`<span class="itag" style="background:#fee2e2;color:#dc2626">📍 좌표없음</span><button class="itag" style="background:#e0e7ff;color:#4338ca;cursor:pointer;border:none" onclick="event.stopPropagation();retryGeocodeItem(${i})">🔄 재시도</button>`:''}
      </div>
    </div>`;
  div.addEventListener('click',()=>{
    if(pickMode){togglePicked(d.id);return;} // 선택 모드에서는 카드 클릭도 체크 토글로 동작
    setActive(i);
    if(!(d.lat&&d.lng)){showToast('이 항목은 주소 좌표를 찾을 수 없어 지도에서 위치를 표시할 수 없습니다','err');return;}
    const isMobile=window.innerWidth<=600;
    const doPan=()=>{
      if(d.lat&&d.lng&&kakaoMap){
        kakaoMap.setLevel(3);
        panToForCard(d.lat,d.lng);
        if(overlays[i]){
          ensurePopupRendered(i);
          if(iwOpen)iwOpen.setMap(null);
          overlays[i].iw.setMap(kakaoMap);
          iwOpen=overlays[i].iw;
          if(activeMarkerEl)activeMarkerEl.classList.remove('active-mk');
          const markerEl=overlays[i].overlay?.getContent&&overlays[i].overlay.getContent();
          if(markerEl){markerEl.classList.add('active-mk');activeMarkerEl=markerEl;}
          if(_sharedTooltip)_sharedTooltip.style.opacity='0';
        }
      }
    };
    // 모바일: 목록 클릭 시 지도 모드로 자동 전환 (relayout 완료 후 이동해야 좌표가 정확함)
    if(isMobile){switchToMapMode();setTimeout(doPan,560);}
    else doPan();
  });
  return div;
}

// 단건 변경 시 해당 목록 항목만 교체 (전체 renderList보다 훨씬 가벼움 — 622개 DOM 재생성 방지)
function updateListItem(i){
  const oldEl=document.getElementById(`item-${i}`);
  if(!oldEl){renderList();return;} // 목록이 아직 없으면 전체 렌더로 폴백
  oldEl.replaceWith(buildListItem(i));
}
