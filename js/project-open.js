/* 119hyd-Map2 · js/project-open.js — 계획 열기/닫기 · 계획 데이터 불러오기 */
AppFiles.reg('js/project-open.js','v3.2.4'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ━━ 프로젝트 열기 ━━
async function openProject(proj){
  lockedFilterGroup='';teamFilterPrefix='';
  let displayName=proj.name;
  if(proj.parent_id){
    // 세분계획: 실제 데이터는 부모 계획에 있으므로 부모를 연다. 필터만 해당 조로 잠근다.
    const parent=projectList.find(x=>String(x.id)===String(proj.parent_id));
    if(!parent){showToast('부모 계획을 찾을 수 없습니다','err');return;}
    lockedFilterGroup=String(proj.filter_group||'').trim();
    displayName=`${parent.name} · ${proj.name}`;
    proj=parent; // 이후 모든 데이터 로드/저장은 부모 계획 ID(inspection_id) 기준 → 전 조의 작업이 한 곳에 모임
  }
  currentProject=proj;
  document.getElementById('homeView').style.display='none';
  document.getElementById('mapView').style.display='flex';
  document.getElementById('mapHeaderTitle').textContent=displayName;
  clearMapOverlays();
  items=[];hyState={};hyDraft={};hyExpanded={};groups=[];filterGroupVal=lockedFilterGroup;filterText='';quickFilter='';displayIndexOrder=null;sortMode='';
  pickMode=false;pickedIds=new Set();pickedFilterActive=false;
  const pickBarEl=document.getElementById('pickBar');if(pickBarEl)pickBarEl.style.display='none';
  const pickedPillEl=document.getElementById('pickedActivePill');if(pickedPillEl)pickedPillEl.style.display='none';
  document.getElementById('pickModeBtn')?.classList.remove('active');
  document.getElementById('listEl').innerHTML='<div style="text-align:center;color:var(--mt);font-size:12px;padding:30px">지도 초기화 중...</div>';
  const dateEl=document.getElementById('inspDateGlobal');
  if(dateEl&&!dateEl.value)dateEl.value=new Date().toISOString().slice(0,10); // 안전장치: 비어있으면 오늘 날짜로
  // 지도 SDK·지도 준비와 데이터 받기를 동시에 진행 (예전엔 지도 준비가 끝난 뒤 데이터를 받기 시작)
  _openT0=performance.now();
  const pid=currentProject.id;
  const p=fetchProjectDataJoined(pid);p.catch(()=>{}); // 실패 처리는 loadProjectData에서
  _prefetch={id:pid,p};
  const tm=performance.now();
  await initKakaoMap();
  _mapWaitMs=performance.now()-tm; // 카드 클릭 후 지도 준비를 기다린 시간 (SDK를 미리 받았으면 거의 0)
  await loadProjectData();
}
let _prefetch=null,_openT0=0,_mapWaitMs=0;
// 상단 버튼: 모바일 지도 보기 상태면 목록으로, 아니면 홈으로
function handleBack(){
  if(window.innerWidth<=600&&mobMapMode){
    toggleMobView(); // 목록 보기로 전환
  }else{
    goHome();
  }
}

async function goHome(){
  try{
    areaCancel(); // 인쇄 영역 지정 중이었다면 정리
    if(kakaoMap){Object.values(overlays).forEach(o=>{o.overlay?.setMap(null);o.iw?.setMap(null);});}
    if(iwOpen){iwOpen.setMap(null);iwOpen=null;}
    // 모바일 상태 초기화
    mobMapMode=false;
    const sidebar=document.getElementById('sidebar');
    if(sidebar)sidebar.classList.remove('map-mode');
    const toggle=document.getElementById('mobToggle');
    if(toggle)toggle.textContent='🗺️ 지도 보기';
    const backBtn=document.getElementById('backBtn');
    if(backBtn)backBtn.textContent='← 이전 화면';
    const toolbar=document.getElementById('mapToolbar');
    if(toolbar)toolbar.style.display='none';
    const toolbarTop=document.getElementById('mapToolbarTop');
    if(toolbarTop)toolbarTop.style.display='none';
    document.body.style.overflowX='hidden';
    updateMobHeaderVisibility();
    // 화면 전환
    const mapView=document.getElementById('mapView');
    const homeView=document.getElementById('homeView');
    if(mapView)mapView.style.display='none';
    if(homeView)homeView.style.display='block';
    currentProject=null;
    lockedFilterGroup='';teamFilterPrefix='';
    clearMapOverlays();
    items=[];
    await loadProjects();
  }catch(e){console.error('goHome 오류:',e);}
}
// ══ 최적화 5 ══
// 예전엔 hydmap_items/done/memo/photos/records를 inspection_id로 각각 따로 조회해
// 왕복 5번이 걸렸다. hydmap_done/memo/photos/records는 모두 item_id로 hydmap_items를
// 참조하는 FK 관계이므로, PostgREST 임베딩(select('*, hydmap_done(*), ...'))을 쓰면
// 쿼리 1번으로 합칠 수 있다. 혹시 FK 관계가 아직 안 걸려있거나 임베딩이 실패하면
// (예: 관계명이 다르거나 RLS로 막힌 경우) 기존 5-쿼리 방식으로 자동 폴백한다.
async function fetchProjectDataJoined(id){
  const itemsRes=await SupabaseUtil.select('hydmap_items',{
    eq:{inspection_id:id},
    order:{column:'created_at',ascending:true},
    columns:'*,hydmap_done(*),hydmap_memo(*),hydmap_photos(*),hydmap_records(*)'
  });
  // 임베딩된 결과에서 각 하위 데이터를 분리해 기존 코드와 동일한 배열 형태로 재구성
  const doneArr=[],memoArr=[],photosArr=[],hyArr=[];
  itemsRes.forEach(it=>{
    (it.hydmap_done||[]).forEach(x=>doneArr.push(x));
    (it.hydmap_memo||[]).forEach(x=>memoArr.push(x));
    (it.hydmap_photos||[]).forEach(x=>photosArr.push(x));
    (it.hydmap_records||[]).forEach(x=>hyArr.push(x));
    delete it.hydmap_done;delete it.hydmap_memo;delete it.hydmap_photos;delete it.hydmap_records;
  });
  // hydmap_photos는 created_at 오름차순이 필요 (원래 별도 쿼리에 order가 걸려있었음)
  photosArr.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
  return{itemsRes,doneArr,memoArr,photosArr,hyArr};
}
async function fetchProjectDataSeparate(id){
  const [itemsRes,doneArr,memoArr,photosArr,hyArr]=await Promise.all([
    SupabaseUtil.select('hydmap_items',{eq:{inspection_id:id},order:{column:'created_at',ascending:true}}),
    SupabaseUtil.select('hydmap_done',{eq:{inspection_id:id}}),
    SupabaseUtil.select('hydmap_memo',{eq:{inspection_id:id}}),
    SupabaseUtil.select('hydmap_photos',{eq:{inspection_id:id},order:{column:'created_at',ascending:true}}),
    SupabaseUtil.select('hydmap_records',{eq:{inspection_id:id}}),
  ]);
  return{itemsRes,doneArr,memoArr,photosArr,hyArr};
}
async function loadProjectData(){
  if(!currentProject)return;
  const _t0=performance.now();let _t1=_t0,_t2=_t0;
  const id=currentProject.id;
  try{
    let itemsRes,doneArr,memoArr,photosArr,hyArr;
    try{
      const pre=(_prefetch&&_prefetch.id===id)?_prefetch.p:null;_prefetch=null;
      ({itemsRes,doneArr,memoArr,photosArr,hyArr}=await (pre||fetchProjectDataJoined(id)));
    }catch(joinErr){
      // FK 임베딩 실패(관계 미설정 등) 시 기존 방식으로 폴백
      console.warn('조인 쿼리 실패, 개별 쿼리로 폴백:',joinErr);
      ({itemsRes,doneArr,memoArr,photosArr,hyArr}=await fetchProjectDataSeparate(id));
    }
    items=itemsRes;
    _t1=performance.now();
    // 그룹 색상 맵 초기화 (순서 보장을 위해 items 순서대로 등록)
    Object.keys(_groupColorMap).forEach(k=>delete _groupColorMap[k]);
    items.forEach(d=>{if(d.group_name)groupColor(d);});
    hyState={}; // 통합 상태 저장소 초기화 (doneMap/memoMap/photoMap/hydrantMap은 이 객체의 뷰이므로 자동으로 함께 비워짐)
    doneArr.forEach(d=>{doneMap[d.item_id]=d;});
    memoArr.forEach(m=>{memoMap[m.item_id]=m.memo||'';});
    photosArr.forEach(p=>{if(!photoMap[p.item_id])photoMap[p.item_id]=[];photoMap[p.item_id].push(p);});
    (hyArr||[]).forEach(h=>{hydrantMap[h.item_id]=h;});
    hyDraft={};
    // 기본 정렬: 이름순
    sortMode='name';
    displayIndexOrder=items.map((d,i)=>i).sort((ia,ib)=>items[ia].name.localeCompare(items[ib].name,'ko'));
    document.getElementById('sortName')?.classList.add('active');
    document.getElementById('sortAddr')?.classList.remove('active');
    // 그룹 목록
    groups=[...new Set(items.map(d=>String(d.group_name||'').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'ko',{numeric:true,sensitivity:'base'}));
    // 색상표를 정렬된 그룹 순서로 선등록 → 매번 같은 조가 같은 색을 갖고, 팀 내(연속 순번) 조끼리는 색이 겹치지 않음
    resetGroupColors();
    groups.forEach(g=>groupColor({group_name:g}));
    buildGroupFilter();
    if(items.length)fitAll(); // 마커를 올리기 전에 최종 화면 범위부터 확정 (이동 시 전체 재배치 1회 절약)
    renderAllMarkers();
    _t2=performance.now();
    renderList();
    // 세분계획(팀/조 잠금)으로 진입한 경우 등 초기 필터 상태를 마커/목록에 즉시 반영
    // (예전엔 필터를 한 번 조작해야 숨김이 적용되어, 팀 카드로 들어가도 처음엔 전체가 보이던 버그)
    applyFilter();
    updateStats();
    const _t3=performance.now();
    console.info(`[소화전 지도 로딩] 데이터 ${Math.round(_t1-_t0)}ms · 마커 ${Math.round(_t2-_t1)}ms · 목록/필터 ${Math.round(_t3-_t2)}ms · 합계 ${Math.round(_t3-_t0)}ms (${items.length}개)`
      +(_openT0?` · 카드 클릭→완료 ${Math.round(_t3-_openT0)}ms`:'')+(_openT0?` (지도 준비 대기 ${Math.round(_mapWaitMs)}ms)`:''));
    _openT0=0;_mapWaitMs=0;
  }catch(e){showToast('데이터 로드 실패','err');}
}
