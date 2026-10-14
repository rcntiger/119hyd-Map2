/* 119hyd-Map2 · js/label-layout.js — 이름표 겹침 피하기 (축척에 따라 가까운 소화전의 이름표가 부딪히면 빈 자리로 옮김) */
AppFiles.reg('js/label-layout.js','v3.9.1'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* 이름표는 원래 마커 바로 아래에 붙는다 (marker.js: xAnchor .5, yAnchor 0, margin-top 13px).
   지도를 축소하면 위치가 다른 소화전끼리도 이름표가 화면에서 겹치므로,
   보이는 이름표를 위에서부터 차례로 놓으면서 아래 자리가 막혀 있으면 위 → 오른쪽 → 왼쪽 → 대각선 순으로 빈 자리를 찾는다.
   - 이름표는 숨기지 않는다 (인쇄물에서도 번호가 빠지지 않게). 빈 자리가 하나도 없으면 가장 덜 겹치는 자리에 둔다.
   - 같은 자리에 겹친 소화전(overlap.js의 묶음)은 이름표 내용이 같으므로 하나로 보고 같은 자리로 옮긴다.
   - 다른 마커를 가리는 자리도 되도록 피한다 (이름표끼리 겹치는 것보다는 덜 나쁨).
   - 옮기는 방법은 이름표 요소의 transform만 바꾸는 것이라, 지도 좌표·클릭 동작은 그대로다. */
const LBL_GAP=13;   // 마커 중심 → 이름표까지 (marker.css 마커 반지름 + 여백, marker.js의 margin-top과 같은 값)
const LBL_MK=20;    // 다른 마커를 피할 때 마커 상자 크기(px, 테두리 포함)
let _lblTimer=null;
// 여러 곳에서 연달아 불려도 한 번만 계산 (지도 움직임·필터·이름 ON/OFF·축척 변경 직후)
function scheduleLabelLayout(){
  if(_lblTimer)return;
  _lblTimer=setTimeout(()=>{_lblTimer=null;try{labelLayout();}catch(e){console.warn('이름표 배치 실패',e);}},30);
}
function _lblReset(el){if(el&&el.style.transform)el.style.transform='';}
/* ── 연결선: 자리를 옮긴 이름표가 어느 마커 것인지 보이도록, 마커 → 이름표 가장 가까운 곳까지 조 색 선을 긋는다 ──
   이름표 글자는 다른 곳(overlap.js)에서 통째로 바뀌므로 이름표 안에 넣지 않고, 마커 좌표에 붙는 별도 오버레이로 그린다.
   (지도를 끌어 옮기는 동안에도 마커·이름표와 함께 움직임) */
const _lblLeaders=new Map(); // 대표 소화전 idx → {ov, el}
function _lblLeader(i,pos,color,rx,ry){
  let L=_lblLeaders.get(i);
  if(!L){
    const el=document.createElement('div');
    el.className='hy-lbl-leader';
    el.style.cssText='position:relative;width:0;height:0;pointer-events:none';
    const ov=new kakao.maps.CustomOverlay({position:pos,content:el,xAnchor:0,yAnchor:0,zIndex:8}); // 이름표(9) 아래, 마커 위
    L={ov,el,key:''};_lblLeaders.set(i,L);
  }
  // 마커 테두리(반지름 약 9px) 바깥에서 시작해 이름표 가장자리에서 끝남
  const len=Math.hypot(rx,ry),sx=len?rx/len*9:0,sy=len?ry/len*9:0;
  const key=[pos.getLat?pos.getLat():0,pos.getLng?pos.getLng():0,color,Math.round(rx),Math.round(ry)].join();
  if(L.key!==key){
    L.key=key;
    L.ov.setPosition(pos);
    L.el.innerHTML=`<svg style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none" width="1" height="1">`
      +`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${ry.toFixed(1)}" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/>`
      +`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${ry.toFixed(1)}" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`
      +`<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="2" fill="${color}"/></svg>`;
  }
  if(!L.ov.getMap())L.ov.setMap(kakaoMap);
}
function _lblLeaderOff(i){const L=_lblLeaders.get(i);if(L&&L.ov.getMap())L.ov.setMap(null);}
function clearLabelLeaders(){_lblLeaders.forEach((L,i)=>_lblLeaderOff(i));}
function labelLayout(){
  if(!kakaoMap||typeof kakaoMap.getProjection!=='function')return;
  const mapEl=document.getElementById('map');if(!mapEl)return;
  const W=mapEl.clientWidth,H=mapEl.clientHeight;
  const proj=kakaoMap.getProjection();
  const pt=d=>{const p=proj.containerPointFromCoords(new kakao.maps.LatLng(d.lat,d.lng));return{x:p.x,y:p.y};};
  // 1) 지금 보이는 이름표를 모은다. 같은 자리 묶음은 하나로.
  const units=[],seen=new Map(),markers=[];
  Object.entries(overlays).forEach(([k,o])=>{
    const i=Number(k),d=items[i];
    if(!d||!(d.lat&&d.lng))return;
    // 일괄 위치수정 중인 것은 편집 마커 위치를 써야 하므로 실제 위치(이름표 좌표)로 계산
    const pos=o.labelOverlay?.getPosition?o.labelOverlay.getPosition():null;
    const p=pos&&pos.getLat?(()=>{const q=proj.containerPointFromCoords(pos);return{x:q.x,y:q.y};})():pt(d);
    if(o.overlay?.getMap&&o.overlay.getMap())markers.push({i,x:p.x,y:p.y});
    const lb=o.labelOverlay;if(!lb)return;
    const el=lb.getContent&&lb.getContent();if(!el)return;
    if(!lb.getMap()){_lblReset(el);return;}
    if(p.x<-150||p.y<-80||p.x>W+150||p.y>H+80){_lblReset(el);return;} // 화면 밖은 계산하지 않음
    const g=_ovl&&_ovl.of?_ovl.of[i]:null;
    const key=g&&g.vis&&g.vis.length>=2&&g.vis.includes(i)?g:null;
    if(key&&seen.has(key)){seen.get(key).els.push(el);seen.get(key).own.add(i);return;}
    const u={i,x:p.x,y:p.y,pos:pos&&pos.getLat?pos:new kakao.maps.LatLng(d.lat,d.lng),color:groupColor(d),w:el.offsetWidth,h:el.offsetHeight,els:[el],own:new Set([i])};
    if(!u.w||!u.h){_lblReset(el);return;}
    if(key)seen.set(key,u);
    units.push(u);
  });
  // 2) 화면 위쪽(같으면 왼쪽)부터 차례로 놓는다 — 열려 있는(선택된) 소화전은 맨 먼저 원래 자리에
  const act=typeof activeIdx!=='undefined'?activeIdx:-1;
  units.sort((a,b)=>(b.own.has(act)-a.own.has(act))||(a.y-b.y)||(a.x-b.x));
  const placed=[],used=new Set();
  const hit=(r,s)=>r.l<s.r&&r.r>s.l&&r.t<s.b&&r.b>s.t;
  const area=(r,s)=>Math.max(0,Math.min(r.r,s.r)-Math.max(r.l,s.l))*Math.max(0,Math.min(r.b,s.b)-Math.max(r.t,s.t));
  units.forEach(u=>{
    const {x,y,w,h}=u;
    // 후보 자리: [왼쪽 위 x, 왼쪽 위 y] — 원래 자리(아래)가 맨 앞
    const cand=[
      [x-w/2, y+LBL_GAP],        // 아래 (원래 자리)
      [x-w/2, y-LBL_GAP-h],      // 위
      [x+LBL_GAP-1, y-h/2],      // 오른쪽
      [x-LBL_GAP+1-w, y-h/2],    // 왼쪽
      [x+4, y+LBL_GAP-2],        // 오른쪽 아래
      [x-w-4, y+LBL_GAP-2],      // 왼쪽 아래
      [x+4, y-LBL_GAP-h+2],      // 오른쪽 위
      [x-w-4, y-LBL_GAP-h+2],    // 왼쪽 위
      // 그래도 막혀 있으면 한 칸 더 바깥 (아래·위는 이름표 한 줄만큼, 옆은 조금 더)
      [x-w/2, y+LBL_GAP+h+2],
      [x-w/2, y-LBL_GAP-2*h-2],
      [x+LBL_GAP+8, y-h/2],
      [x-LBL_GAP-8-w, y-h/2],
    ];
    let best=null;
    for(const [l,t] of cand){
      const r={l,t,r:l+w,b:t+h};
      let lab=0,mk=0;
      for(const s of placed)lab+=area(r,s);
      for(const m of markers){
        if(u.own.has(m.i))continue;
        const s={l:m.x-LBL_MK/2,t:m.y-LBL_MK/2,r:m.x+LBL_MK/2,b:m.y+LBL_MK/2};
        if(hit(r,s))mk+=area(r,s);
      }
      const score=lab*10+mk;
      if(!best||score<best.score)best={r,score,l,t};
      if(score===0)break;
    }
    placed.push(best.r);
    const dx=Math.round(best.l-(x-w/2)),dy=Math.round(best.t-(y+LBL_GAP));
    const tf=dx||dy?`translate(${dx}px,${dy}px)`:'';
    u.els.forEach(el=>{if(el.style.transform!==tf)el.style.transform=tf;});
    // 원래 자리(마커 바로 아래)가 아니면 연결선 — 마커 중심 기준 이름표의 가장 가까운 점까지
    if(tf){
      const l=best.l-x,t=best.t-y;
      const rx=Math.max(l,Math.min(0,l+w)),ry=Math.max(t,Math.min(0,t+h));
      if(Math.hypot(rx,ry)>10){_lblLeader(u.i,u.pos,u.color,rx,ry);used.add(u.i);}
    }
  });
  _lblLeaders.forEach((L,i)=>{if(!used.has(i))_lblLeaderOff(i);});
}
