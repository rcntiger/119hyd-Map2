/* 119hyd-Map2 · js/marker.js — 그룹 색상 · 마커 · 정보카드(팝업) 그리기 */
AppFiles.reg('js/marker.js','v3.2.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ Marker & List Render ══════════ */
const _groupColorMap={};
function resetGroupColors(){for(const k in _groupColorMap)delete _groupColorMap[k];}
function groupColor(d){
  if(!d.group_name)return GROUP_COLORS[0];
  if(!_groupColorMap[d.group_name]){
    const keys=Object.keys(_groupColorMap);
    _groupColorMap[d.group_name]=GROUP_COLORS[keys.length%GROUP_COLORS.length];
  }
  return _groupColorMap[d.group_name];
}
// CSS 클래스는 g1~g6(+g0 회색)까지만 존재하므로 그룹이 6개를 넘으면 색을 순환시킨다.
// (예전엔 indexOf+1을 그대로 써서 7번째 그룹부터 존재하지 않는 g7, g8...이 되어 전부 기본 빨강으로 표시되던 버그)
function groupCls(d){
  const g=String(d.group_name||'').trim();
  if(!g)return 'g0';
  groupColor(d); // 색상표 등록 보장
  const idx=Object.keys(_groupColorMap).indexOf(g);
  return 'g'+((idx%GROUP_COLORS.length)+1);
}

// 정보카드(위로 길게 펼쳐짐)를 열 때, 마커를 화면 정중앙이 아니라
// 화면 중앙보다 아래쪽으로 이동시켜서 카드가 위쪽으로 펼쳐질 공간을 확보한다.
// (그냥 marker만 중앙에 두면 카드가 위쪽으로 잘리거나 위로 치우쳐 보이는 문제가 있었음 — PC/모바일 공통 적용)
function panToForCard(lat,lng){
  if(!kakaoMap)return;
  try{
    const proj=kakaoMap.getProjection();
    const mapEl=document.getElementById('map');
    const h=mapEl?mapEl.clientHeight:window.innerHeight;
    const point=proj.containerPointFromCoords(new kakao.maps.LatLng(lat,lng));
    const offsetY=Math.round(h*0.28); // 화면 아래쪽으로 내려서 카드+마커 조합이 시각적으로 중앙에 오도록
    const newPoint=new kakao.maps.Point(point.x,point.y-offsetY);
    const newLatLng=proj.coordsFromContainerPoint(newPoint);
    kakaoMap.panTo(newLatLng);
  }catch(e){
    // 프로젝션 계산 실패 시 기본 동작으로 폴백
    kakaoMap.panTo(new kakao.maps.LatLng(lat,lng));
  }
}

// 지도 위의 소화전 마커/라벨/정보카드/클러스터를 모두 지운다.
// ⚠ overlays={}로 목록만 비우면 지도에 이미 올라간 마커는 그대로 남는다(참조만 잃어 다시 지울 수도 없음).
//   그래서 계획 전환(전체 → 홈 → 조 카드 등) 시 이전 계획의 마커가 유령처럼 남아
//   "조 하나만 골랐는데 다른 조가 보이는" 버그가 났다. 반드시 이 함수로 지운 뒤 초기화할 것.
function clearMapOverlays(){
  if(typeof _flushAllMemoHist==='function')_flushAllMemoHist();
  closeIw();
  if(typeof stopPreciseGps==='function')stopPreciseGps();
  if(_bf){_bf.marks.forEach(r=>{r.marker.setMap(null);r.line?.setMap(null);});_bf=null;
    const b=document.getElementById('batchFixBar');if(b)b.style.display='none';
    document.getElementById('btnBatchFix')?.classList.remove('on');}
  Object.values(overlays).forEach(o=>{o.overlay?.setMap(null);o.iw?.setMap(null);o.labelOverlay?.setMap(null);});
  if(clusterer)clusterer.clear();
  overlays={};
  _ovl={groups:[],of:{}}; // 겹침 묶음도 비움 (마커를 다시 그린 뒤 ovlCompute가 새로 계산)
  // 위치 수정/지정 모드였다면 해제 (마커를 새로 그리면 '다른 마커 숨김' 상태가 사라지므로 모드만 남으면 안 됨)
  if(fixLocationIdx>=0){fixLocationIdx=-1;if(kakaoMap)kakaoMap.setCursor('');}
  syncPlaceBar();
}
let _clBatch=null;
function renderAllMarkers(){
  clearMapOverlays();
  _clBatch=[];
  items.forEach((d,i)=>{if(d.lat&&d.lng)addMarker(i,d);});
  if(clusterer&&_clBatch.length)clusterer.addMarkers(_clBatch,true);
  _clBatch=null;
  if(clusterer)clusterer.redraw();
  ovlCompute(); // 같은 자리에 겹친 소화전 묶음 계산 (배지·이름표는 이어지는 applyFilter가 맞춤)
}
let _transparentMarkerImg=null;
function getTransparentMarkerImage(){
  if(!_transparentMarkerImg){
    _transparentMarkerImg=new kakao.maps.MarkerImage(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      new kakao.maps.Size(1,1)
    );
  }
  return _transparentMarkerImg;
}
// 지상식/지하식 구분 아이콘 (마커 안에 표시). 종류를 알 수 없으면 빈 원 그대로 둔다.
const HY_ICON_GROUND=`<svg viewBox="0 0 24 24" width="80%" height="80%" style="pointer-events:none;display:block;margin:auto"><path fill="#fff" d="M9 3h6v2h1a1 1 0 0 1 1 1v1h-1.2l.9 1.8-1.8.9L13 7.5V9h-2V7.5l-1.9 2.2-1.8-.9L8.2 7H7V6a1 1 0 0 1 1-1h1V3zM8 11h8v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9z"/></svg>`;
const HY_ICON_UNDER=`<svg viewBox="0 0 24 24" width="80%" height="80%" style="pointer-events:none;display:block;margin:auto"><circle cx="12" cy="12" r="8.5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="#fff"/><line x1="12" y1="2.8" x2="12" y2="6.4" stroke="#fff" stroke-width="1.8"/><line x1="12" y1="17.6" x2="12" y2="21.2" stroke="#fff" stroke-width="1.8"/><line x1="2.8" y1="12" x2="6.4" y2="12" stroke="#fff" stroke-width="1.8"/><line x1="17.6" y1="12" x2="21.2" y2="12" stroke="#fff" stroke-width="1.8"/></svg>`;
function getMarkerIconHtml(d){
  const type=hydrantMap[d.id]?.hydrant_type||getExcelHydrantType(d);
  if(type==='ground')return HY_ICON_GROUND;
  if(type==='underground')return HY_ICON_UNDER;
  return '';
}
// 점검 저장/위치 수정 등으로 종류가 바뀌었을 때 마커 아이콘을 다시 그린다
function updateMarkerIcon(idx){
  const d=items[idx],o=overlays[idx];
  if(!d||!o||!o.overlay)return;
  const el=o.overlay.getContent&&o.overlay.getContent();
  if(el)el.innerHTML=getMarkerIconHtml(d);
}
function addMarker(idx,d){
  const isDone=!!doneMap[d.id];
  const color=groupColor(d);
  const el=document.createElement('div');
  el.className=`kk-marker ${groupCls(d)}${isDone?' done':''}`;
  el.id='mk-'+idx;
  el.style.position='relative';
  el.innerHTML=getMarkerIconHtml(d);

  // 툴팁: body에 단 하나의 공유 툴팁 요소를 사용 (stacking context 탈출)
  el.addEventListener('mouseenter',()=>{
    if(!tooltipOn||iwOpen===iw)return;
    const r=el.getBoundingClientRect();
    _sharedTooltip.textContent=ovlTipText(idx)||d.name;
    _sharedTooltip.style.left=(r.left+r.width/2)+'px';
    _sharedTooltip.style.top=(r.bottom+6)+'px';
    _sharedTooltip.style.opacity='1';
  });
  el.addEventListener('mouseleave',()=>{_sharedTooltip.style.opacity='0';});
  // 이름 말풍선 레이블을 CustomOverlay로 마커 아래 항상 준비해두고, "이름 ON/OFF" 토글로 표시 여부만 제어한다.
  // (예전엔 터치 기기에서만 만들었는데, 그러면 PC에서는 토글을 눌러도 아무 효과가 없어 보이는 문제가 있었음)
  const _labelColor=groupColor(d);
  const labelEl=document.createElement('div');
  labelEl.style.cssText=`padding:3px 8px;font-size:11px;font-weight:700;color:${_labelColor};background:rgba(255,255,255,0.95);border:1.5px solid ${_labelColor};border-radius:12px;white-space:normal;max-width:120px;word-break:keep-all;text-align:center;line-height:1.4;box-shadow:0 2px 6px rgba(0,0,0,.2);pointer-events:auto;cursor:pointer;margin-top:16px`;
  // 누르면: 겹친 자리면 그 자리 소화전 목록(ovlTap), 아니면 바로 정보카드
  const tap=()=>{if(!ovlTap(idx))openIw();};
  labelEl.addEventListener('click',e=>{e.stopPropagation();tap();});
  let _lbTouchMoved=false;
  labelEl.addEventListener('touchstart',()=>{_lbTouchMoved=false;},{passive:true});
  labelEl.addEventListener('touchmove',()=>{_lbTouchMoved=true;},{passive:true});
  labelEl.addEventListener('touchend',e=>{e.stopPropagation();if(!_lbTouchMoved){e.preventDefault();tap();}},{passive:false});
  labelEl.textContent=d.name;
  const labelOverlay=new kakao.maps.CustomOverlay({
    position:new kakao.maps.LatLng(d.lat,d.lng),
    content:labelEl,
    xAnchor:0.5,yAnchor:0, // 라벨 위쪽 = 소화전 좌표, margin-top으로 아이콘 아래 3px 간격 (라벨 높이와 무관하게 일정)
    zIndex:9,
  });
  if(labelsOn&&!isHidden(d)&&!_labelFar)labelOverlay.setMap(kakaoMap);

  const iwEl=document.createElement('div');
  iwEl.className='iw-wrap';
  // 카드 안 터치·휠 동작이 지도로 전달되지 않게 막아, 휴대폰에서 카드를 위아래로 스크롤할 수 있게 함
  ['touchstart','touchmove','wheel','mousedown','pointerdown'].forEach(ev=>iwEl.addEventListener(ev,e=>e.stopPropagation(),{passive:true}));
  ['click','mousedown','mousemove','dblclick','wheel','touchstart','touchmove','touchend'].forEach(ev=>{
    iwEl.addEventListener(ev,e=>e.stopPropagation(),{passive:false});
  });
  // 카드 내부 터치 스크롤 처리
  let touchStartY=0;
  iwEl.addEventListener('touchstart',e=>{touchStartY=e.touches[0].clientY;},{passive:true});
  iwEl.addEventListener('touchmove',e=>{
    const dy=e.touches[0].clientY-touchStartY;
    const atTop=iwEl.scrollTop===0;
    const atBottom=iwEl.scrollTop+iwEl.clientHeight>=iwEl.scrollHeight;
    if((atTop&&dy>0)||(atBottom&&dy<0))return;
    e.stopPropagation();
  },{passive:false});

  const iw=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(d.lat,d.lng),content:iwEl,yAnchor:1.03,zIndex:100});
  // 최적화 2: 팝업 HTML(사진 그리드, 점검 폼 등)은 무겁기 때문에
  // 마커 생성 시점(전체 로드)에 미리 만들지 않고, 실제로 카드가 열릴 때 딱 한 번만 생성한다.
  // 수백 개 마커를 로드해도 실제로 클릭해서 연 것만 DOM 비용을 지불하게 됨.

  function openIw(){
    // 이미 이 마커의 카드가 열려있는 상태에서 다시 클릭하면 닫는다 (토글)
    if(iwOpen===iw){
      closeIw();
      return;
    }
    ensurePopupRendered(idx);
    if(iwOpen)iwOpen.setMap(null);
    if(activeMarkerEl)activeMarkerEl.classList.remove('active-mk');
    el.classList.add('active-mk');activeMarkerEl=el;
    _sharedTooltip.style.opacity='0';
    clearTimeout(_tipTimer); // 정보카드 열리면 툴팁 타이머 취소
    iw.setMap(kakaoMap);iwOpen=iw;
    setActive(idx);panToForCard(d.lat,d.lng);
  }
  el.addEventListener('click',e=>{e.stopPropagation();tap();});
  // 모바일: CustomOverlay 내부에서 click이 누락되는 경우가 있어 touchend로 보완
  let _touchMoved=false,_tipTimer=null;
  el.addEventListener('touchstart',()=>{_touchMoved=false;},{passive:true});
  el.addEventListener('touchmove',()=>{_touchMoved=true;},{passive:true});
  el.addEventListener('touchend',e=>{e.stopPropagation();if(!_touchMoved){e.preventDefault();tap();}},{passive:false});
  const overlay=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(d.lat,d.lng),content:el,zIndex:10});
  // 성능: 처음부터 필터 상태대로 만든다. 예전엔 848개를 전부 지도에 올린 뒤 applyFilter가 800개를 다시 내려서
  //       조 카드로 들어갈 때마다 DOM 추가·삭제가 두 번씩 일어나 초기화가 느렸다.
  const hideNow=isHidden(d);
  if(!hideNow&&!_zoomFar)overlay.setMap(kakaoMap);
  // 클러스터러용 invisible 마커 (줌 레벨 6 이상에서 클러스터로 묶임)
  // ⚠ opacity:0만으로는 클러스터러가 줌인 시 마커를 재표시할 때 카카오 기본 풍선 아이콘이 노출됨
  //    → 완전 투명 1x1 PNG를 마커 이미지로 지정해 원천 차단
  const clMarker=new kakao.maps.Marker({position:new kakao.maps.LatLng(d.lat,d.lng),image:getTransparentMarkerImage()});
  // 클러스터러에는 보이는 것만, 그리고 renderAllMarkers에서 한 번에 넣는다 (_clBatch)
  if(clusterer&&!hideNow){if(_clBatch)_clBatch.push(clMarker);else{clusterer.addMarker(clMarker);}}
  overlays[idx]={overlay,iw,clMarker,labelOverlay,hidden:hideNow,popupRendered:false,open:openIw}; // open: 겹침 선택 창에서 이 카드 열기
}
// 팝업이 아직 한 번도 렌더링되지 않았으면 지금 렌더링하고 표시해둔다 (idempotent)
function ensurePopupRendered(idx){
  const ov=overlays[idx];
  if(!ov||ov.popupRendered)return;
  const d=items[idx];
  const el=ov.iw.getContent&&ov.iw.getContent();
  if(d&&el){renderPopup(el,idx,d,ov.iw);ov.popupRendered=true;}
}

function renderPopup(iwEl,idx,d,iw){
  const isDone=!!doneMap[d.id];
  const doneDate=doneMap[d.id]?.done_at?new Date(doneMap[d.id].done_at).toISOString().slice(0,10):'';
  const color=groupColor(d);
  const memo=memoMap[d.id]||'';
  const photos=photoMap[d.id]||[];
  // 설치년도는 '소화전 종류' 줄 오른쪽에 따로 표시하고, 나머지 추가정보만 위치 아래에 표시
  const _isYearKey=k=>/^설치\s*(연|년)도$/.test(String(k).trim());
  const installYear=d.extra?(Object.entries(d.extra).find(([k])=>_isYearKey(k))||[])[1]:'';
  const extraStr=d.extra?Object.entries(d.extra).filter(([k])=>k!=='_type'&&!_isYearKey(k)).map(([k,v])=>`${k}: ${v}`).join(' · '):'';
  const draft=hyGetDraft(idx,d);
  const st=hyStatusInfo(hydrantMap[d.id]);
  const savedRec=hydrantMap[d.id];

  // 위치 수정 모드 중에는 지도가 최대한 넓게 보이도록 카드를 최소화한다
  // (전체 카드가 열려있으면 모바일에서 지정하려는 지점을 가려서 탭하기 어려움)
  if(fixLocationIdx===idx){
    iwEl.innerHTML=`
      <div class="hy-fixloc-mini">
        <div class="hy-fixloc-mini-title">📍 ${esc(d.name)} 위치 수정 중</div>
        <div class="hy-fixloc-mini-hint">지도를 탭하거나 우측 "현위치" 버튼을 누르세요</div>
        <button class="hy-fixloc-btn hy-fixloc-full on" onclick="startFixLocation(${idx})">❌ 취소</button>
      </div>`;
    return;
  }

  iwEl.innerHTML=`
    <div class="iw-header">
      <span class="iw-team-badge${isDone?' done':''}" style="background:${color}22;color:${color}">${isDone?'점검 완료':esc(d.group_name||'점검 대상')}</span>
      <div style="display:flex;align-items:center;gap:5px">
        <button class="iw-done-top${isDone?' is-done':''}" id="doneBtnTop-${idx}" onclick="toggleDone(${idx})">
          ${isDone?'✓ 완료(취소)':'완료시 클릭'}
        </button>
        <span class="iw-close" onclick="closeIw()">✕</span>
      </div>
    </div>
    <div class="iw-name-row">
      <div class="iw-name">${esc(d.name)}</div>
      <div class="iw-name-btns">
        <button class="iw-rv-inline" onclick="showHistory(${idx})" title="이 소화전의 위치·점검 변경 기록">📜 이력</button>
        ${d.lat&&d.lng?`<button class="iw-rv-inline" onclick="printFromHydrant(${idx})" title="이 소화전을 중심으로 주변 소화전 인쇄">🖨 기준 인쇄</button>`:''}
      </div>
    </div>
    ${d.address?`<div class="iw-addr-row"><span class="iw-addr iw-addr-full">📍 ${esc((d.address||'').replace(/^서울특별시\s*/,''))}</span></div>`:''}
    <div class="iw-latlng-row">🧭 위도 ${d.lat?d.lat.toFixed(6):'-'}, 경도 ${d.lng?d.lng.toFixed(6):'-'}${d.loc_fixed_at?` <span class="iw-locfixed-badge">📍 ${(dt=>`${String(dt.getFullYear()).slice(-2)}.${dt.getMonth()+1}.${dt.getDate()}`)(new Date(d.loc_fixed_at))} 수정</span>`:''}</div>
    <div class="hy-fixloc-row">
      ${d.lat&&d.lng?`<button class="hy-fixloc-btn" onclick="startFixLocation(${idx})">📍 위치 수정</button>`:`<button class="hy-fixloc-btn" onclick="startPlaceLocation(${idx})">📍 위치 지정 (지도에서 누르기 · 현위치)</button>`}
      ${d.lat&&d.lng?`<button class="hy-fixloc-btn hy-rv-btn" onclick="openRvFromPopup(new kakao.maps.LatLng(${d.lat},${d.lng}))">🔭 로드뷰</button>`:''}
    </div>
    ${extraStr?`<div class="iw-extra">${esc(extraStr)}</div>`:''}
    <div class="iw-divider"></div>

    <div id="dateRow-${idx}" style="display:${isDone?'flex':'none'}" class="iw-date-row">
      <label>📅 점검일자</label>
      <input type="date" value="${doneDate}" onchange="updateDoneDate(${idx},this.value)">
    </div>

    <div class="hy-section">
      <div class="hy-label" style="display:flex;align-items:baseline;gap:6px">소화전 종류<span style="color:#dc2626;font-weight:800">(자동판별)</span>${installYear?`<span style="margin-left:auto;color:#3b82f6;font-weight:700">설치년도 ${esc(String(installYear))}</span>`:''}</div>
      <div class="hy-toggle-row">
        <button class="hy-tbtn${draft.hydrant_type==='ground'?' on':''}" onclick="hySetType(${idx},'ground')">🔴 지상식</button>
        <button class="hy-tbtn${draft.hydrant_type==='underground'?' on':''}" onclick="hySetType(${idx},'underground')">🔵 지하식</button>
      </div>
    </div>

    <div class="hy-collapsible-row">
      ${hyCollapsibleField(idx,'paint','🎨 도색상태',PAINT_LABEL,draft.paint,`
        <div class="hy-toggle-row">
          <button class="hy-tbtn${draft.paint==='yes'?' on':''}" onclick="hySetField(${idx},'paint','yes')">양호</button>
          <button class="hy-tbtn${draft.paint==='mid'?' on':''}" onclick="hySetField(${idx},'paint','mid')">보통</button>
          <button class="hy-tbtn${draft.paint==='no'?' on':''}" onclick="hySetField(${idx},'paint','no')">재도색</button>
        </div>`)}

      ${draft.hydrant_type==='underground'?hyCollapsibleField(idx,'insul','🧊 보온상태',INSUL_LABEL,draft.insul,`
        <div class="hy-toggle-row">
          <button class="hy-tbtn${draft.insul==='yes'?' on':''}" onclick="hySetField(${idx},'insul','yes')">설치됨</button>
          <button class="hy-tbtn${draft.insul==='mid'?' on':''}" onclick="hySetField(${idx},'insul','mid')">불필요</button>
          <button class="hy-tbtn${draft.insul==='no'?' on':''}" onclick="hySetField(${idx},'insul','no')">재설치</button>
        </div>`):''}

      ${draft.hydrant_type==='ground'?hyCollapsibleField(idx,'protect','🛡️ 보호틀·노면표시',null,(draft.protect||draft.roadmark)?`${PROTECT_LABEL[draft.protect]||''}${draft.protect&&draft.roadmark?' · ':''}${draft.roadmark||''}`:'',`
        <div class="hy-label">보호틀</div>
        <div class="hy-toggle-row">
          <button class="hy-tbtn${draft.protect==='yes'?' on':''}" onclick="hySetField(${idx},'protect','yes')">설치</button>
          <button class="hy-tbtn${draft.protect==='no'?' on':''}" onclick="hySetField(${idx},'protect','no')">미설치</button>
        </div>
        <div class="hy-label" style="margin-top:7px">적색 노면 표시</div>
        <select class="hy-select" onchange="hySetField(${idx},'roadmark',this.value)">
          <option value="">선택</option>
          <option value="미설치"${draft.roadmark==='미설치'?' selected':''}>미설치</option>
          <option value="연석표시형"${draft.roadmark==='연석표시형'?' selected':''}>연석표시형</option>
          <option value="적색복선형"${draft.roadmark==='적색복선형'?' selected':''}>적색복선형</option>
          <option value="연석·적색복선"${draft.roadmark==='연석·적색복선'?' selected':''}>연석·적색복선 모두</option>
        </select>`):''}
    </div>

    <div class="hy-section" style="margin-bottom:0">
      <div class="hy-label">사용가부 <span class="hy-req">필수</span></div>
      <div class="hy-toggle-row">
        <button class="hy-tbtn hy-good${draft.resultTop==='양호'?' on':''}" onclick="hySetResultTop(${idx},'양호')">양호</button>
        <button class="hy-tbtn hy-warn${draft.resultTop==='불량사용가'?' on':''}" onclick="hySetResultTop(${idx},'불량사용가')">고장·사용가</button>
        <button class="hy-tbtn hy-bad${draft.resultTop==='불량사용불가'?' on':''}" onclick="hySetResultTop(${idx},'불량사용불가')">고장·사용불</button>
      </div>
      ${draft.resultTop==='양호'?`
      <div class="hy-toggle-row hy-grade-row" style="margin-top:6px">
        <button class="hy-tbtn${draft.result==='A'?' on':''}" onclick="hySetGrade(${idx},'A')">A</button>
        <button class="hy-tbtn${draft.result==='B'?' on':''}" onclick="hySetGrade(${idx},'B')">B</button>
        <button class="hy-tbtn${draft.result==='C'?' on':''}" onclick="hySetGrade(${idx},'C')">C</button>
        <button class="hy-tbtn${draft.result==='D'?' on':''}" onclick="hySetGrade(${idx},'D')">D</button>
      </div>`:''}
      ${(draft.resultTop==='불량사용가'||draft.resultTop==='불량사용불가')?`
      <textarea class="hy-defect" placeholder="고장 내용을 구체적으로 입력해주세요" oninput="hySetField(${idx},'defect_detail',this.value)" onblur="hySaveNow(${idx})">${esc(draft.defect_detail||'')}</textarea>`:''}
    </div>

    ${savedRec?`<div class="hy-saved-info">마지막 저장: ${esc(savedRec.insp_name||'')} · ${savedRec.updated_at?new Date(savedRec.updated_at).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</div>`:''}

    <div class="iw-divider"></div>

    <div class="iw-memo">
      <div class="iw-memo-header">
        <span class="iw-memo-title">📝 메모</span>
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end">
          <span class="iw-memo-status" id="memoSt-${idx}"></span>
          <button class="iw-memo-save" onclick="saveMemoNow(${idx})">💾 저장</button>
          <button class="iw-memo-del" onclick="deleteMemoNow(${idx})">🗑 삭제</button>
          <button class="iw-rv-inline iw-photo-add-top" onclick="openPhotoSheet(${idx})" title="사진 추가">📷 사진+</button>
        </div>
      </div>
      <textarea id="memo-${idx}" placeholder="점검 결과, 특이사항 입력..." oninput="onMemoInput(${idx},this)">${esc(memo)}</textarea>
      <div class="iw-memo-actions">
        <span class="iw-memo-len" id="memoLen-${idx}">${memo.length}/300자</span>
      </div>
    </div>

    <div class="iw-divider"></div>

    <div class="iw-photo-add-bottom" style="display:flex;align-items:center;justify-content:flex-start;margin-bottom:5px">
      <button class="iw-rv-inline" onclick="openPhotoSheet(${idx})" title="사진 추가">📷 사진+</button>
    </div>
    <div class="iw-photos" id="photoGrid-${idx}"></div>

    <div class="iw-divider"></div>

    <div class="iw-divider iw-done-bottom-divider"></div>
    <button class="iw-btn done-btn${isDone?' is-done':''} iw-done-bottom" id="doneBtn-${idx}" onclick="toggleDone(${idx})">
      ${isDone?'✓ 점검 완료 (취소)':'점검 완료시 클릭'}
    </button>`;

  renderPhotoGrid(idx,photos);
}
