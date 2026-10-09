/* 119hyd-Map2 · js/overlap.js — 같은 자리에 겹친 소화전: 묶음 계산 · 개수 배지 · 이름표 묶기 · 눌러서 고르기 */
AppFiles.reg('js/overlap.js','v3.2.4'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 겹친 소화전 ══════════
   엑셀 좌표가 주소 기준이라, 한 건물·한 지번에 소화전이 여럿이면 전부 같은 점에 찍힌다.
   그러면 마커가 정확히 포개져 맨 위 하나만 보이고 눌린다 (아무리 확대해도 벌어지지 않음).
   → 서로 OVL_M(3m) 이내인 소화전을 한 묶음으로 보고
     ① 마커에 개수 배지  ② 이름표에 그 자리의 번호를 한 줄에 하나씩 모두 적음  ③ 마커를 누르면 그 자리 소화전 목록에서 고르기
   마커 위치는 건드리지 않는다 (실제와 다른 곳에 찍히면 지번 단계 인쇄물에서 엉뚱한 집 앞으로 보이므로).
   근본 해결은 위치 수정으로 각자 실제 자리에 옮기는 것. */
const OVL_M=3;
// groups: [{members:[idx…] 이름순, vis:[idx…] 지금 화면 범위(조·팀·검색)에 드는 것}], of: idx → 묶음
let _ovl={groups:[],of:{}};

function _ovlOwnLabel(i,printing){return labelText(items[i]);} // 화면·인쇄 모두 번호만
// 겹친 자리의 이름표 글자: 번호를 한 줄에 하나씩 모두 적는다 (종이에서는 눌러 볼 수 없으므로 번호가 다 보여야 함).
// 너무 길어지지 않게 OVL_LABEL_MAX줄까지만 — 넘으면 마지막 줄을 "외 N"으로.
const OVL_LABEL_MAX=6;
function _ovlStackLabel(vis,printing){
  const names=vis.map(i=>_ovlOwnLabel(i,printing));
  if(names.length<=OVL_LABEL_MAX)return names.join('\n');
  return names.slice(0,OVL_LABEL_MAX-1).join('\n')+`\n외 ${names.length-(OVL_LABEL_MAX-1)}`;
}
// 좌표가 바뀌는 곳(불러오기·위치 수정·좌표 재검색·일괄 위치수정 저장)에서 부른다. 묶음을 처음부터 다시 계산.
function ovlCompute(){
  // 예전 묶음의 표시(배지·묶은 이름표)를 먼저 지움 — 묶음에서 빠진 마커에 남지 않도록
  const old=new Set();
  _ovl.groups.forEach(g=>g.members.forEach(i=>{
    old.add(i);
    const o=overlays[i];if(!o||!items[i])return;
    const mk=o.overlay?.getContent&&o.overlay.getContent();
    if(mk&&mk.dataset)delete mk.dataset.cnt;
    const lb=o.labelOverlay?.getContent&&o.labelOverlay.getContent();
    if(lb){lb.textContent=labelText(items[i]);lb.style.whiteSpace='normal';}
  }));
  ovlCloseChooser();
  const pts=[];
  items.forEach((d,i)=>{if(d.lat&&d.lng)pts.push(i);});
  pts.sort((a,b)=>items[a].lat-items[b].lat); // 위도순으로 놓고 가까운 것끼리만 비교
  const parent={};pts.forEach(i=>{parent[i]=i;});
  const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
  const dLat=OVL_M/111000*1.05;
  for(let a=0;a<pts.length;a++){
    const A=items[pts[a]];
    for(let b=a+1;b<pts.length;b++){
      const B=items[pts[b]];
      if(B.lat-A.lat>dLat)break;
      if(_distM(A,B)<=OVL_M){const ra=find(pts[a]),rb=find(pts[b]);if(ra!==rb)parent[ra]=rb;}
    }
  }
  const by={};
  pts.forEach(i=>{const r=find(i);(by[r]=by[r]||[]).push(i);});
  const groups=[],of={};
  Object.values(by).forEach(m=>{
    if(m.length<2)return;
    m.sort((a,b)=>items[a].name.localeCompare(items[b].name,'ko',{numeric:true}));
    const g={members:m,vis:[]};
    groups.push(g);m.forEach(i=>{of[i]=g;});
  });
  _ovl={groups,of};
  return old; // 예전 묶음에 들어 있던 항목들 (목록의 '겹침' 표시를 갱신할 때 씀)
}
// 좌표가 바뀐 뒤: 묶음 다시 계산 + 배지·이름표·목록 표시 갱신
function ovlRecompute(){
  const touched=ovlCompute();
  _ovl.groups.forEach(g=>g.members.forEach(i=>touched.add(i)));
  applyFilter(); // 안에서 ovlRefresh()를 부름
  touched.forEach(i=>{if(items[i]&&document.getElementById(`item-${i}`))updateListItem(i);});
}
// 지금 화면 범위에서 각 묶음에 몇 개가 보이는지 다시 세고, 배지와 이름표를 맞춘다. applyFilter가 매번 부른다.
function ovlRefresh(){
  const printing=document.documentElement.classList.contains('printing-map');
  _ovl.groups.forEach(g=>{
    g.vis=g.members.filter(i=>items[i]&&!_baseHidden(items[i]));
    const n=g.vis.length;
    // 일괄 위치수정 중: 이 자리에 남은 것(here)과 그중 맨 위(top)를 정하고, 편집 마커의 쌓이는 순서를 거기에 맞춤
    let here=[],top=-1;
    if(_bf){
      here=_ovlHere(g);
      top=here.includes(g.bfTop)?g.bfTop:(here.length?here[0]:-1);
      g.bfTop=top;
      here.forEach(j=>{const m=_bf.marks.get(items[j].id)?.marker;if(m&&m.setZIndex)m.setZIndex(j===top?7:5);});
    }
    g.members.forEach(i=>{
      const o=overlays[i];if(!o||!items[i])return;
      const stacked=n>=2&&g.vis.includes(i);
      const mk=o.overlay?.getContent&&o.overlay.getContent();
      if(mk&&mk.dataset){if(stacked)mk.dataset.cnt=n;else delete mk.dataset.cnt;}
      // 이름표: 겹친 것끼리는 모두 같은 글자(그 자리의 번호 전부)를 보여, 어느 것이 맨 위에 그려져도 같게
      const lb=o.labelOverlay?.getContent&&o.labelOverlay.getContent();
      if(lb){
        let t,multi=false;
        if(_bf&&_bf.marks.has(items[i].id)){
          // 일괄 위치수정 중: 아직 이 자리에 남은 번호만 적고, 지금 잡히는(맨 위) 번호 앞에 ▶
          if(here.length>=2&&here.includes(i)){t=here.map(j=>(j===top?'▶ ':'')+labelText(items[j])).join('\n');multi=true;}
          else t=labelText(items[i]); // 옮긴 것·혼자 남은 것은 자기 번호만
        }else if(fixLocationIdx===i){
          t=_ovlOwnLabel(i,printing); // 위치 수정 중인 것은 자기 번호만 (다른 마커는 숨겨져 있음)
        }else{
          multi=stacked;
          t=stacked?_ovlStackLabel(g.vis,printing):_ovlOwnLabel(i,printing);
        }
        if(lb.textContent!==t)lb.textContent=t;
        const ws=multi?'pre-line':'normal'; // pre-line: 줄바꿈 글자를 실제 줄바꿈으로
        if(lb.style.whiteSpace!==ws)lb.style.whiteSpace=ws;
      }
    });
  });
}
/* ── 일괄 위치수정 중의 겹친 자리 ── (batch-fix.js가 부른다) */
// 이 묶음에서 아직 원래 자리에 남아 있는 편집 마커들 (옮겼거나 지금 끌고 있는 것은 뺌)
function _ovlHere(g){
  return g.vis.filter(i=>{const d=items[i];return _bf.marks.has(d.id)&&!_bf.changed.has(d.id)&&_bf.dragId!==d.id;});
}
// 겹친 편집 마커를 눌렀을 때: 다음 번호를 맨 위로 올린다 (끌면 그 번호가 잡힘)
function ovlBfCycle(idx){
  if(!_bf)return;
  const g=_ovl.of[idx];if(!g)return;
  const here=_ovlHere(g);
  if(here.length<2)return;
  const cur=here.includes(g.bfTop)?g.bfTop:here[0];
  g.bfTop=here[(here.indexOf(cur)+1)%here.length];
  ovlRefresh();
  _bfInfo(`▶ ${items[g.bfTop].name} 을(를) 잡습니다 (${here.indexOf(g.bfTop)+1}/${here.length}) — 끌어서 옮기세요`);
}
function ovlStackCount(){
  let groups=0,n=0;
  _ovl.groups.forEach(g=>{if(g.vis.length>=2){groups++;n+=g.vis.length;}});
  return {groups,items:n};
}
// 이 소화전이 (지금 화면 범위에서) 다른 것과 겹쳐 있는지 — '겹친 위치만 보기'와 목록 표시에 씀
const _ovlIdCache={items:null,map:null};
function ovlGroupOfItem(d){
  if(_ovlIdCache.items!==items){ // 계획을 다시 불러오면 items 배열이 통째로 바뀌므로 그때만 다시 만든다
    _ovlIdCache.items=items;_ovlIdCache.map=new Map(items.map((x,i)=>[x.id,i]));
  }
  const i=_ovlIdCache.map.get(d.id);
  return i===undefined?null:(_ovl.of[i]||null);
}
function ovlInStack(d){const g=ovlGroupOfItem(d);return !!(g&&g.vis.length>=2);}
function ovlTipText(idx){
  const g=_ovl.of[idx];
  return (g&&g.vis.length>=2&&g.vis.includes(idx))?`이 위치에 소화전 ${g.vis.length}개 — 눌러서 선택`:'';
}

/* ── 겹친 마커를 눌렀을 때: 그 자리 소화전 목록 ── */
let _ovlChooser=null; // {g, overlay}
let _ovlRaised=null;  // 고른 마커를 맨 위로 올려 둔 것 (다음에 고를 때 되돌림)
function ovlCloseChooser(){
  if(!_ovlChooser)return;
  _ovlChooser.overlay.setMap(null);_ovlChooser=null;
}
// 마커(또는 이름표)를 눌렀을 때 부른다. 겹친 자리면 선택 창을 띄우고 true, 아니면 false(평소대로 카드 열기)
function ovlTap(idx){
  if(fixLocationIdx>=0||_bf||document.documentElement.classList.contains('printing-map'))return false;
  const g=_ovl.of[idx];
  if(!g||g.vis.length<2||!g.vis.includes(idx))return false;
  if(_ovlChooser&&_ovlChooser.g===g){ovlCloseChooser();return true;} // 다시 누르면 닫기
  closeIw(); // 열린 카드와 다른 선택 창을 닫음
  const d0=items[g.vis[0]];
  const el=document.createElement('div');
  el.className='ovl-chooser';
  // 창 안에서의 조작이 지도로 전달되지 않게 (정보카드와 같은 처리)
  ['click','mousedown','mousemove','dblclick','wheel','touchstart','touchmove','touchend','pointerdown'].forEach(ev=>el.addEventListener(ev,e=>e.stopPropagation(),{passive:false}));
  const head=document.createElement('div');
  head.className='ovl-chooser-head';
  head.innerHTML=`<span>이 위치에 소화전 <b>${g.vis.length}개</b></span>`;
  const x=document.createElement('span');x.className='ovl-chooser-x';x.textContent='✕';x.title='닫기';
  x.addEventListener('click',e=>{e.stopPropagation();ovlCloseChooser();});
  head.appendChild(x);el.appendChild(head);
  g.vis.forEach(i=>{
    const d=items[i];
    const row=document.createElement('button');
    row.type='button';row.className='ovl-chooser-row';
    const rec=hydrantMap[d.id], st=rec?hyStatusInfo(rec):null;
    row.innerHTML=`<i style="background:${groupColor(d)}"></i><span class="nm">${esc(d.name)}</span>`
      +(d.group_name?`<span class="tg">${esc(d.group_name)}</span>`:'')
      +(st?`<span class="tg" style="background:${st.bg};color:${st.fg}">${esc(st.label)}</span>`:'')
      +(doneMap[d.id]?'<span class="tg dn">✓ 완료</span>':'');
    const pick=()=>ovlPick(i);
    row.addEventListener('click',e=>{e.stopPropagation();pick();});
    // 모바일: 지도 위 요소에서 click이 누락되는 경우가 있어 touchend로 보완 (마커와 같은 처리)
    let moved=false;
    row.addEventListener('touchstart',()=>{moved=false;},{passive:true});
    row.addEventListener('touchmove',()=>{moved=true;},{passive:true});
    row.addEventListener('touchend',e=>{e.stopPropagation();if(!moved){e.preventDefault();pick();}},{passive:false});
    el.appendChild(row);
  });
  const foot=document.createElement('div');
  foot.className='ovl-chooser-foot';
  foot.textContent='실제 위치가 서로 다르면 카드의 📍 위치 수정으로 옮기세요';
  el.appendChild(foot);
  const overlay=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(d0.lat,d0.lng),content:el,xAnchor:.5,yAnchor:1,zIndex:150,clickable:true});
  overlay.setMap(kakaoMap);
  _ovlChooser={g,overlay};
  if(_sharedTooltip)_sharedTooltip.style.opacity='0';
  panToForCard(d0.lat,d0.lng);
  return true;
}
function ovlPick(i){
  ovlCloseChooser();
  const o=overlays[i];if(!o||!o.open)return;
  if(iwOpen===o.iw)return; // 이미 이 카드가 열려 있으면 그대로 둠 (open은 다시 부르면 닫히는 토글이라)
  // 고른 마커를 겹친 것들 중 맨 위로 (선택 표시가 보이도록)
  if(_ovlRaised&&_ovlRaised!==o.overlay&&_ovlRaised.setZIndex)_ovlRaised.setZIndex(10);
  if(o.overlay.setZIndex){o.overlay.setZIndex(12);_ovlRaised=o.overlay;}
  o.open();
}
