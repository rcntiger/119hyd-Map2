/* 119hyd-Map2 · js/cluster.js — 가벼운 묶음 표시(클러스터) : 카카오 MarkerClusterer 대체 */
AppFiles.reg('js/cluster.js','v3.12.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* 왜 바꿨나
   카카오 MarkerClusterer는 소화전 870개 기준으로 축척 6 이상에서 다시 묶을 때마다 약 3초 동안 화면이 멈췄다
   (마커 하나당 약 3ms — averageCenter를 꺼도 2.6초). 축소·이동할 때마다 반복되어 "지도 멈춤"의 주원인.
   여기서는 지도 픽셀 좌표를 격자(gridSize px)로 나눠 한 번에 묶는다 → 870개 기준 수 ms.

   기존 코드가 쓰던 함수 이름을 그대로 제공한다:
     addMarker / addMarkers(arr, noRedraw) / removeMarkers(arr) / clear / redraw / setMinLevel / getMarkers / setMap
   묶음에 넣는 "점"은 화면에 그리지 않는 가벼운 객체(LiteClPoint)라서, 예전처럼 투명 마커 870개를 지도에 올리지 않는다. */

// 묶음 계산용 점 (카카오 Marker 대신: getPosition/setPosition만 있으면 됨)
function LiteClPoint(pos){this._p=pos;}
LiteClPoint.prototype.getPosition=function(){return this._p;};
LiteClPoint.prototype.setPosition=function(p){this._p=p;};

function LiteClusterer(opt){
  this._map=opt.map||null;
  this._minLevel=opt.minLevel||6;
  this._grid=opt.gridSize||60;
  this._style=opt.style||'';
  this._pts=new Set();
  this._pool=[];      // 재사용하는 묶음 동그라미 {ov, el, members}
  this._used=0;
  this._idleL=null;
  if(this._map)this._listen();
}
LiteClusterer.prototype._listen=function(){
  if(this._idleL||!this._map)return;
  this._idleL=()=>this.redraw();
  kakao.maps.event.addListener(this._map,'idle',this._idleL); // 이동·축척 변경이 끝난 뒤 한 번
};
LiteClusterer.prototype.setMap=function(m){
  if(this._idleL&&this._map)kakao.maps.event.removeListener(this._map,'idle',this._idleL);
  this._idleL=null;this._map=m||null;
  if(m){this._listen();this.redraw();}else this._hideFrom(0);
};
LiteClusterer.prototype.addMarker=function(p,noRedraw){this._pts.add(p);if(!noRedraw)this.redraw();};
LiteClusterer.prototype.addMarkers=function(arr,noRedraw){(arr||[]).forEach(p=>this._pts.add(p));if(!noRedraw)this.redraw();};
LiteClusterer.prototype.removeMarkers=function(arr,noRedraw){(arr||[]).forEach(p=>this._pts.delete(p));if(!noRedraw)this.redraw();};
LiteClusterer.prototype.getMarkers=function(){return Array.from(this._pts);};
LiteClusterer.prototype.clear=function(){this._pts.clear();this._hideFrom(0);};
LiteClusterer.prototype.setMinLevel=function(l){this._minLevel=l;};
LiteClusterer.prototype._hideFrom=function(n){
  for(let k=n;k<this._pool.length;k++){const c=this._pool[k];if(c.ov.getMap())c.ov.setMap(null);c.members=null;}
  this._used=Math.min(this._used,n);
};
LiteClusterer.prototype._bubble=function(k){
  let c=this._pool[k];
  if(!c){
    const el=document.createElement('div');
    el.className='lite-cl';
    el.style.cssText=this._style;
    c={el,ov:null,members:null};
    c.ov=new kakao.maps.CustomOverlay({content:el,xAnchor:.5,yAnchor:.5,zIndex:5,position:this._map.getCenter()});
    el.addEventListener('click',e=>{e.stopPropagation();this._zoomTo(c.members);});
    el.addEventListener('touchend',e=>{e.stopPropagation();e.preventDefault();this._zoomTo(c.members);},{passive:false});
    this._pool[k]=c;
  }
  return c;
};
// 묶음을 누르면 그 묶음이 다 보이게 확대 (카카오 클러스터러의 클릭 확대와 같은 동작)
LiteClusterer.prototype._zoomTo=function(members){
  if(!members||!members.length||!this._map)return;
  const b=new kakao.maps.LatLngBounds();
  members.forEach(p=>b.extend(p.getPosition()));
  const sw=b.getSouthWest(),ne=b.getNorthEast();
  if(Math.abs(sw.getLat()-ne.getLat())<1e-7&&Math.abs(sw.getLng()-ne.getLng())<1e-7){
    this._map.setLevel(this._minLevel-1,{anchor:sw});
  }else this._map.setBounds(b);
};
LiteClusterer.prototype.redraw=function(){
  const map=this._map;if(!map)return;
  const lv=map.getLevel();
  if(lv<this._minLevel){this._hideFrom(0);return;}
  const proj=map.getProjection();
  const G=this._grid;
  // 1) 격자 칸마다 모으기 (지도 픽셀 좌표 — 지도를 옮겨도 칸이 바뀌지 않아 묶음이 흔들리지 않음)
  const cells=new Map();
  this._pts.forEach(p=>{
    const pos=p.getPosition();if(!pos)return;
    const q=proj.pointFromCoords(pos);
    const key=Math.floor(q.x/G)+','+Math.floor(q.y/G);
    let c=cells.get(key);
    if(!c){c={n:0,lat:0,lng:0,m:[]};cells.set(key,c);}
    c.n++;c.lat+=pos.getLat();c.lng+=pos.getLng();c.m.push(p);
  });
  // 2) 화면(+여백) 안에 있는 묶음만 그린다
  const bd=map.getBounds(),sw=bd.getSouthWest(),ne=bd.getNorthEast();
  const padLat=(ne.getLat()-sw.getLat())*.15,padLng=(ne.getLng()-sw.getLng())*.15;
  let k=0;
  cells.forEach(c=>{
    const lat=c.lat/c.n,lng=c.lng/c.n; // 묶음 위치 = 평균 (averageCenter)
    if(lat<sw.getLat()-padLat||lat>ne.getLat()+padLat||lng<sw.getLng()-padLng||lng>ne.getLng()+padLng)return;
    const b=this._bubble(k++);
    b.members=c.m;
    const t=String(c.n);
    if(b.el.textContent!==t)b.el.textContent=t;
    b.ov.setPosition(new kakao.maps.LatLng(lat,lng));
    if(!b.ov.getMap())b.ov.setMap(map);
  });
  this._used=k;
  this._hideFrom(k);
};
