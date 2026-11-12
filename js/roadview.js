/* 119hyd-Map2 · js/roadview.js — 로드뷰 */
AppFiles.reg('js/roadview.js','v3.15.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ RoadView ══════════ */
function setRvMode(on){rvMode=on;const btn=document.getElementById('btnRv');if(on){btn.classList.add('on-rv');btn.innerHTML='🔭<span class="btn-txt"> 위치 클릭...</span>';if(kakaoMap)kakaoMap.setCursor('crosshair');}else{btn.classList.remove('on-rv');btn.innerHTML='🔭<span class="btn-txt"> 로드뷰</span>';if(kakaoMap)kakaoMap.setCursor('');}}
function toggleRvMode(){
  if(!rvMode&&distMode){showToast('거리재기를 먼저 종료하세요','err');return;}
  setRvMode(!rvMode);
  if(rvMode)showToast('지도에서 로드뷰를 볼 위치를 클릭하세요','');
}
function openRvAt(latLng){
  document.getElementById('rvPanel').style.display='flex';
  // 휴대폰: 로드뷰를 끄는 동안 페이지가 밀려 위쪽 메뉴 줄이 사라지던 문제 → 스크롤 막고 맨 위로 (v3.14.25)
  document.documentElement.classList.add('rv-open');
  if(!_rvPinOutsideBound){ // 핀 메뉴 밖을 누르면 닫기 (한 번만 연결)
    _rvPinOutsideBound=true;
    document.getElementById('rvPanel').addEventListener('pointerdown',e=>{if(!e.target.closest?.('.rv-pin'))_rvPinMenuClose();},true);
  }
  window.scrollTo(0,0);
  document.getElementById('rvHint').textContent=`${latLng.getLat().toFixed(5)}, ${latLng.getLng().toFixed(5)}`;
  const tb=document.getElementById('mapToolbar');if(tb)tb.style.top='56px';
  const tbTop=document.getElementById('mapToolbarTop');if(tbTop)tbTop.style.setProperty('display','none','important');
  if(!rvInstance)rvInstance=new kakao.maps.Roadview(document.getElementById('rvMap'));
  if(!rvMinimapInst){
    rvMinimapInst=new kakao.maps.Map(document.getElementById('rvMinimapInner'),{center:latLng,level:3});
    // ③ 로드뷰가 있는 길을 파란 선으로 (카카오맵과 같은 도로선)
    try{_rvRoadLine=new kakao.maps.RoadviewOverlay();_rvRoadLine.setMap(rvMinimapInst);}catch(e){}
    // ① 카메라 표시: 가운데 점 + 보고 있는 방향의 부채꼴 시야 (② 로드뷰를 돌리면 같이 회전)
    rvOverlay=new kakao.maps.CustomOverlay({position:latLng,content:_rvCamEl(),xAnchor:.5,yAnchor:.5,zIndex:3}); // 소화전 마커(5)보다 아래 — 마커를 가리지 않게 (v3.15.0)
    rvOverlay.setMap(rvMinimapInst);
    kakao.maps.event.addListener(rvInstance,'position_changed',()=>{
      const pos=rvInstance.getPosition();
      if(pos&&rvMinimapInst){rvMinimapInst.setCenter(pos);rvOverlay.setPosition(pos);}
      _rvPinSync();
    });
    kakao.maps.event.addListener(rvInstance,'init',_rvPinSync); // 로드뷰 사진이 준비된 뒤 핀 올리기
    kakao.maps.event.addListener(rvInstance,'viewpoint_changed',_rvCamSync);
    kakao.maps.event.addListener(rvInstance,'init',_rvCamSync);
    // ④ 미니맵을 누르면 그 근처 로드뷰로 이동 (파란 선 위를 누르면 됨)
    kakao.maps.event.addListener(rvMinimapInst,'click',e=>{
      if(_rvHyMenuClose())return;               // 메뉴가 열려 있었으면 닫기만
      if(_rvFix){_rvFixSet(e.latLng);return;}   // 위치 수정 중: 누른 곳으로 옮겨 둠 (저장은 ✅ 저장 버튼)
      _rvGoTo(e.latLng,true);
    });
    kakao.maps.event.addListener(rvMinimapInst,'idle',_rvHySync); // 미니맵을 옮기면 화면 안 소화전 다시 그림
  }else{rvMinimapInst.setCenter(latLng);rvOverlay.setPosition(latLng);}
  // PC에서는 미니맵을 기본으로 켬 (끈 적이 있으면 그 상태를 기억) — 휴대폰은 화면이 작아 꺼진 채 시작 (v3.14.4)
  _rvMmGripInit();
  _rvMmApplySize();
  const want=window.innerWidth>600&&safeStorage.get('hy_rv_minimap','1')!=='0';
  if(want!==minimapOn)toggleMinimap(true);
  else if(minimapOn)setTimeout(()=>{rvMinimapInst.relayout();rvMinimapInst.setCenter(rvOverlay.getPosition());},50);
  setTimeout(_rvHySync,80);
  _rvGoTo(latLng,false);
}
// 그 위치에서 가장 가까운 로드뷰(50m 안)로 이동. fromMini: 미니맵을 눌러 옮긴 경우
function _rvGoTo(latLng,fromMini,onFail){
  const client=new kakao.maps.RoadviewClient();
  client.getNearestPanoId(latLng,50,panoId=>{
    if(panoId){
      rvInstance.setPanoId(panoId,latLng);
      if(fromMini)document.getElementById('rvHint').textContent=`${latLng.getLat().toFixed(5)}, ${latLng.getLng().toFixed(5)}`;
    }else if(fromMini){
      if(onFail)onFail();
      showToast('이 근처에는 로드뷰가 없습니다. 파란 선 위에 놓아 주세요','');
    }
    else document.getElementById('rvHint').textContent='로드뷰 없음';
  });
}
/* ── 미니맵 카메라 표시 (v3.14.14: 카카오맵 '동동이' 그림) ──
   카카오 지도 API 공식 예제(동동이를 이용하여 로드뷰와 지도 연동하기)의 그림·위치 값을 그대로 쓴다.
   보는 방향(pan)에 따라 22.5°마다 16방향 그림(m0~m15)으로 바꾼다.
   그림을 못 받으면(카카오 서버 문제 등) 예전 모양(빨간 점 + 부채꼴, v3.14.10)으로 대신 보여 준다. */
const RV_WK_IMG='https://t1.daumcdn.net/localimg/localimages/07/2018/pc/roadview_minimap_wk_2018.png';
let _rvCamBox=null,_rvCamRot=null,_rvWalker=null;
function _rvCamEl(){
  const box=document.createElement('div');
  box.className='rv-cam-box'; // 크기 0인 상자: 이 점이 로드뷰 위치
  _rvCamBox=box;
  _rvWalker=document.createElement('div');
  _rvWalker.className='MapWalker m0';
  _rvWalker.innerHTML='<div class="angleBack"></div><div class="figure"></div>';
  box.appendChild(_rvWalker);
  _rvDragInit(box);
  const img=new Image();
  img.onerror=_rvCamFallback;
  img.src=RV_WK_IMG;
  return box;
}
function _rvCamFallback(){
  if(!_rvCamBox)return;
  _rvWalker=null;
  _rvCamBox.innerHTML='<div class="rv-cam"><div class="rv-cam-rot"><svg width="64" height="64" viewBox="0 0 64 64">'
    +'<path d="M32 32 L16 4.3 A32 32 0 0 1 48 4.3 Z" fill="rgba(239,68,68,.35)" stroke="#ef4444" stroke-width="1.5"/>'
    +'</svg></div><div class="rv-cam-dot"></div></div>';
  _rvCamRot=_rvCamBox.querySelector('.rv-cam-rot');
  _rvCamSync();
}
function _rvCamSync(){
  if(!rvInstance?.getViewpoint)return;
  const vp=rvInstance.getViewpoint();
  if(!vp||!isFinite(vp.pan))return;
  const pan=((vp.pan%360)+360)%360;
  if(_rvWalker){
    const cls='MapWalker m'+(Math.floor(pan/22.5)%16);
    if(_rvWalker.className!==cls)_rvWalker.className=cls;
  }else if(_rvCamRot)_rvCamRot.style.transform=`rotate(${pan}deg)`;
}
/* ── 동동이 끌어서 옮기기 (v3.14.15) ──
   사람 그림(빨간 점 모양일 땐 점)을 잡고 끌면 따라오고, 놓은 곳 50m 안의 로드뷰로 이동한다.
   로드뷰가 없으면 원래 자리로 돌아간다. 끄는 동안 미니맵 지도는 움직이지 않게 막는다. */
function _rvDragInit(box){
  let drag=null;
  const stop=e=>{if(e.target.closest?.('.figure,.rv-cam-dot'))e.stopPropagation();};
  // 카카오 지도는 mousedown·touchstart로 지도 끌기를 시작하므로 그 전에 막는다
  ['mousedown','touchstart','click','dblclick'].forEach(t=>box.addEventListener(t,stop));
  const toLatLng=e=>{
    const r=document.getElementById('rvMinimapInner').getBoundingClientRect();
    return rvMinimapInst.getProjection().coordsFromContainerPoint(new kakao.maps.Point(e.clientX-r.left,e.clientY-r.top));
  };
  box.addEventListener('pointerdown',e=>{
    if(!e.target.closest('.figure,.rv-cam-dot')||!rvMinimapInst)return;
    if(_rvFix){e.preventDefault();e.stopPropagation();return;} // 위치 수정 중에는 동동이 끌기 막음
    e.preventDefault();e.stopPropagation();
    drag={x:e.clientX,y:e.clientY,moved:false,from:rvOverlay.getPosition()};
    box.classList.add('dragging');
    rvMinimapInst.setDraggable(false);
    try{e.target.setPointerCapture(e.pointerId);}catch{}
  });
  box.addEventListener('pointermove',e=>{
    if(!drag)return;
    e.preventDefault();
    if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<4)return;
    drag.moved=true;
    rvOverlay.setPosition(toLatLng(e));
  });
  const end=e=>{
    if(!drag)return;
    const d=drag;drag=null;
    box.classList.remove('dragging');
    rvMinimapInst.setDraggable(true);
    if(!d.moved)return;
    const ll=toLatLng(e);
    rvOverlay.setPosition(ll);
    _rvGoTo(ll,true,()=>{rvOverlay.setPosition(d.from);});
  };
  box.addEventListener('pointerup',end);
  box.addEventListener('pointercancel',e=>{if(!drag)return;const d=drag;drag=null;box.classList.remove('dragging');rvMinimapInst.setDraggable(true);rvOverlay.setPosition(d.from);});
}
function openRvFromPopup(latLng){lastIw=iwOpen;closeIw();openRvAt(latLng);}
function closeRv(){
  _rvFixEnd();_rvHyMenuClose();
  document.getElementById('rvPanel').style.display='none';setRvMode(false);
  document.documentElement.classList.remove('rv-open');
  _rvPinSync(); // 로드뷰 속 소화전 핀 비움
  const tb=document.getElementById('mapToolbar');if(tb)tb.style.top='190px';
  syncMapToolbars();
  minimapOn=false;document.getElementById('rvMinimap').style.display='none'; // 다음에 열 때 다시 기본값(PC 켬)으로
  _rvHySync(); // 미니맵 소화전 표시 비움 (다음에 열 때 최신 상태로 다시 그림)
  const btn=document.getElementById('btnMinimap');if(btn){btn.style.background='';btn.style.color='';}
  if(lastIw&&kakaoMap){lastIw.setMap(kakaoMap);iwOpen=lastIw;lastIw=null;}
}
function toggleMinimap(auto){
  minimapOn=!minimapOn;
  if(!minimapOn){_rvFixEnd();_rvHyMenuClose();}
  if(!auto&&window.innerWidth>600)safeStorage.set('hy_rv_minimap',minimapOn?'1':'0'); // PC에서 직접 끄고 켠 것만 기억
  document.getElementById('rvMinimap').style.display=minimapOn?'block':'none';
  const btn=document.getElementById('btnMinimap');
  if(btn){btn.style.background=minimapOn?'var(--ac)':'';btn.style.color=minimapOn?'#fff':'';}
  if(minimapOn&&rvMinimapInst)setTimeout(()=>{rvMinimapInst.relayout();if(rvOverlay)rvMinimapInst.setCenter(rvOverlay.getPosition());_rvHySync();},50);
  else _rvHySync(); // 끄면 소화전 표시도 비움
}
/* ── 미니맵 소화전 표시 (v3.14.16) ──
   큰 지도에 보이는 소화전(조·식구분·노후 등 필터 그대로)만, 미니맵 화면 안에 있는 것만 작은 동그라미로 그린다.
   색은 큰 지도와 같음(조 색 / 완료 녹색 ✓). 누르면 그 소화전 근처 로드뷰로 이동. */
const _rvHyOv=new Map(); // 소화전 → {ov, el}
// 번호는 숫자만, 앞의 0은 뺌 (금천-000350 → 350). 숫자가 없으면 이름 끝부분 그대로 (v3.14.17)
function _rvHyShort(name){
  const s=String(name||'');
  const n=s.match(/(\d+)\D*$/);if(n)return String(parseInt(n[1],10));
  const m=s.match(/[-_\s]([^-_\s]+)$/);return m?m[1]:s;
}
function _rvHySync(){
  if(!rvMinimapInst)return;
  const panelOpen=document.getElementById('rvPanel')?.style.display==='flex';
  if(!minimapOn||!panelOpen){_rvHyOv.forEach(o=>o.ov.setMap(null));_rvHyOv.clear();_rvPinSync();return;}
  const bd=rvMinimapInst.getBounds(),sw=bd.getSouthWest(),ne=bd.getNorthEast();
  const pl=(ne.getLat()-sw.getLat())*.2,pg=(ne.getLng()-sw.getLng())*.2;
  const want=new Set();
  items.forEach(d=>{
    if(!d.lat||!d.lng||isHidden(d))return;
    if(d.lat<sw.getLat()-pl||d.lat>ne.getLat()+pl||d.lng<sw.getLng()-pg||d.lng>ne.getLng()+pg)return;
    want.add(d);
    let o=_rvHyOv.get(d);
    if(!o){
      const el=document.createElement('div');
      el.className='rv-hy';
      el.innerHTML='<i></i><span></span>';
      el.addEventListener('click',e=>{
        e.stopPropagation();
        if(_rvFix){if(!_rvFix.d)_rvFixSelect(d);return;} // 고르기 단계면 그 소화전으로, 수정 중이면 아무 일 없음 (취소는 ✕ 버튼)
        _rvHyMenuOpen(d);
      });
      _rvFixDragInit(el,d);
      const ov=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(d.lat,d.lng),content:el,xAnchor:.5,yAnchor:.5,zIndex:5,clickable:true});
      ov.setMap(rvMinimapInst);
      o={ov,el};_rvHyOv.set(d,o);
    }
    if(!(_rvFix&&_rvFix.d===d)){ // 위치가 바뀌었으면 따라감 (수정 중인 마커는 손대지 않음)
      const p=o.ov.getPosition();
      if(!p||Math.abs(p.getLat()-d.lat)>1e-9||Math.abs(p.getLng()-d.lng)>1e-9)o.ov.setPosition(new kakao.maps.LatLng(d.lat,d.lng));
    }
    o.el.classList.toggle('fixing',!!(_rvFix&&_rvFix.d===d));
    // 색·완료·이름은 매번 맞춤 (로드뷰를 보는 중에 완료 처리한 것도 반영)
    const done=!!doneMap[d.id];
    o.el.classList.toggle('done',done);
    o.el.firstChild.style.background=done?'':groupColor(d);
    const t=_rvHyShort(d.name);
    if(o.el.lastChild.textContent!==t)o.el.lastChild.textContent=t;
    o.el.title=d.name;
  });
  _rvHyOv.forEach((o,d)=>{if(!want.has(d)){o.ov.setMap(null);_rvHyOv.delete(d);}});
  _rvPinSync();
}
/* ── 미니맵에서 소화전 위치 수정 (v3.14.19) ──
   마커를 누르면 [🔭 로드뷰 이동] [📍 위치 수정] 메뉴. 위치 수정 중에는:
     · 파란 도로선을 숨기고, 다른 마커는 흐리게(누르면 통과), 동동이 끌기는 막음
     · 미니맵을 누르거나 마커를 끌어 놓으면 그 자리로 옮겨 둠(묻지 않음, 몇 번이든) → 안내 줄 [✅ 저장]으로 저장 (v3.14.22)
       저장은 큰 지도의 위치 수정과 같음(applyFixLocation) · [✕ 취소]면 원래 자리로 */
let _rvRoadLine=null,_rvFix=null,_rvHyMenu=null,_rvPinOutsideBound=false;
function _rvHyMenuOpen(d){
  _rvHyMenuClose();
  const el=document.createElement('div');
  el.className='rv-hy-menu';
  el.innerHTML=`<b></b><div><button data-a="go">🔭 로드뷰 이동</button><button data-a="fix">📍 위치 수정</button></div>`;
  el.querySelector('b').textContent=d.name;
  el.addEventListener('click',e=>{
    e.stopPropagation();
    const a=e.target.closest('button')?.dataset.a;if(!a)return;
    _rvHyMenuClose();
    if(a==='go')_rvGoTo(new kakao.maps.LatLng(d.lat,d.lng),true);
    else _rvFixStart(d);
  });
  ['mousedown','touchstart'].forEach(t=>el.addEventListener(t,e=>e.stopPropagation()));
  _rvHyMenu=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(d.lat,d.lng),content:el,xAnchor:.5,yAnchor:1.15,zIndex:20,clickable:true});
  _rvHyMenu.setMap(rvMinimapInst);
}
function _rvHyMenuClose(){if(!_rvHyMenu)return false;_rvHyMenu.setMap(null);_rvHyMenu=null;return true;}
function _rvFixStart(d){
  _rvPinMenuClose();
  _rvFix={d,pos:null}; // pos: 옮겨 둔 새 위치 (저장 전)
  _rvRoadLine?.setMap(null); // 파란 선 숨김
  const mm=document.getElementById('rvMinimap');
  mm.classList.add('rv-fixing');
  let bar=document.getElementById('rvFixBar');
  if(!bar){
    bar=document.createElement('div');bar.id='rvFixBar';bar.className='rv-fix-bar';
    bar.innerHTML='<span></span><div><button class="rv-fix-save" title="옮겨 둔 위치로 저장">✅ 저장</button><button class="rv-fix-cancel" title="위치 수정 취소 (원래 자리로)">✕ 취소</button></div>';
    bar.querySelector('.rv-fix-save').addEventListener('click',e=>{e.stopPropagation();_rvFixSave();});
    bar.querySelector('.rv-fix-cancel').addEventListener('click',e=>{e.stopPropagation();_rvFixEnd(true);});
    ['mousedown','touchstart','pointerdown','click','dblclick'].forEach(t=>bar.addEventListener(t,e=>e.stopPropagation()));
    mm.appendChild(bar);
  }
  bar.querySelector('.rv-fix-save').disabled=true;
  bar.style.display='flex';
  _rvMmFixBtnSync();
  if(d)_rvFixSelect(d);
  else{ // 고르기 단계 (미니맵 📍 위치 수정 버튼, v3.15.0): 아무 마커나 끌거나 누르면 그 소화전으로 정해짐
    mm.classList.add('rv-fix-pick');
    bar.querySelector('span').textContent='📍 옮길 마커 고르기';
    showToast('미니맵에서 옮길 소화전 마커를 끌거나 누르세요','');
    bar.title='';
    _rvAimShow(false);
    _rvHySync();
  }
}
// 고칠 소화전 정하기
function _rvFixSelect(d){
  if(!_rvFix)return;
  _rvFix.d=d;
  document.getElementById('rvMinimap')?.classList.remove('rv-fix-pick');
  const bar=document.getElementById('rvFixBar');
  bar.querySelector('span').textContent=`📍 ${_rvHyShort(d.name)}번 위치 맞추기`; // 미니맵이 작아 짧게 — 설명은 알림으로
  bar.title=d.name;
  showToast('마커를 끌거나 미니맵을 눌러 로드뷰 속 핀을 실제 소화전에 맞춘 뒤 ✅ 저장','');
  _rvAimShow(true); // 로드뷰 화면 십자선 + 📐 조준 (v3.14.26)
  _rvHySync();
}
// 미니맵 [📍 위치 수정] 버튼 (v3.15.0)
function toggleRvMmFix(){
  if(_rvFix){_rvFixEnd(true);return;}
  _rvHyMenuClose();
  _rvFixStart(null);
}
function _rvMmFixBtnSync(){
  const b=document.getElementById('rvMmFixBtn');if(!b)return;
  b.style.display=_rvFix?'none':''; // 수정 중에는 아래 [✕ 취소]로
}
function _rvFixEnd(cancelled){
  if(!_rvFix)return;
  _rvFix=null;
  if(rvMinimapInst)_rvRoadLine?.setMap(rvMinimapInst); // 파란 선 다시
  document.getElementById('rvMinimap')?.classList.remove('rv-fixing','rv-fix-pick');
  const bar=document.getElementById('rvFixBar');if(bar)bar.style.display='none';
  _rvMmFixBtnSync();
  _rvAimShow(false);
  if(rvMinimapInst)rvMinimapInst.setDraggable(true);
  _rvHySync(); // 마커·로드뷰 핀을 원래(또는 저장된) 자리로
  if(cancelled)showToast('위치 수정 취소됨','');
}
// 새 위치로 옮겨 두기 (묻지 않음 — 여러 번 옮겨 맞춘 뒤 ✅ 저장)
function _rvFixSet(latLng){
  if(!_rvFix)return;
  if(!_rvFix.d){showToast('먼저 옮길 마커를 끌거나 눌러 고르세요','');return;}
  const d=_rvFix.d;
  _rvFix.pos=latLng;
  _rvHyOv.get(d)?.ov.setPosition(latLng);
  _rvPinMove(d,latLng);
  const b=document.querySelector('#rvFixBar .rv-fix-save');if(b)b.disabled=false;
}
async function _rvFixSave(){
  if(!_rvFix||!_rvFix.pos||!_rvFix.d)return;
  const d=_rvFix.d,latLng=_rvFix.pos,idx=items.indexOf(d);
  _rvFixEnd();
  if(idx<0)return;
  _fixMeta={method:'미니맵(로드뷰)'}; // 이력에 남는 방법 (gps.js)
  await applyFixLocation(idx,latLng);
  _rvHySync();
}
// 수정 중인 마커 끌기
function _rvFixDragInit(el,d){
  let drag=null;
  el.addEventListener('pointerdown',e=>{
    if(!_rvFix||(_rvFix.d&&_rvFix.d!==d)||!rvMinimapInst)return;
    if(!_rvFix.d)_rvFixSelect(d); // 고르기 단계: 끌기 시작한 마커로 정함
    e.preventDefault();e.stopPropagation();
    drag={x:e.clientX,y:e.clientY,moved:false};
    rvMinimapInst.setDraggable(false);
    try{el.setPointerCapture(e.pointerId);}catch{}
  });
  ['mousedown','touchstart'].forEach(t=>el.addEventListener(t,e=>{if(_rvFix&&(!_rvFix.d||_rvFix.d===d))e.stopPropagation();}));
  const toLatLng=e=>{
    const r=document.getElementById('rvMinimapInner').getBoundingClientRect();
    return rvMinimapInst.getProjection().coordsFromContainerPoint(new kakao.maps.Point(e.clientX-r.left,e.clientY-r.top));
  };
  el.addEventListener('pointermove',e=>{
    if(!drag||!_rvFix)return;
    e.preventDefault();
    if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<4)return;
    drag.moved=true;
    const ll=toLatLng(e);
    _rvHyOv.get(d)?.ov.setPosition(ll);
    _rvPinMove(d,ll); // 로드뷰 속 핀도 같이 움직임 → 사진 속 실제 소화전에 닿게 맞추기
  });
  const end=e=>{
    if(!drag)return;const moved=drag.moved;drag=null;
    rvMinimapInst?.setDraggable(true);
    if(_rvFix&&moved)_rvFixSet(toLatLng(e)); // 놓은 자리에 그대로 둠
  };
  el.addEventListener('pointerup',end);
  el.addEventListener('pointercancel',()=>{if(!drag)return;drag=null;rvMinimapInst?.setDraggable(true);const p=_rvFix?.pos||new kakao.maps.LatLng(d.lat,d.lng);_rvHyOv.get(d)?.ov.setPosition(p);_rvPinMove(d,p);});
}
/* ── 로드뷰 사진 속 소화전 핀 (v3.14.21) ──
   카카오 API는 로드뷰에도 좌표대로 오버레이를 올릴 수 있다. 좌표가 맞으면 핀이 사진 속 실제 소화전 위에 선다.
   로드뷰 위치에서 100m 안 가장 가까운 소화전 하나만 (큰 지도에 보이는 것 중). 미니맵 위치 수정 중에는 끄는 대로 핀이 따라 움직인다. */
const _rvPinOv=new Map(); // 소화전 → {ov, el}
const RV_PIN_RANGE=100;    // m
function _rvPinSync(){
  const open=document.getElementById('rvPanel')?.style.display==='flex';
  const pos=open&&rvInstance?.getPosition?.();
  if(!pos){_rvPinOv.forEach(o=>o.ov.setMap(null));_rvPinOv.clear();_rvNearText('');return;}
  const lat0=pos.getLat(),lng0=pos.getLng(),kx=111320*Math.cos(lat0*Math.PI/180);
  // 핀은 하나만 (여러 개면 사진에서 헷갈림, v3.14.24): 위치 수정 중이면 그 소화전, 아니면 100m 안 가장 가까운 소화전
  let pick=null;
  if(_rvFix&&_rvFix.d){pick=_rvFix.d;_rvNearText(`📍 ${_rvHyShort(pick.name)} 위치 수정 중`);}
  else{
    let best=RV_PIN_RANGE;
    items.forEach(d=>{
      if(!d.lat||!d.lng||isHidden(d))return;
      const m=Math.hypot((d.lat-lat0)*110540,(d.lng-lng0)*kx);
      if(m<=best){best=m;pick=d;}
    });
    // 메뉴 줄 안내: 핀이 안 보일 때 '100m 안에 없어서'인지 구분되게 (v3.14.25)
    _rvNearText(pick?`📍 ${_rvHyShort(pick.name)} · ${Math.round(best)}m`:'100m 안 소화전 없음',pick?pick.name:'');
  }
  const want=new Set();
  (pick?[pick]:[]).forEach(d=>{
    const fixing=!!(_rvFix&&_rvFix.d);
    want.add(d);
    let o=_rvPinOv.get(d);
    if(!o){
      const el=document.createElement('div');
      el.className='rv-pin';
      el.innerHTML='<b></b><div class="rv-pin-menu"><button>📍 위치 수정</button></div>';
      _rvPinMenuInit(el,d); // 핀을 누르면 위치 수정 메뉴 (v3.14.27)
      const ov=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(d.lat,d.lng),content:el,xAnchor:.5,yAnchor:1,zIndex:3});
      try{ov.setRange?.(RV_PIN_RANGE+50);}catch(e){}
      _rvPinDragInit(el,d); // 위치 수정 중이면 로드뷰 속에서 끌어 옮기기 (v3.14.23)
      ov.setMap(rvInstance);
      o={ov,el};_rvPinOv.set(d,o);
    }else if(!fixing){
      const p=o.ov.getPosition();
      if(!p||Math.abs(p.getLat()-d.lat)>1e-9||Math.abs(p.getLng()-d.lng)>1e-9)o.ov.setPosition(new kakao.maps.LatLng(d.lat,d.lng));
    }
    const done=!!doneMap[d.id];
    o.el.classList.toggle('done',done);
    o.el.classList.toggle('fixing',fixing);
    o.el.firstChild.style.background=done?'':groupColor(d);
    const t=_rvHyShort(d.name);
    if(o.el.firstChild.textContent!==t)o.el.firstChild.textContent=t;
    o.el.title=d.name;
  });
  _rvPinOv.forEach((o,d)=>{if(!want.has(d)){o.ov.setMap(null);_rvPinOv.delete(d);}});
}
function _rvNearText(t,title){
  const el=document.getElementById('rvNear');if(!el)return;
  if(el.textContent!==t)el.textContent=t;
  el.title=title||'로드뷰 위치에서 가장 가까운 소화전 (100m 안)';
}
function _rvPinMove(d,latLng){
  const o=_rvPinOv.get(d);
  if(o)o.ov.setPosition(latLng);
  else _rvPinSync();
}
/* ── 📐 두 곳에서 조준해 위치 구하기 (v3.14.26) ──
   핀의 높이·거리 계산(사진 가장자리 왜곡, 높이 오차)을 쓰지 않고 '방향'만 쓴다.
   로드뷰 화면 한가운데 십자선에 소화전 밑동을 맞추고 조준 → 그때의 로드뷰 위치와 보는 방향(pan)을 기록.
   다른 지점(5~20m 떨어진 곳)에서 한 번 더 조준하면 두 방향선이 만나는 점으로 마커를 옮긴다. 저장은 ✅ 저장.
   남은 오차는 로드뷰 촬영 위치 자체의 GPS 오차(1~3m)뿐. */
let _rvAims=[],_rvAimLines=[];
function _rvAimShow(on){
  const body=document.querySelector('#rvPanel .rv-body');if(!body)return;
  let cross=document.getElementById('rvCross'),bar=document.getElementById('rvAimBar');
  if(on&&!cross){
    cross=document.createElement('div');cross.id='rvCross';cross.className='rv-cross';body.appendChild(cross);
    bar=document.createElement('div');bar.id='rvAimBar';bar.className='rv-aim-bar';
    bar.innerHTML='<span></span><button class="rv-aim-btn">📐 조준</button><button class="rv-aim-reset" title="조준 다시">↺</button>';
    bar.querySelector('.rv-aim-btn').addEventListener('click',e=>{e.stopPropagation();_rvAim();});
    bar.querySelector('.rv-aim-reset').addEventListener('click',e=>{e.stopPropagation();_rvAimReset();_rvAimUi();});
    ['mousedown','touchstart','pointerdown','click','dblclick'].forEach(t=>bar.addEventListener(t,e=>e.stopPropagation()));
    body.appendChild(bar);
  }
  if(cross)cross.style.display=on?'block':'none';
  if(bar)bar.style.display=on?'flex':'none';
  _rvAimReset();
  if(on)_rvAimUi();
}
function _rvAimUi(){
  const bar=document.getElementById('rvAimBar');if(!bar)return;
  const n=_rvAims.length;
  bar.querySelector('span').textContent=n===0?'＋에 소화전 밑동 맞추기':n===1?'1/2 · 옆으로 옮겨 다시':'완료 · 확인 후 저장';
  bar.querySelector('.rv-aim-btn').textContent=n===0?'📐 조준 1':n===1?'📐 조준 2':'📐 다시 조준';
  bar.querySelector('.rv-aim-reset').style.display=n?'':'none';
}
function _rvAimReset(){_rvAims=[];_rvAimLines.forEach(l=>l.setMap(null));_rvAimLines=[];}
// lat/lng ↔ 기준점 기준 m
function _rvEN(o,ll){return [(ll.getLng()-o.getLng())*_rvMLng(o.getLat()),(ll.getLat()-o.getLat())*_rvM_LAT];}
function _rvLL(o,e,n){return new kakao.maps.LatLng(o.getLat()+n/_rvM_LAT,o.getLng()+e/_rvMLng(o.getLat()));}
function _rvAimLine(from,to,color){
  if(!rvMinimapInst)return;
  const l=new kakao.maps.Polyline({path:[from,to],strokeWeight:3,strokeColor:color,strokeOpacity:.9,strokeStyle:'shortdash'});
  l.setMap(rvMinimapInst);_rvAimLines.push(l);
}
function _rvAim(){
  if(!_rvFix)return;
  const pos=rvInstance?.getPosition?.(),vp=rvInstance?.getViewpoint?.();
  if(!pos||!vp||!isFinite(vp.pan))return;
  if(_rvAims.length>=2)_rvAimReset(); // 세 번째는 처음부터 다시
  if(_rvAims.length===1){
    const [e,n]=_rvEN(_rvAims[0].pos,pos);
    if(Math.hypot(e,n)<3){showToast('같은 자리입니다 — 로드뷰에서 5~20m 옆으로 옮긴 뒤 조준해 주세요','');return;}
  }
  _rvAims.push({pos,pan:vp.pan});
  const th=vp.pan*Math.PI/180;
  if(_rvAims.length===1){
    _rvAimLine(pos,_rvLL(pos,60*Math.sin(th),60*Math.cos(th)),'#f97316');
    showToast('조준 1 기록 — 로드뷰에서 5~20m 옆으로 옮겨 같은 소화전을 다시 조준하세요','ok');
  }else{
    const r=_rvAimCross(_rvAims[0],_rvAims[1]);
    if(r.err){
      showToast(r.err,'');
      _rvAims.pop(); // 두 번째만 다시
    }else{
      _rvAimLines.forEach(l=>l.setMap(null));_rvAimLines=[];
      _rvAimLine(_rvAims[0].pos,r.ll,'#f97316');
      _rvAimLine(_rvAims[1].pos,r.ll,'#2563eb');
      _rvFixSet(r.ll);
      rvMinimapInst?.setCenter(r.ll);
      showToast(`📐 두 방향이 만나는 곳으로 옮겼습니다 (교차각 ${Math.round(r.ang)}°) — 확인 후 ✅ 저장`,'ok');
    }
  }
  _rvAimUi();
}
// 두 방향선의 교차점
function _rvAimCross(a,b){
  const o=a.pos,[ex,ny]=_rvEN(o,b.pos);
  const t1=a.pan*Math.PI/180,t2=b.pan*Math.PI/180;
  const d1=[Math.sin(t1),Math.cos(t1)],d2=[Math.sin(t2),Math.cos(t2)];
  const cr=d1[0]*d2[1]-d1[1]*d2[0];
  const ang=Math.asin(Math.min(1,Math.abs(cr)))*180/Math.PI;
  if(ang<15)return {err:`두 방향이 거의 나란합니다(${Math.round(ang)}°) — 더 옆으로 옮겨서 조준 2를 해 주세요`};
  const s1=(ex*d2[1]-ny*d2[0])/cr,s2=(ex*d1[1]-ny*d1[0])/cr; // a + s1·d1 = b + s2·d2
  if(s1<=0||s2<=0)return {err:'두 방향이 만나지 않습니다 — 십자선을 같은 소화전에 맞췄는지 확인해 주세요'};
  if(s1>150||s2>150)return {err:'교차점이 너무 멉니다(150m 넘음) — 소화전 가까이에서 조준해 주세요'};
  return {ll:_rvLL(o,s1*d1[0],s1*d1[1]),ang:ang>90?180-ang:ang};
}
/* ── 로드뷰 사진 속 핀 끌어 옮기기 (v3.14.23) ──
   카카오는 '사진 속 이 점의 좌표'를 알려 주지 않는다. 대신 좌표 → 사진 속 위치는 카카오가 그려 준다.
   그래서 끌기를 시작할 때 보이지 않는 기준점 4개를 바닥 좌표(카메라 앞 몇 m)에 올려 사진 속 위치를 읽고,
   '화면 점 → 바닥 좌표' 변환(평면 호모그래피)을 구한다. 땅이 평평하다고 보는 계산이라 경사진 곳은 오차가 있다.
   끄는 동안 로드뷰 화면은 돌지 않게 막는다. 옮긴 자리는 미니맵과 같이 _rvFixSet → ✅ 저장으로 저장. */
const _rvM_LAT=110540;
function _rvMLng(lat){return 111320*Math.cos(lat*Math.PI/180);}
// 8×8 연립방정식 (가우스 소거)
function _rvSolve(A,b){
  const n=b.length,M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<n;c++){
    let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;
    if(Math.abs(M[p][c])<1e-12)return null;
    [M[c],M[p]]=[M[p],M[c]];
    for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c]/M[c][c];for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k];}
  }
  return M.map((r,i)=>r[n]/r[i]);
}
// 대응점 4개(화면 x,y → 바닥 e,n)로 호모그래피 H 구하기
function _rvHomography(src,dst){
  const A=[],b=[];
  for(let i=0;i<4;i++){
    const [x,y]=src[i],[u,v]=dst[i];
    A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);
  }
  const h=_rvSolve(A,b);return h?[...h,1]:null;
}
// 기준점 4개를 올리고 사진 속 위치를 읽어 변환을 만든다 (그려질 때까지 두 프레임 기다림)
function _rvPinCalib(){
  return new Promise(resolve=>{
    const c=rvInstance?.getPosition?.(),vp=rvInstance?.getViewpoint?.();
    if(!c||!vp)return resolve(null);
    const lat0=c.getLat(),lng0=c.getLng(),mlng=_rvMLng(lat0),th=(vp.pan||0)*Math.PI/180;
    const sets=[[[5,-2.5],[5,2.5],[12,-5],[12,5]],[[3,-1.5],[3,1.5],[7,-3],[7,3]],[[10,-5],[10,5],[25,-10],[25,10]]];
    let k=0;
    const tryOne=()=>{
      if(k>=sets.length)return resolve(null);
      const pts=sets[k++].map(([f,r])=>{
        const e=f*Math.sin(th)+r*Math.cos(th),n=f*Math.cos(th)-r*Math.sin(th);
        const el=document.createElement('div');el.className='rv-probe';
        const ov=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(lat0+n/_rvM_LAT,lng0+e/mlng),content:el,xAnchor:.5,yAnchor:1,zIndex:1});
        ov.setMap(rvInstance);
        return {e,n,el,ov};
      });
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const src=[],dst=[];let ok=true;
        pts.forEach(p=>{
          const r=p.el.getBoundingClientRect();
          if(!r.width&&!r.height&&!r.left&&!r.top)ok=false; // 그려지지 않음(화면 밖 등)
          src.push([r.left+r.width/2,r.bottom]);dst.push([p.e,p.n]);
          p.ov.setMap(null);
        });
        const H=ok?_rvHomography(src,dst):null;
        if(!H)return tryOne();
        resolve({H,lat0,lng0,mlng,fwd:[Math.sin(th),Math.cos(th)]});
      }));
    };
    tryOne();
  });
}
// 화면 점 → 좌표 (하늘·카메라 뒤·너무 먼 곳이면 null)
function _rvScreenToLatLng(cal,x,y){
  const H=cal.H,w=H[6]*x+H[7]*y+1;
  if(Math.abs(w)<1e-9)return null;
  const e=(H[0]*x+H[1]*y+H[2])/w,n=(H[3]*x+H[4]*y+H[5])/w;
  const ahead=e*cal.fwd[0]+n*cal.fwd[1];
  if(!(ahead>0.5)||Math.hypot(e,n)>60)return null;
  return new kakao.maps.LatLng(cal.lat0+n/_rvM_LAT,cal.lng0+e/cal.mlng);
}
// 로드뷰 속 핀 누르기 → [📍 위치 수정] 메뉴 (위치 수정 중에는 메뉴 없이 끌기만)
function _rvPinMenuInit(el,d){
  const b=el.firstChild,menu=el.querySelector('.rv-pin-menu');
  ['mousedown','touchstart','pointerdown'].forEach(t=>{
    b.addEventListener(t,e=>{if(!_rvFix)e.stopPropagation();},{passive:true});
    menu.addEventListener(t,e=>e.stopPropagation(),{passive:true});
  });
  b.addEventListener('click',e=>{
    e.stopPropagation();
    if(_rvFix)return;
    const show=!el.classList.contains('menu');
    _rvPinMenuClose();
    el.classList.toggle('menu',show);
  });
  menu.querySelector('button').addEventListener('click',e=>{
    e.stopPropagation();
    _rvPinMenuClose();
    _rvFixFromRoadview(d);
  });
}
function _rvPinMenuClose(){_rvPinOv.forEach(o=>o.el.classList.remove('menu'));}
function _rvFixFromRoadview(d){
  _rvHyMenuClose();
  if(_rvFix)_rvFixEnd();
  // 저장·취소 버튼과 위치 확인이 미니맵에 있으므로 꺼져 있으면 켠다
  if(!minimapOn){toggleMinimap(true);setTimeout(()=>_rvFixStart(d),120);}
  else _rvFixStart(d);
}
function _rvPinDragInit(el,d){
  let drag=null;
  const mine=()=>_rvFix&&_rvFix.d===d;
  // 로드뷰가 끌기로 화면을 돌리지 않게 (위치 수정 중인 핀만)
  ['mousedown','touchstart','touchmove','click','dblclick','wheel'].forEach(t=>el.addEventListener(t,e=>{if(mine())e.stopPropagation();},{passive:true}));
  el.addEventListener('pointerdown',async e=>{
    if(!mine())return;
    e.preventDefault();e.stopPropagation();
    try{el.setPointerCapture(e.pointerId);}catch{}
    const r=el.getBoundingClientRect();
    drag={dx:e.clientX-(r.left+r.width/2),dy:e.clientY-r.bottom,cal:null,last:null};
    el.classList.add('dragging');
    const cal=await _rvPinCalib();
    if(!drag)return;
    if(!cal){drag=null;el.classList.remove('dragging');showToast('이 화면 각도에서는 계산이 어렵습니다 — 로드뷰를 조금 아래로 내려 보거나 미니맵에서 맞춰 주세요','');return;}
    drag.cal=cal;
    if(drag.last)_rvPinDragTo(drag,d);
  });
  el.addEventListener('pointermove',e=>{
    if(!drag)return;
    e.preventDefault();e.stopPropagation();
    drag.last=[e.clientX,e.clientY];
    if(drag.cal)_rvPinDragTo(drag,d);
  });
  const end=e=>{if(!drag)return;e.stopPropagation();drag=null;el.classList.remove('dragging');};
  el.addEventListener('pointerup',end);
  el.addEventListener('pointercancel',end);
}
function _rvPinDragTo(drag,d){
  const [x,y]=drag.last;
  const ll=_rvScreenToLatLng(drag.cal,x-drag.dx,y-drag.dy);
  if(ll&&_rvFix&&_rvFix.d===d)_rvFixSet(ll);
}
/* ── 미니맵 크기 조절 (v3.14.4) ──
   왼쪽 위 손잡이를 끌면 위·왼쪽으로 커지고 작아진다. 최소 140×110, 최대 로드뷰 화면의 70%. 크기는 이 기기에 기억. */
const RV_MM_MIN_W=140,RV_MM_MIN_H=110;
function _rvMmClamp(w,h){
  const body=document.querySelector('#rvPanel .rv-body');
  const maxW=body?Math.max(RV_MM_MIN_W,body.clientWidth*.7):600, maxH=body?Math.max(RV_MM_MIN_H,body.clientHeight*.7):450;
  return [Math.round(Math.min(maxW,Math.max(RV_MM_MIN_W,w))),Math.round(Math.min(maxH,Math.max(RV_MM_MIN_H,h)))];
}
function _rvMmApplySize(){
  const el=document.getElementById('rvMinimap');if(!el)return;
  let sz=null;try{sz=JSON.parse(safeStorage.get('hy_rv_mm_size')||'null');}catch{}
  if(!sz||!sz.w||!sz.h){el.style.width='';el.style.height='';return;} // 기본 크기(CSS)
  const [w,h]=_rvMmClamp(sz.w,sz.h);
  el.style.width=w+'px';el.style.height=h+'px';
}
let _rvMmGripReady=false;
function _rvMmGripInit(){ // 로드뷰를 처음 열 때 한 번
  const grip=document.getElementById('rvMmGrip'),el=document.getElementById('rvMinimap');
  if(_rvMmGripReady||!grip||!el)return;
  _rvMmGripReady=true;
  let sx,sy,sw,sh,raf=0;
  const move=e=>{
    const p=e.touches?e.touches[0]:e;
    const [w,h]=_rvMmClamp(sw+(sx-p.clientX),sh+(sy-p.clientY)); // 왼쪽 위로 끌면 커짐
    el.style.width=w+'px';el.style.height=h+'px';
    if(!raf)raf=requestAnimationFrame(()=>{raf=0;if(rvMinimapInst){rvMinimapInst.relayout();if(rvOverlay)rvMinimapInst.setCenter(rvOverlay.getPosition());}});
    e.preventDefault();
  };
  const up=()=>{
    el.classList.remove('resizing');
    document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);
    safeStorage.set('hy_rv_mm_size',JSON.stringify({w:el.offsetWidth,h:el.offsetHeight}));
    if(rvMinimapInst){rvMinimapInst.relayout();if(rvOverlay)rvMinimapInst.setCenter(rvOverlay.getPosition());}
  };
  grip.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();
    sx=e.clientX;sy=e.clientY;sw=el.offsetWidth;sh=el.offsetHeight;
    el.classList.add('resizing');
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
  });
  grip.addEventListener('dblclick',()=>{safeStorage.remove('hy_rv_mm_size');_rvMmApplySize();if(rvMinimapInst)setTimeout(()=>rvMinimapInst.relayout(),30);}); // 두 번 누르면 기본 크기로
}
