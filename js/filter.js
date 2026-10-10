/* 119hyd-Map2 · js/filter.js — 그룹 필터 · 정렬 · 축소 시 마커 숨김 · 필터 적용 · 통계 */
AppFiles.reg('js/filter.js','v3.7.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ━━ 그룹 필터 (119hyd-inspec과 동일하게 네이티브 select 드롭다운 사용 — 모바일에서 작은 필터 알약 버튼이 잘 눌리지 않는 문제 해결) ━━
function buildGroupFilter(){
  const panel=document.getElementById('groupPanel');
  const sel=document.getElementById('groupSelect');
  if(!groups.length){panel.style.display='none';return;}
  panel.style.display='block';
  // ── 세분계획 진입 잠금값 해석 ──
  // 정확히 일치하는 조가 있으면 → 조 잠금 모드 (드롭다운 비활성)
  // 접두어로 매칭되는 조들이 있으면('1팀' → '1팀 1조'...) → 팀 모드 (팀 내 조들만 전환 가능)
  // 둘 다 아니면(엑셀 재업로드로 사라짐) → 잠금 해제 + 안내
  if(lockedFilterGroup&&!groups.includes(lockedFilterGroup)){
    if(groups.some(g=>g.startsWith(lockedFilterGroup+' '))){
      teamFilterPrefix=lockedFilterGroup;lockedFilterGroup='';filterGroupVal='';
    }else{
      showToast(`'${lockedFilterGroup}' 조를 찾을 수 없어 전체를 표시합니다. 세분계획을 갱신해주세요.`,'err');
      lockedFilterGroup='';teamFilterPrefix='';filterGroupVal='';
    }
  }
  const cur=filterGroupVal;
  if(teamFilterPrefix){
    // 팀 모드: 팀 소속 조들만 드롭다운에 표시. 기본값은 "팀 전체"(팀 내 모든 조).
    const teamGroups=groups.filter(g=>g===teamFilterPrefix||g.startsWith(teamFilterPrefix+' '));
    sel.innerHTML=`<option value="">${esc(teamFilterPrefix)} 전체</option>`
      +teamGroups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
    sel.value=teamGroups.includes(cur)?cur:'';
    if(!teamGroups.includes(cur))filterGroupVal='';
    sel.disabled=false;
  }else{
    sel.innerHTML=`<option value="">전체 그룹 (모든 소화전 표시)</option>`
      +groups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
    sel.value=groups.includes(cur)?cur:'';
    if(lockedFilterGroup){
      // 조 잠금 모드
      filterGroupVal=lockedFilterGroup;
      sel.value=lockedFilterGroup;
      sel.disabled=true;
    }else{
      sel.disabled=false;
    }
  }
  updateGroupCounts();
}
function onGroupSelectChange(g){
  filterGroupVal=g||'';
  applyFilter();
}
function updateGroupCounts(){
  const sel=document.getElementById('groupSelect');
  if(!sel)return;
  const vis=items.filter(d=>!filterText||d.name.toLowerCase().includes(filterText.toLowerCase()));
  const opts=sel.querySelectorAll('option');
  opts.forEach(opt=>{
    if(!opt.value){
      if(teamFilterPrefix){
        const cnt=vis.filter(d=>{const g=String(d.group_name||'').trim();return g===teamFilterPrefix||g.startsWith(teamFilterPrefix+' ');}).length;
        opt.textContent=`${teamFilterPrefix} 전체 (${cnt})`;
      }else{
        opt.textContent='전체 그룹 (모든 소화전 표시)';
      }
      return;
    }
    const cnt=vis.filter(d=>String(d.group_name||'').trim()===opt.value).length;
    opt.textContent=`${opt.value} (${cnt})`;
  });
}
// 그룹·팀·검색·선택 표시만 본 숨김 여부 ('겹친 위치만 보기'는 뺀 것) — 겹침 묶음에서 보이는 개수를 셀 때 이 기준을 쓴다
function _baseHidden(d){
  const g=String(d.group_name||'').trim();
  // 팀 모드: 팀 밖 소화전은 항상 숨김 (필터 전환과 무관하게 팀 범위 밖으로 못 나감)
  if(teamFilterPrefix&&!(g===teamFilterPrefix||g.startsWith(teamFilterPrefix+' ')))return true;
  // 선택 표시 모드: 고른 것만 보이고 그룹/검색 필터는 무시
  if(pickedFilterActive)return !pickedIds.has(d.id);
  if(filterGroupVal&&g!==String(filterGroupVal).trim())return true;
  if(filterText&&!d.name.toLowerCase().includes(filterText.toLowerCase())&&!(d.address||'').toLowerCase().includes(filterText.toLowerCase()))return true;
  return false;
}
// 지도·목록 공통 숨김 여부
function isHidden(d){
  if(_baseHidden(d))return true;
  // 모아 보기 '겹친 위치만': 선택 표시(인쇄 미리보기 포함) 중에는 적용하지 않음
  if(quickFilter==='overlap'&&!pickedFilterActive&&!ovlInStack(d))return true;
  if(quickFilter==='closed'&&!pickedFilterActive&&!isClosed(d))return true; // 모아 보기 '폐전만'
  return false;
}
// 목록에서만 쓰는 숨김 여부. 모아 보기 '좌표없음만'은 목록만 거른다
// (지도는 그대로 두어야, 위치를 지정했을 때 새로 생긴 마커가 바로 보인다)
function isListHidden(d){
  return isHidden(d)||(quickFilter==='nocoord'&&!pickedFilterActive&&(!!(d.lat&&d.lng)||isClosed(d)));
}
let sortMode='';
function setSort(mode){
  if(sortMode===mode){
    sortMode='';
    document.getElementById('sortName')?.classList.remove('active');
    document.getElementById('sortAddr')?.classList.remove('active');
    document.getElementById('sortType')?.classList.remove('active');
  }else{
    sortMode=mode;
    document.getElementById('sortName')?.classList.toggle('active',mode==='name');
    document.getElementById('sortAddr')?.classList.toggle('active',mode==='addr');
    document.getElementById('sortType')?.classList.toggle('active',mode==='type');
  }
  // ⚠ items 배열 자체를 sort()하면 overlays(인덱스 기반)와 매핑이 깨져서
  //    "정렬 후 클릭하면 엉뚱한 카드가 열리는" 버그가 생긴다.
  //    그래서 items는 그대로 두고, 표시 순서(원본 인덱스 배열)만 별도로 정렬한다.
  if(sortMode==='name'){
    displayIndexOrder=items.map((d,i)=>i).sort((ia,ib)=>items[ia].name.localeCompare(items[ib].name,'ko'));
  }else if(sortMode==='addr'){
    displayIndexOrder=items.map((d,i)=>i).sort((ia,ib)=>(items[ia].address||'').localeCompare(items[ib].address||'','ko'));
  }else if(sortMode==='type'){
    // 지상식 → 지하식 → 비상소화장치 → 미확인 순으로 묶어서 정렬
    const rank=i=>{
      const d=items[i];
      const t=hyTypeOf(d);
      return ({ground:0,underground:1,emergency:2,ugdevice:3})[t]??4;
    };
    displayIndexOrder=items.map((d,i)=>i).sort((ia,ib)=>rank(ia)-rank(ib)||items[ia].name.localeCompare(items[ib].name,'ko'));
  }else{
    displayIndexOrder=null;
  }
  renderList();
  applyFilter();
}

// 오버레이 표시 상태를 바꿀 때만 setMap 호출.
// ⚠ 카카오 CustomOverlay는 이미 지도에 있는데 setMap(map)을 또 부르면 다시 그리면서 크기를 측정해
//   화면 전체 레이아웃을 강제로 다시 계산한다. 850개 × (마커+라벨)을 매번 이렇게 하면 수십 초가 걸렸다
//   (로딩 측정: 목록/필터 34초). 상태가 같으면 아무것도 하지 않는다.
/* ── 축소 시 개별 마커 숨김 ──
   축소(확대 단계 6 이상, 클러스터가 켜지는 단계)에서는 개별 마커·라벨 850개를 지도에서 내리고 묶음 원만 보여준다.
   카카오는 확대/축소할 때마다 지도에 올라간 오버레이를 전부 다시 배치하는데, 마커+라벨 1,700개를
   매 단계 다시 그리느라 축소 시 화면이 멈추던 문제. 번호 라벨은 글자가 겹쳐 읽을 수 없는 단계 5부터 숨긴다.
   (인쇄 미리보기 중에는 이 규칙을 끈다 — 축소 상태로도 마커를 인쇄해야 하므로) */
const ZOOM_FAR_LEVEL=6, LABEL_FAR_LEVEL=5;
let _zoomFar=false,_labelFar=false,_zoomRuleOff=false;
function _calcZoomFlags(){
  const lv=kakaoMap?kakaoMap.getLevel():1;
  return {far:!_zoomRuleOff&&lv>=ZOOM_FAR_LEVEL,lfar:!_zoomRuleOff&&lv>=LABEL_FAR_LEVEL};
}
function syncZoomVisibility(force){
  const f=_calcZoomFlags();
  if(!force&&f.far===_zoomFar&&f.lfar===_labelFar)return; // 경계를 넘을 때만 처리
  _zoomFar=f.far;_labelFar=f.lfar;
  if(fixLocationIdx>=0)return; // 위치 수정 중엔 그 화면 규칙 유지
  Object.entries(overlays).forEach(([i,o])=>{
    const d=items[i];if(!d)return;
    const hide=isHidden(d);
    _ovSet(o.overlay,!hide&&!_zoomFar);
    _ovSet(o.labelOverlay,!hide&&_labelWanted(d)&&!_labelFar);
  });
}
// 이름표를 보여야 하는지: '이름 ON'이거나, 일괄 위치수정 중인 마커 (어느 번호를 옮기는지 알아야 하므로 항상 표시)
function _labelWanted(d){return labelsOn||!!(_bf&&_bf.marks.has(d.id));}
function setZoomRuleOff(off){_zoomRuleOff=!!off;syncZoomVisibility(true);}
function _ovSet(ov,on){
  if(!ov)return;
  if(!!ov.getMap()!==on)ov.setMap(on?kakaoMap:null);
}
function applyFilter(){
  filterText=document.getElementById('searchInput').value.trim();
  ovlRefresh(); // 겹침 묶음에서 지금 범위에 보이는 개수·배지·이름표 갱신 (아래 isHidden이 이 결과를 씀)
  // 모아 보기 대상이 하나도 안 남으면(전부 위치를 지정했거나 겹침을 다 풀었으면) 저절로 해제
  if((quickFilter==='nocoord'&&!ncCount())||(quickFilter==='overlap'&&!ovlStackCount().groups)||(quickFilter==='closed'&&!closedCount()))quickFilter='';
  const toAdd=[],toRemove=[];
  items.forEach((d,i)=>{
    const hide=isHidden(d);
    const li=document.getElementById(`item-${i}`);
    const liHide=isListHidden(d);
    if(li&&li.classList.contains('hidden')!==liHide)li.classList.toggle('hidden',liHide);
    const o=overlays[i];
    if(o){
      const inBf=_bf&&_bf.marks.has(d.id); // 일괄 위치수정 중인 마커는 원래 마커를 숨긴 채 유지
      _ovSet(o.overlay,!hide&&!_zoomFar&&!inBf);
      _ovSet(o.labelOverlay,!hide&&_labelWanted(d)&&!_labelFar&&!(_bf&&_bf.dragId===d.id));
      // 클러스터러 계산용 invisible 마커도 같이 빼줘야 카카오 기본 풍선이 남지 않음
      if(clusterer&&o.clMarker&&o.hidden!==hide){
        if(hide)toRemove.push(o.clMarker);
        else toAdd.push(o.clMarker);
        o.hidden=hide;
      }
    }
  });
  // 마커 하나씩 addMarker/removeMarker를 반복 호출하면(특히 항목이 수백 개일 때) 매번
  // 재계산이 일어나 모바일에서 버벅이거나 반영이 늦어 보이는 문제가 있어, 한 번에 일괄 처리 후 다시 그린다
  if(clusterer&&(toRemove.length||toAdd.length)){
    if(toRemove.length)clusterer.removeMarkers(toRemove);
    if(toAdd.length)clusterer.addMarkers(toAdd,true);
    clusterer.redraw();
  }
  updateStats();updateGroupCounts();updateQuickChips();
}

// ━━ 통계 ━━
function updateStats(){
  const filtered=items.filter(d=>!isHidden(d)&&!isClosed(d)); // 폐전은 진행률에서 제외
  const tot=filtered.length;
  const done=filtered.filter(d=>doneMap[d.id]).length;
  const pct=tot?Math.round(done/tot*100):0;
  document.getElementById('sTot')&&(document.getElementById('sTot').textContent=tot);
  document.getElementById('sDone')&&(document.getElementById('sDone').textContent=done);
  document.getElementById('sLeft')&&(document.getElementById('sLeft').textContent=tot-done);
  document.getElementById('sPct')&&(document.getElementById('sPct').textContent=pct+'%');
  document.getElementById('progFill').style.width=pct+'%';
  document.getElementById('progPctText').textContent=pct+'%';
}
