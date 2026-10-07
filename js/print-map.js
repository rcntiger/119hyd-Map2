/* 119hyd-Map2 · js/print-map.js — 지도 인쇄 · 여러 장 나누기 · 미리보기 조작 */
AppFiles.reg('js/print-map.js','v3.0.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ── 지도 인쇄 ──
// 페이지(전체 범위 1장 또는 조별 여러 장)마다: 해당 소화전만 남기고 → 담당구역 중앙에 맞춰 확대 → 인쇄
// → 인쇄창이 닫히면(afterprint) 다음 조로 넘어가고, 끝나면 원래 화면으로 복구한다.
function _robustPts(pts){
  // 좌표 이상치(엉뚱하게 먼 지점) 때문에 중심이 틀어지지 않도록 중앙값에서 약 5km 이상 떨어진 점은 제외
  if(pts.length<4)return pts;
  const med=a=>{const x=a.slice().sort((p,q)=>p-q);return x[Math.floor(x.length/2)];};
  const mLat=med(pts.map(d=>d.lat)),mLng=med(pts.map(d=>d.lng));
  const ok=pts.filter(d=>Math.abs(d.lat-mLat)<0.045&&Math.abs(d.lng-mLng)<0.055);
  return ok.length?ok:pts;
}
function _centerMapOn(pts){
  const core=_robustPts(pts);
  let minLat=90,maxLat=-90,minLng=180,maxLng=-180;
  core.forEach(d=>{minLat=Math.min(minLat,d.lat);maxLat=Math.max(maxLat,d.lat);minLng=Math.min(minLng,d.lng);maxLng=Math.max(maxLng,d.lng);});
  const b=new kakao.maps.LatLngBounds(new kakao.maps.LatLng(minLat,minLng),new kakao.maps.LatLng(maxLat,maxLng));
  kakaoMap.setBounds(b,50,50,50,50);
  // setBounds가 고른 확대 수준은 유지하고, 중심을 담당구역의 정중앙으로 확정
  kakaoMap.setCenter(new kakao.maps.LatLng((minLat+maxLat)/2,(minLng+maxLng)/2));
}
let _pm=null; // 진행 중인 지도 인쇄 세션 {pages,k,restore}
function _printMap(scope,list,showLabels,perJo,opt){
  if(!kakaoMap){showToast('지도가 준비되지 않았습니다','err');return;}
  const scaleMode=_printScaleMode();
  const userLevel=kakaoMap.getLevel(); // 인쇄 버튼 누르기 전 화면에서 보던 확대 단계
  const pts=list.filter(d=>d.lat&&d.lng);
  if(!pts.length){showToast('좌표가 있는 소화전이 없습니다','err');return;}
  const byG={};
  pts.forEach(d=>{const g=String(d.group_name||'').trim()||'(미지정)';(byG[g]=byG[g]||[]).push(d);});
  const gNames=Object.keys(byG).sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
  const pages=opt?.anchor
    ?[{label:opt.label,pts,anchor:{lat:opt.anchor.lat,lng:opt.anchor.lng,r:opt.r,id:opt.anchor.id,no:_shortNo(opt.anchor.name)}}]
    :(perJo&&gNames.length>1)
    ?gNames.map(g=>({label:g,pts:byG[g]}))
    :[{label:_scopeLabel(scope),pts}];

  const prev={active:pickedFilterActive,ids:new Set(pickedIds),labels:labelsOn,
              center:kakaoMap.getCenter(),level:kakaoMap.getLevel()};
  closeIw();
  if(showLabels!==labelsOn)toggleLabelVisibility();
  // 라벨을 인쇄용 짧은 번호로 잠시 바꿈 (종료 시 원래 이름으로 복구)
  const labelBackup=[];
  Object.entries(overlays).forEach(([i,o])=>{
    const el=o.labelOverlay?.getContent&&o.labelOverlay.getContent();
    if(el&&items[i]){labelBackup.push([el,el.textContent]);el.textContent=_shortNo(items[i].name);}
  });
  const orientSetting=document.getElementById('printOrient')?.value||'auto';
  document.documentElement.classList.add('printing-map');
  window.scrollTo(0,0);
  const restore=()=>{
    document.documentElement.classList.remove('printing-map');
    syncMapToolbars();
    if(clusterer&&clusterer.setMinLevel){clusterer.setMinLevel(6);clusterer.redraw();}
    setZoomRuleOff(false);
    labelBackup.forEach(([el,t])=>{el.textContent=t;});
    pickedIds=prev.ids;pickedFilterActive=prev.active;
    if(labelsOn!==prev.labels)toggleLabelVisibility();
    applyFilter();
    setTimeout(()=>{kakaoMap.relayout();kakaoMap.setCenter(prev.center);kakaoMap.setLevel(prev.level);},50);
  };
  pages.forEach(pg=>{pg.orient=orientSetting==='auto'?(pg.anchor?'landscape':_autoOrient(pg.pts)):orientSetting;});
  if(clusterer&&clusterer.setMinLevel){clusterer.setMinLevel(20);clusterer.redraw();}
  setZoomRuleOff(true);
  let finalPages=pages;
  if(scaleMode==='current'){
    // 화면 축척 그대로: 각 페이지(조)를 그 축척에서 용지 한 장 크기로 나눔
    finalPages=[];let total=0;
    for(const pg of pages){
      const tiles=_pmMakeTiles(pg,userLevel);
      if(!tiles){showToast(`${pg.label}: 이 축척으로는 범위가 너무 넓습니다. 조금 축소한 뒤 다시 시도하세요`,'err');restore();return;}
      if(tiles.length===1){
        // 한 장에 들어가면: 그 축척 그대로, 담당구역(또는 기준 원) 중앙에 배치
        const t=tiles[0];
        const ctr=pg.anchor?{lat:pg.anchor.lat,lng:pg.anchor.lng}:{lat:t.lat,lng:t.lng};
        pg.fixed={lat:ctr.lat,lng:ctr.lng,level:userLevel};
        finalPages.push(pg);total++;
      }else{
        pg.split={n:0,tiles,scaleFixed:true};
        finalPages.push(pg,..._pmTilePages(pg,tiles,userLevel));total+=tiles.length+1;
      }
    }
    if(total>30&&!confirm(`현재 축척으로 ${total}장이 필요합니다. 계속할까요?\n(지도를 한 단계 축소하거나 B4/A3 용지를 쓰면 장 수가 줄어듭니다)`)){restore();return;}
    showToast(`현재 화면 축척(막대 ${_levelScaleText(userLevel)})으로 ${total}장 준비됨`,'ok');
  }
  _pm={pages:finalPages,k:0,restore};
  _pmShow(0);
}
function _pmShow(k){
  if(!_pm)return;
  _pm.k=k;
  const pg=_pm.pages[k],n=_pm.pages.length;
  pickedIds=new Set(pg.pts.map(d=>d.id));pickedFilterActive=true;
  applyFilter();
  const gs=[...new Set(pg.pts.map(d=>String(d.group_name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
  document.getElementById('printMapTitle').innerHTML=`🧯 ${esc(currentProject?.name||'')} — ${esc(pg.label)} <span style="font-weight:400;font-size:11px;color:#555">(${(pg.tilePts||pg.pts).length}개 · 출력일 ${new Date().toLocaleDateString('ko-KR')}${n>1?` · ${k+1}/${n}`:''}${pg.fixed?' · 겹치는 가장자리 약 8%':''})</span><br>`
    +gs.map(g=>`<span class="lg"><i style="background:${groupColor({group_name:g})}"></i>${esc(g)}</span>`).join('');
  _applyMapPaper(pg.orient);
  const ot=pg.orient==='portrait'?'세로':'가로';
  document.getElementById('printBarInfo').textContent=(n>1?`${k+1}/${n} · ${pg.label}`:pg.label)+` · ${_paper().key} ${ot}`;
  document.getElementById('pmPrevBtn').style.display=n>1?'':'none';
  document.getElementById('pmNextBtn').style.display=n>1?'':'none';
  document.getElementById('pmPrevBtn').disabled=k===0;
  document.getElementById('pmNextBtn').disabled=k===n-1;
  document.getElementById('pmUnsplitBtn').style.display=(pg.split||pg.parentRef)?'':'none';
  // 레이아웃이 종이 크기로 바뀐 뒤 지도 크기를 다시 계산하고 담당구역 정중앙에 맞춘다 (두 번 확인)
  setTimeout(pmRecenter,120);
  setTimeout(pmRecenter,600);
}
function pmRecenter(){
  if(!_pm)return;
  kakaoMap.relayout();
  const pg=_pm.pages[_pm.k];
  if(pg.fixed){
    kakaoMap.setLevel(pg.fixed.level);
    kakaoMap.setCenter(new kakao.maps.LatLng(pg.fixed.lat,pg.fixed.lng));
  }else _pmFit(pg);
  _pmDrawTiles(pg);
}

/* ── 넓은 구역을 여러 장으로 나누기 ──
   개요 장(전체 구역 + 빨간 번호 사각형) 1장 + 확대된 분할 장 N장으로 바꾼다.
   소화전이 하나도 없는 칸은 건너뛰고, 이웃 장과 가장자리를 약 8% 겹쳐 이어 붙이기 쉽게 한다. */
// 한 장 맞춤: 기준 소화전 페이지는 반경 원이 꽉 차게(원 중심 = 지도 중심), 그 외는 담당구역 중앙
function _pmFit(pg){
  if(!pg.anchor){_centerMapOn(pg.pts);return;}
  const a=pg.anchor,dLat=a.r/111000,dLng=a.r/(111000*Math.cos(a.lat*Math.PI/180));
  kakaoMap.setBounds(new kakao.maps.LatLngBounds(new kakao.maps.LatLng(a.lat-dLat,a.lng-dLng),new kakao.maps.LatLng(a.lat+dLat,a.lng+dLng)),20,20,20,20);
  kakaoMap.setCenter(new kakao.maps.LatLng(a.lat,a.lng));
}
let _pmTileOverlays=[];
function _pmClearTiles(){_pmTileOverlays.forEach(o=>o.setMap(null));_pmTileOverlays=[];}
function _pmDrawTiles(pg){
  _pmClearTiles();
  // 기준 소화전: 반경 원 + 붉은 표시 (분할된 장에서도 기준 위치가 보이도록 원본 기준 정보 사용)
  const A=pg.anchor||pg.parentRef?.anchor;
  if(A){
    const c=new kakao.maps.Circle({center:new kakao.maps.LatLng(A.lat,A.lng),radius:A.r,strokeWeight:2,strokeColor:'#dc2626',strokeOpacity:.8,strokeStyle:'dash',fillColor:'#dc2626',fillOpacity:.04});
    c.setMap(kakaoMap);_pmTileOverlays.push(c);
    const m=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(A.lat,A.lng),zIndex:70,yAnchor:.5,xAnchor:.5,
      content:`<div style="position:relative;width:44px;height:44px;border:4px solid #dc2626;border-radius:50%;box-sizing:border-box;pointer-events:none"><div style="position:absolute;top:-24px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#dc2626;color:#fff;font-weight:800;font-size:12px;padding:1px 7px;border-radius:9px">기준 ${esc(A.no)}</div></div>`});
    m.setMap(kakaoMap);_pmTileOverlays.push(m);
  }
  if(!pg.split)return;
  pg.split.tiles.forEach((t,i)=>{
    const rect=new kakao.maps.Rectangle({
      bounds:new kakao.maps.LatLngBounds(new kakao.maps.LatLng(t.lat-t.hLat,t.lng-t.hLng),new kakao.maps.LatLng(t.lat+t.hLat,t.lng+t.hLng)),
      strokeWeight:3,strokeColor:'#dc2626',strokeOpacity:.9,fillOpacity:0
    });
    rect.setMap(kakaoMap);_pmTileOverlays.push(rect);
    const lb=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(t.lat+t.hLat,t.lng-t.hLng),xAnchor:0,yAnchor:0,zIndex:60,
      content:`<div style="margin:3px;min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:#dc2626;color:#fff;font-weight:800;font-size:13px;line-height:22px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.4)">${i+1}</div>`});
    lb.setMap(kakaoMap);_pmTileOverlays.push(lb);
  });
}
// 지금 지도(확대 단계 L0)에서 점들의 화면 좌표(px)를 구해, 몇 단계 더 확대해야 마커(+번호 라벨)가 서로 겹치지 않는지 계산
// 같은 건물 등 8m 이내로 붙어 있는 쌍은 어떤 확대에서도 겹치므로 판단에서 제외한다.
function _overlapFreeZoom(pts,L0){
  // 기준: ① 마커 아이콘끼리는 전혀 겹치지 않음  ② 번호 라벨(켜져 있을 때)은 전체의 10% 이하만 살짝 겹쳐도 허용
  //  (라벨까지 완전히 떼려면 장 수가 2배 가까이 늘어나서, 현장에서 쓰기 좋은 수준으로 절충)
  const proj=kakaoMap.getProjection();
  const P=pts.map(d=>{const q=proj.pointFromCoords(new kakao.maps.LatLng(d.lat,d.lng));return {x:q.x,y:q.y,lat:d.lat,lng:d.lng};});
  const cosL=Math.cos(37.46*Math.PI/180);
  const count=(f,W,H)=>{
    let c=0;
    for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){
      const a=P[i],b=P[j];
      if(Math.abs(a.x-b.x)*f>=W||Math.abs(a.y-b.y)*f>=H)continue;
      if(Math.hypot((a.lat-b.lat)*111000,(a.lng-b.lng)*111000*cosL)<8)continue; // 같은 자리(8m 이내)는 제외
      c++;
    }
    return c;
  };
  const labelTol=Math.max(2,Math.floor(pts.length*0.1));
  let n=0;
  for(;n<=6&&L0-n>=1;n++){
    const f=Math.pow(2,n);
    if(count(f,28,28)===0&&(!labelsOn||count(f,60,44)<=labelTol))break;
  }
  n=Math.min(n,6,L0-1);
  const f=Math.pow(2,n);
  return {n,left:count(f,28,28)};
}
// base 페이지의 소화전 전체를 'level' 확대 단계에서 용지 한 장씩 덮도록 격자로 나눈다.
// 소화전이 없는 칸은 건너뛰고, 모든 소화전이 최소 한 장에 포함되도록 보장. 너무 많으면 null.
function _pmMakeTiles(base,level){
  _applyMapPaper(base.orient);
  kakaoMap.relayout();
  kakaoMap.setLevel(level);
  const bd=kakaoMap.getBounds(),sw=bd.getSouthWest(),ne=bd.getNorthEast();
  const tLat=ne.getLat()-sw.getLat(), tLng=ne.getLng()-sw.getLng();
  const stepLat=tLat*0.92, stepLng=tLng*0.92; // 이웃 장과 8% 겹침
  const hLat=tLat/2*0.97, hLng=tLng/2*0.97;
  const lats=base.pts.map(d=>d.lat),lngs=base.pts.map(d=>d.lng);
  const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
  const cnt=(span,t,st)=>span<=t*0.9?1:Math.ceil((span-t*0.9)/st)+1;
  const ny=cnt(maxLat-minLat,tLat,stepLat), nx=cnt(maxLng-minLng,tLng,stepLng);
  if(ny*nx>400)return null;
  const cLat=(minLat+maxLat)/2, cLng=(minLng+maxLng)/2;
  const tiles=[];
  for(let r=0;r<ny;r++)for(let c=0;c<nx;c++){       // 북→남, 서→동
    const lat=cLat+((ny-1)/2-r)*stepLat, lng=cLng+(c-(nx-1)/2)*stepLng;
    const inside=base.pts.filter(d=>Math.abs(d.lat-lat)<=hLat&&Math.abs(d.lng-lng)<=hLng);
    if(inside.length)tiles.push({lat,lng,hLat,hLng,inside});
  }
  const covered=new Set();tiles.forEach(t=>t.inside.forEach(d=>covered.add(d.id)));
  base.pts.filter(d=>!covered.has(d.id)).forEach(d=>tiles.push({lat:d.lat,lng:d.lng,hLat,hLng,inside:base.pts.filter(x=>Math.abs(x.lat-d.lat)<=hLat&&Math.abs(x.lng-d.lng)<=hLng)}));
  return tiles;
}
function _pmTilePages(base,tiles,level){
  return tiles.map((t,i)=>({
    label:`${base.label} — ${i+1}번 구역 (${i+1}/${tiles.length})`,
    pts:base.pts, tilePts:t.inside, orient:base.orient, parentRef:base,
    fixed:{lat:t.lat,lng:t.lng,level}
  }));
}
function pmSplit(){
  if(!_pm)return;
  let base=_pm.pages[_pm.k];
  if(base.parentRef)base=base.parentRef;
  const prevN=base.split&&!base.split.scaleFixed?base.split.n:null;
  _pmRemoveTiles(base);
  delete base.fixed; // '현재 축척' 고정 상태였다면 해제하고 자동 분할 기준으로 다시 계산
  _pm.k=_pm.pages.indexOf(base);
  // 개요(한 장에 맞춘) 상태로 맞춘 뒤 기준 확대 단계 L0와 한 장이 덮는 범위를 잰다
  _applyMapPaper(base.orient);
  kakaoMap.relayout();
  _pmFit(base);
  const L0=kakaoMap.getLevel();
  let n,left=0;
  if(prevN===null){
    // 처음 누름: 소화전이 겹치지 않는 확대 단계를 자동 계산
    const r=_overlapFreeZoom(base.pts,L0);n=r.n;left=r.left;
    if(n===0){
      base.split={n:0,tiles:[]};
      showToast('이 장은 소화전이 겹치지 않아 한 장으로 충분합니다. 더 크게 원하면 한 번 더 누르세요','ok');
      _pmShow(_pm.k);return;
    }
  }else{
    n=prevN+1; // 다시 누름: 한 단계 더 확대
  }
  if(L0-n<1){showToast('이미 최대로 확대된 상태입니다','err');base.split={n:prevN||0,tiles:[]};_pmShow(_pm.k);return;}
  const tiles=_pmMakeTiles(base,L0-n);
  if(!tiles){showToast('범위가 너무 넓어 나눌 수 없습니다 (좌표가 크게 벗어난 소화전이 있는지 확인하세요)','err');base.split={n:prevN||0,tiles:[]};_pmShow(_pm.k);return;}
  if(tiles.length>30&&!confirm(`${tiles.length}장으로 나뉩니다. 계속할까요?\n(용지를 B4/A3로 바꾸면 장 수가 줄어듭니다)`)){base.split={n:prevN||0,tiles:[]};_pmShow(_pm.k);return;}
  base.split={n,tiles};
  _pm.pages.splice(_pm.k+1,0,..._pmTilePages(base,tiles,L0-n));
  showToast(`${n}단계 확대해 ${tiles.length}장으로 나눴습니다 (전체 ${base.pts.length}개 모두 포함)`
    +(left?` · 같은 위치에 붙어 있어 여전히 겹치는 곳 ${left}곳`:'')+'. 첫 장은 번호 개요입니다','ok');
  _pmShow(_pm.k);
}
function _pmRemoveTiles(base){
  _pm.pages=_pm.pages.filter(p=>p.parentRef!==base);
  delete base.split;
}
function pmUnsplit(){
  if(!_pm)return;
  let base=_pm.pages[_pm.k];
  if(base.parentRef)base=base.parentRef;
  _pmRemoveTiles(base);
  _pmShow(_pm.pages.indexOf(base));
}
function pmZoom(d){
  if(!_pm)return;
  const c=kakaoMap.getCenter();
  kakaoMap.setLevel(Math.max(1,kakaoMap.getLevel()+d));
  kakaoMap.setCenter(c);
}
function pmFlip(){
  if(!_pm)return;
  const pg=_pm.pages[_pm.k];
  if(pg.split||pg.parentRef){showToast('나눈 상태에서는 방향을 바꿀 수 없습니다. ↩ 한 장으로 누른 뒤 바꿔주세요','err');return;}
  pg.orient=pg.orient==='portrait'?'landscape':'portrait';
  _pmShow(_pm.k);
}
function pmMove(step){
  if(!_pm)return;
  const k=_pm.k+step;
  if(k<0||k>=_pm.pages.length)return;
  _pmShow(k);
}
function pmPrint(){
  if(!_pm)return;
  // 인쇄창이 닫히면 다음 조로 자동 이동 (마지막 장이면 그대로 둠)
  window.addEventListener('afterprint',()=>{
    setTimeout(()=>{
      if(!_pm)return;
      if(_pm.k<_pm.pages.length-1)_pmShow(_pm.k+1);
      else showToast('마지막 장입니다. ✕ 종료를 누르면 원래 화면으로 돌아갑니다','ok');
    },300);
  },{once:true});
  window.print();
}
function pmExit(){
  if(!_pm)return;
  _pmClearTiles();
  const r=_pm.restore;_pm=null;r();
}
