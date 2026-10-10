/* 119hyd-Map2 · js/print-area.js — 인쇄 영역 지정 (지도에서 드래그, PC 전용) */
AppFiles.reg('js/print-area.js','v3.5.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 인쇄 영역 지정 ══════════
   인쇄 창에서 "지도에서 영역 지정"을 고르면 → 지도 위에서 드래그로 사각형을 그리고
   → [이 영역 인쇄]를 누를 때 화면에 보이던 축척 그대로 그 영역만 인쇄한다.
   (한 장을 넘으면 같은 축척으로 여러 장 — 나누는 일은 print-map.js의 _pmMakeAreaTiles가 한다)
   그리기: 투명 층(#areaLayer)이 마우스를 받아 사각형을 그림.  이동: 층을 치우고 지도를 평소처럼 움직임. */
let _area=null; // {opt:{fmt,scope,undoneOnly,showLabels}, mode:'draw'|'move', box:{minLat,maxLat,minLng,maxLng}|null, rect, handles:[], zoomL}

function _areaAllowed(){return !(window.innerWidth<=768||matchMedia('(pointer:coarse)').matches);}

// 영역 모양으로 용지 방향 결정 (남북으로 길면 세로)
function _areaOrient(a){
  const h=a.maxLat-a.minLat, w=(a.maxLng-a.minLng)*Math.cos((a.maxLat+a.minLat)/2*Math.PI/180);
  return h>w?'portrait':'landscape';
}
// 영역을 한 장 크기(tLat×tLng)의 칸으로 나눈 격자: 이웃 칸과 8% 겹침, 영역 중앙 기준으로 배치 (북→남, 서→동)
function _areaGrid(a,tLat,tLng){
  const stepLat=tLat*0.92, stepLng=tLng*0.92;
  const cnt=(span,t,st)=>span<=t?1:Math.ceil((span-t)/st-1e-9)+1;
  const ny=cnt(a.maxLat-a.minLat,tLat,stepLat), nx=cnt(a.maxLng-a.minLng,tLng,stepLng);
  const cLat=(a.minLat+a.maxLat)/2, cLng=(a.minLng+a.maxLng)/2;
  const centers=[];
  for(let r=0;r<ny;r++)for(let c=0;c<nx;c++)centers.push({lat:cLat+((ny-1)/2-r)*stepLat,lng:cLng+(c-(nx-1)/2)*stepLng});
  return {ny,nx,centers};
}
function _areaInside(d,b){return d.lat&&d.lng&&d.lat>=b.minLat&&d.lat<=b.maxLat&&d.lng>=b.minLng&&d.lng<=b.maxLng;}
// 영역 안 + 고른 범위(조/팀/전체) + (선택 시) 미완료만
function _areaList(){
  if(!_area?.box)return [];
  let list=items.filter(d=>_inPrintScope(d,_area.opt.scope)&&_areaInside(d,_area.box));
  if(_area.opt.undoneOnly)list=list.filter(d=>!doneMap[d.id]);
  return list;
}
// 마우스 위치(화면 좌표) → 지도 좌표
function _areaLatLng(e){
  const r=document.getElementById('map').getBoundingClientRect();
  return kakaoMap.getProjection().coordsFromContainerPoint(new kakao.maps.Point(e.clientX-r.left,e.clientY-r.top));
}
// 지금 화면 축척에서 이 영역이 용지 몇 장인지 어림 (실제 장 수는 인쇄 미리보기에서 확정)
function _areaEstimate(){
  const b=_area.box, p=_paper();
  const setting=document.getElementById('printOrient')?.value||'auto';
  const orient=setting==='auto'?_areaOrient(b):setting;
  const W=orient==='portrait'?p.h:p.w, H=orient==='portrait'?p.w:p.h;
  const pxW=(W-PRINT_MARGIN*2-1)*96/25.4, pxH=(H-PRINT_MARGIN*2-2)*96/25.4-52; // 52px = 인쇄 제목 줄
  const bd=kakaoMap.getBounds(), el=document.getElementById('map');
  const degLat=(bd.getNorthEast().getLat()-bd.getSouthWest().getLat())/el.clientHeight;
  const degLng=(bd.getNorthEast().getLng()-bd.getSouthWest().getLng())/el.clientWidth;
  const g=_areaGrid(b,degLat*pxH,degLng*pxW);
  return {n:g.ny*g.nx,orient,key:p.key};
}
function _areaInfo(){
  if(!_area)return;
  const info=document.getElementById('areaBarInfo'),go=document.getElementById('areaGoBtn'),mb=document.getElementById('areaModeBtn');
  mb.textContent=_area.mode==='draw'?'✋ 지도 이동':(_area.box?'✏️ 다시 그리기':'✏️ 영역 그리기');
  go.disabled=!_area.box;go.style.opacity=_area.box?1:.4;
  const scaleTxt=`축척 막대 ${_levelScaleText(kakaoMap.getLevel())}`;
  if(!_area.box){
    info.textContent=_area.mode==='draw'?`지도에서 드래그해 인쇄할 영역을 그리세요 (휠: 확대/축소) · ${scaleTxt}`:`지도를 옮긴 뒤 [✏️ 영역 그리기]를 누르세요 · ${scaleTxt}`;
    return;
  }
  const b=_area.box;
  const hM=Math.round((b.maxLat-b.minLat)*111000), wM=Math.round((b.maxLng-b.minLng)*111000*Math.cos((b.maxLat+b.minLat)/2*Math.PI/180));
  const n=_areaList().length;
  if(_area.opt.fmt==='map'){
    const e=_areaEstimate();
    info.textContent=`약 ${wM}×${hM}m · 소화전 ${n}개 · ${scaleTxt} 그대로 ${e.key} ${e.orient==='portrait'?'세로':'가로'} 약 ${e.n}장`+(e.n>1&&n?' (소화전 없는 칸은 빠짐)':'');
  }else{
    info.textContent=`약 ${wM}×${hM}m · 소화전 ${n}개 · 목록표로 인쇄`;
  }
}
function _areaClearShapes(){
  if(!_area)return;
  if(_area.rect){_area.rect.setMap(null);_area.rect=null;}
  _area.handles.forEach(h=>h.setMap(null));_area.handles=[];
}
// 사각형 + 모서리 손잡이 4개를 지도에 그림 (dragging=true면 끄는 중이라 손잡이는 생략)
function _areaDraw(dragging){
  const b=_area.box;if(!b)return;
  const bounds=new kakao.maps.LatLngBounds(new kakao.maps.LatLng(b.minLat,b.minLng),new kakao.maps.LatLng(b.maxLat,b.maxLng));
  if(_area.rect)_area.rect.setBounds(bounds);
  else{
    _area.rect=new kakao.maps.Rectangle({bounds,strokeWeight:3,strokeColor:'#2563eb',strokeOpacity:.95,strokeStyle:'dash',fillColor:'#2563eb',fillOpacity:.08});
    _area.rect.setMap(kakaoMap);
  }
  _area.handles.forEach(h=>h.setMap(null));_area.handles=[];
  if(dragging)return;
  // 각 모서리 손잡이: 끌면 맞은편 모서리를 고정한 채 크기를 바꿈
  [['maxLat','minLng','nwse'],['maxLat','maxLng','nesw'],['minLat','minLng','nesw'],['minLat','maxLng','nwse']].forEach(([la,ln,cur])=>{
    const el=document.createElement('div');
    el.style.cssText=`width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #2563eb;box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:${cur}-resize`;
    el.title='끌어서 영역 크기 조절';
    el.addEventListener('mousedown',e=>{
      if(e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      if(kakao.maps.event.preventMap)kakao.maps.event.preventMap();
      const fixed={lat:la==='maxLat'?b.minLat:b.maxLat,lng:ln==='maxLng'?b.minLng:b.maxLng}; // 맞은편 모서리
      _areaBeginDrag(fixed);
    });
    const ov=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(b[la],b[ln]),content:el,xAnchor:.5,yAnchor:.5,zIndex:80,clickable:true});
    ov.setMap(kakaoMap);_area.handles.push(ov);
  });
}
// 끌기 시작: fixed(고정 모서리)와 마우스 위치로 사각형을 계속 갱신, 놓으면 확정
function _areaBeginDrag(fixed){
  if(!_area)return;
  kakaoMap.setDraggable(false);
  const prev=_area.box;
  const move=e=>{
    const p=_areaLatLng(e);
    _area.box={minLat:Math.min(fixed.lat,p.getLat()),maxLat:Math.max(fixed.lat,p.getLat()),minLng:Math.min(fixed.lng,p.getLng()),maxLng:Math.max(fixed.lng,p.getLng())};
    _areaDraw(true);
  };
  const up=e=>{
    window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);
    kakaoMap.setDraggable(true);
    if(!_area)return;
    move(e);
    // 너무 작게(화면에서 12px 미만) 그렸으면 실수로 보고 이전 상태로
    const pr=kakaoMap.getProjection();
    const a=pr.containerPointFromCoords(new kakao.maps.LatLng(_area.box.maxLat,_area.box.minLng)),c=pr.containerPointFromCoords(new kakao.maps.LatLng(_area.box.minLat,_area.box.maxLng));
    if(Math.abs(c.x-a.x)<12||Math.abs(c.y-a.y)<12){
      _area.box=prev;
      if(prev)_areaDraw(false);else _areaClearShapes();
      showToast('영역이 너무 작습니다. 다시 드래그하세요','err');
    }else{
      _areaDraw(false);
      _areaSetMode('move'); // 그린 뒤에는 지도를 움직여 확인할 수 있게
    }
    _areaInfo();
  };
  window.addEventListener('mousemove',move);window.addEventListener('mouseup',up);
}
function _areaSetMode(mode){
  if(!_area)return;
  _area.mode=mode;
  document.getElementById('areaLayer').style.display=mode==='draw'?'block':'none';
  _areaInfo();
}
function _areaLayerDown(e){
  if(!_area||e.button!==0)return;
  e.preventDefault();
  _areaClearShapes();_area.box=null;
  const p=_areaLatLng(e);
  _areaBeginDrag({lat:p.getLat(),lng:p.getLng()});
}
function _areaLayerWheel(e){
  if(!_area)return;
  e.preventDefault();
  kakaoMap.setLevel(Math.max(1,kakaoMap.getLevel()+(e.deltaY>0?1:-1)),{anchor:_areaLatLng(e)});
}
function _areaKey(e){if(e.key==='Escape'&&_area){e.stopImmediatePropagation();areaCancel();}}

// 인쇄 창에서 [인쇄]를 눌렀을 때 시작
function areaStart(opt){
  if(!kakaoMap){showToast('지도가 준비되지 않았습니다','err');return;}
  if(!_areaAllowed()){showToast('영역 지정 인쇄는 PC 화면에서만 사용할 수 있습니다','err');return;}
  if(_bf){showToast('일괄 위치수정을 먼저 종료하세요','err');return;}
  if(_area)areaCancel();
  closeIw();
  if(fixLocationIdx>=0){fixLocationIdx=-1;kakaoMap.setCursor('');syncPlaceBar();}
  _area={opt,mode:'draw',box:null,rect:null,handles:[],zoomL:()=>_areaInfo()};
  const layer=document.getElementById('areaLayer');
  layer.onmousedown=_areaLayerDown;
  layer.onwheel=_areaLayerWheel;
  kakao.maps.event.addListener(kakaoMap,'zoom_changed',_area.zoomL);
  window.addEventListener('keydown',_areaKey,true);
  document.getElementById('areaBar').style.display='flex';
  _areaSetMode('draw');
}
function areaToggleMode(){
  if(!_area)return;
  _areaSetMode(_area.mode==='draw'?'move':'draw');
}
function areaConfirm(){
  if(!_area||!_area.box)return;
  const opt=_area.opt, box=_area.box, list=_areaList();
  const label=`지정 영역 (${_scopeLabel(opt.scope)})`;
  if(opt.fmt!=='map'&&!list.length){showToast('영역 안에 인쇄할 소화전이 없습니다','err');return;}
  areaCancel(); // 조작 바·사각형 정리 (지도 위치와 축척은 그대로 둠 → 그 축척으로 인쇄)
  if(opt.fmt==='map')_printMap(opt.scope,list,opt.showLabels,false,{area:box,label});
  else _printList(opt.scope,list,{label});
}
function areaCancel(){
  if(!_area)return;
  _areaClearShapes();
  kakao.maps.event.removeListener(kakaoMap,'zoom_changed',_area.zoomL);
  window.removeEventListener('keydown',_areaKey,true);
  kakaoMap.setDraggable(true);
  document.getElementById('areaLayer').style.display='none';
  document.getElementById('areaBar').style.display='none';
  _area=null;
}
