/* 119hyd-Map2 · js/roadview.js — 로드뷰 */
AppFiles.reg('js/roadview.js','v3.14.9'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

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
    rvOverlay=new kakao.maps.CustomOverlay({position:latLng,content:'<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>',zIndex:10});
    rvOverlay.setMap(rvMinimapInst);
    kakao.maps.event.addListener(rvInstance,'position_changed',()=>{
      const pos=rvInstance.getPosition();
      if(pos&&rvMinimapInst){rvMinimapInst.setCenter(pos);rvOverlay.setPosition(pos);}
    });
  }else{rvMinimapInst.setCenter(latLng);rvOverlay.setPosition(latLng);}
  // PC에서는 미니맵을 기본으로 켬 (끈 적이 있으면 그 상태를 기억) — 휴대폰은 화면이 작아 꺼진 채 시작 (v3.14.4)
  _rvMmGripInit();
  _rvMmApplySize();
  const want=window.innerWidth>600&&safeStorage.get('hy_rv_minimap','1')!=='0';
  if(want!==minimapOn)toggleMinimap(true);
  else if(minimapOn)setTimeout(()=>{rvMinimapInst.relayout();rvMinimapInst.setCenter(rvOverlay.getPosition());},50);
  const client=new kakao.maps.RoadviewClient();
  client.getNearestPanoId(latLng,50,panoId=>{if(panoId)rvInstance.setPanoId(panoId,latLng);else document.getElementById('rvHint').textContent='로드뷰 없음';});
}
function openRvFromPopup(latLng){lastIw=iwOpen;closeIw();openRvAt(latLng);}
function closeRv(){
  document.getElementById('rvPanel').style.display='none';setRvMode(false);
  const tb=document.getElementById('mapToolbar');if(tb)tb.style.top='190px';
  syncMapToolbars();
  minimapOn=false;document.getElementById('rvMinimap').style.display='none'; // 다음에 열 때 다시 기본값(PC 켬)으로
  const btn=document.getElementById('btnMinimap');if(btn){btn.style.background='';btn.style.color='';}
  if(lastIw&&kakaoMap){lastIw.setMap(kakaoMap);iwOpen=lastIw;lastIw=null;}
}
function toggleMinimap(auto){
  minimapOn=!minimapOn;
  if(!auto&&window.innerWidth>600)safeStorage.set('hy_rv_minimap',minimapOn?'1':'0'); // PC에서 직접 끄고 켠 것만 기억
  document.getElementById('rvMinimap').style.display=minimapOn?'block':'none';
  const btn=document.getElementById('btnMinimap');
  if(btn){btn.style.background=minimapOn?'var(--ac)':'';btn.style.color=minimapOn?'#fff':'';}
  if(minimapOn&&rvMinimapInst)setTimeout(()=>{rvMinimapInst.relayout();if(rvOverlay)rvMinimapInst.setCenter(rvOverlay.getPosition());},50);
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
