/* 119hyd-Map2 · js/roadview.js — 로드뷰 */
AppFiles.reg('js/roadview.js','v3.14.18'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ RoadView ══════════ */
function setRvMode(on){rvMode=on;const btn=document.getElementById('btnRv');if(on){btn.classList.add('on-rv');btn.innerHTML='🔭<span class="btn-txt"> 위치 클릭...</span>';if(kakaoMap)kakaoMap.setCursor('crosshair');}else{btn.classList.remove('on-rv');btn.innerHTML='🔭<span class="btn-txt"> 로드뷰</span>';if(kakaoMap)kakaoMap.setCursor('');}}
function toggleRvMode(){
  if(!rvMode&&distMode){showToast('거리재기를 먼저 종료하세요','err');return;}
  setRvMode(!rvMode);
  if(rvMode)showToast('지도에서 로드뷰를 볼 위치를 클릭하세요','');
}
function openRvAt(latLng){
  document.getElementById('rvPanel').style.display='flex';
  document.getElementById('rvHint').textContent=`${latLng.getLat().toFixed(5)}, ${latLng.getLng().toFixed(5)}`;
  const tb=document.getElementById('mapToolbar');if(tb)tb.style.top='56px';
  const tbTop=document.getElementById('mapToolbarTop');if(tbTop)tbTop.style.setProperty('display','none','important');
  if(!rvInstance)rvInstance=new kakao.maps.Roadview(document.getElementById('rvMap'));
  if(!rvMinimapInst){
    rvMinimapInst=new kakao.maps.Map(document.getElementById('rvMinimapInner'),{center:latLng,level:3});
    // ③ 로드뷰가 있는 길을 파란 선으로 (카카오맵과 같은 도로선)
    try{new kakao.maps.RoadviewOverlay().setMap(rvMinimapInst);}catch(e){}
    // ① 카메라 표시: 가운데 점 + 보고 있는 방향의 부채꼴 시야 (② 로드뷰를 돌리면 같이 회전)
    rvOverlay=new kakao.maps.CustomOverlay({position:latLng,content:_rvCamEl(),xAnchor:.5,yAnchor:.5,zIndex:10});
    rvOverlay.setMap(rvMinimapInst);
    kakao.maps.event.addListener(rvInstance,'position_changed',()=>{
      const pos=rvInstance.getPosition();
      if(pos&&rvMinimapInst){rvMinimapInst.setCenter(pos);rvOverlay.setPosition(pos);}
    });
    kakao.maps.event.addListener(rvInstance,'viewpoint_changed',_rvCamSync);
    kakao.maps.event.addListener(rvInstance,'init',_rvCamSync);
    // ④ 미니맵을 누르면 그 근처 로드뷰로 이동 (파란 선 위를 누르면 됨)
    kakao.maps.event.addListener(rvMinimapInst,'click',e=>_rvGoTo(e.latLng,true));
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
  document.getElementById('rvPanel').style.display='none';setRvMode(false);
  const tb=document.getElementById('mapToolbar');if(tb)tb.style.top='190px';
  syncMapToolbars();
  minimapOn=false;document.getElementById('rvMinimap').style.display='none'; // 다음에 열 때 다시 기본값(PC 켬)으로
  _rvHySync(); // 미니맵 소화전 표시 비움 (다음에 열 때 최신 상태로 다시 그림)
  const btn=document.getElementById('btnMinimap');if(btn){btn.style.background='';btn.style.color='';}
  if(lastIw&&kakaoMap){lastIw.setMap(kakaoMap);iwOpen=lastIw;lastIw=null;}
}
function toggleMinimap(auto){
  minimapOn=!minimapOn;
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
  if(!minimapOn||!panelOpen){_rvHyOv.forEach(o=>o.ov.setMap(null));_rvHyOv.clear();return;}
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
      el.addEventListener('click',e=>{e.stopPropagation();_rvGoTo(new kakao.maps.LatLng(d.lat,d.lng),true);});
      const ov=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(d.lat,d.lng),content:el,xAnchor:.5,yAnchor:.5,zIndex:5,clickable:true});
      ov.setMap(rvMinimapInst);
      o={ov,el};_rvHyOv.set(d,o);
    }
    // 색·완료·이름은 매번 맞춤 (로드뷰를 보는 중에 완료 처리한 것도 반영)
    const done=!!doneMap[d.id];
    o.el.classList.toggle('done',done);
    o.el.firstChild.style.background=done?'':groupColor(d);
    const t=_rvHyShort(d.name);
    if(o.el.lastChild.textContent!==t)o.el.lastChild.textContent=t;
    o.el.title=d.name;
  });
  _rvHyOv.forEach((o,d)=>{if(!want.has(d)){o.ov.setMap(null);_rvHyOv.delete(d);}});
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
