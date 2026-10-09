/* 119hyd-Map2 · js/print.js — 인쇄: 범위 선택 · 점검 목록표 */
AppFiles.reg('js/print.js','v3.2.4'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 인쇄 (전체 / 팀 / 조) ══════════ */
// 범위 값: 'all' | 'team:1팀' | 'jo:1팀 2조'
function _printTeams(){return [...new Set(groups.filter(g=>g.includes(' ')).map(g=>g.split(' ')[0]))];}
function _inPrintScope(d,scope){
  const g=String(d.group_name||'').trim();
  // 세분계획 잠금 범위 밖은 어떤 경우에도 인쇄하지 않음
  if(teamFilterPrefix&&!(g===teamFilterPrefix||g.startsWith(teamFilterPrefix+' ')))return false;
  if(lockedFilterGroup&&g!==lockedFilterGroup)return false;
  if(scope==='all')return true;
  if(scope.startsWith('team:')){const t=scope.slice(5);return g===t||g.startsWith(t+' ');}
  if(scope.startsWith('jo:'))return g===scope.slice(3);
  return true;
}
// 인쇄용 소화전 번호: 앞의 지역명 접두어(예: '금천-')를 떼고 숫자만 6자리로
function _shortNo(name){
  const s=String(name||'').trim();
  const m=s.match(/^[^\d]*[-\s]\s*(\d+)$/);
  return m?m[1].padStart(6,'0'):s;
}
function _scopeLabel(scope){
  if(scope==='all')return '전체';
  if(scope.startsWith('team:'))return scope.slice(5)+' 전체';
  return scope.slice(3);
}
function printFromHydrant(idx){closeIw();showPrintModal(idx);}
function _onPrintScopeChange(){
  const v=document.getElementById('printScope').value;
  const isA=v==='anchor',isArea=v==='area';
  document.getElementById('printAnchorRow').style.display=isA?'block':'none';
  document.getElementById('printAreaRow').style.display=isArea?'block':'none';
  const pj=document.getElementById('printMapPerJo');if(pj)pj.closest('label').style.opacity=(isA||isArea)?.4:1;
  if(isA)setTimeout(()=>{const i=document.getElementById('printAnchorNo');if(!i.value)i.focus();},50);
}
// 입력한 번호로 기준 소화전 찾기: '001595', '1595', '금천-001595' 모두 허용
function _findAnchor(){
  const v=String(document.getElementById('printAnchorNo').value||'').trim();
  if(!v)return null;
  const num=/^\d+$/.test(v)?v.padStart(6,'0'):null;
  return items.find(d=>d.lat&&d.lng&&(d.name===v||(num&&_shortNo(d.name)===num)))||null;
}
function _distM(a,b){
  const R=6371000,toR=x=>x*Math.PI/180;
  const dLat=toR(b.lat-a.lat),dLng=toR(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function showPrintModal(anchorIdx){
  if(!items.length){showToast('인쇄할 소화전이 없습니다','err');return;}
  const sel=document.getElementById('printScope');
  const opts=[];
  if(lockedFilterGroup){
    opts.push(['jo:'+lockedFilterGroup,lockedFilterGroup]);
  }else if(teamFilterPrefix){
    opts.push(['team:'+teamFilterPrefix,teamFilterPrefix+' 전체']);
    groups.filter(g=>g.startsWith(teamFilterPrefix+' ')).forEach(g=>opts.push(['jo:'+g,'　└ '+g]));
  }else{
    opts.push(['all','전체 ('+items.length+'개)']);
    _printTeams().forEach(t=>{
      opts.push(['team:'+t,t+' 전체']);
      groups.filter(g=>g.startsWith(t+' ')).forEach(g=>opts.push(['jo:'+g,'　└ '+g]));
    });
    groups.filter(g=>!g.includes(' ')).forEach(g=>opts.push(['jo:'+g,g]));
  }
  sel.innerHTML=opts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
  const pp=safeStorage.get('hy_print_paper','A4');
  document.getElementById('printPaper').value=PRINT_PAPERS[pp]?pp:'A4';
  // 기본값: 지금 보고 있는 범위
  const cur=filterGroupVal?'jo:'+filterGroupVal:teamFilterPrefix?'team:'+teamFilterPrefix:lockedFilterGroup?'jo:'+lockedFilterGroup:'all';
  if(opts.some(o=>o[0]===cur))sel.value=cur;
  // 특정 소화전 기준(반경) — 팝업의 "기준 인쇄"로 열면 그 소화전이 미리 선택됨
  sel.insertAdjacentHTML('beforeend','<option value="anchor">📍 특정 소화전 기준 (반경)</option>');
  // 지도에서 영역 지정 (드래그) — PC 전용. 영역 안에서 표시할 소화전 범위는 지금 보고 있는 범위가 기본값
  const as=document.getElementById('printAreaScope');
  as.innerHTML=opts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
  if(opts.some(o=>o[0]===cur))as.value=cur;
  if(_areaAllowed())sel.insertAdjacentHTML('beforeend','<option value="area">✏️ 지도에서 영역 지정 (드래그)</option>');
  const sc=safeStorage.get('hy_print_scale','fit');
  document.querySelectorAll('input[name="printScale"]').forEach(r=>{r.checked=r.value===sc;r.onchange=()=>{document.querySelector('input[name="printFmt"][value="map"]').checked=true;};});
  const lvEl=document.getElementById('printCurLevel');
  if(lvEl&&kakaoMap)lvEl.textContent=`(현재 화면 막대 축척 ${_levelScaleText(kakaoMap.getLevel())})`;
  const ai=document.getElementById('printAnchorNo');
  if(typeof anchorIdx==='number'&&items[anchorIdx]){ai.value=_shortNo(items[anchorIdx].name);sel.value='anchor';}
  else if(sel.value!=='anchor')ai.value=ai.value||'';
  _onPrintScopeChange();
  showModal('printModal');
}
// ── 용지 (가로 방향, mm) ──
const PRINT_PAPERS={A4:[297,210],B4:[364,257],A3:[420,297]};
const PRINT_MARGIN=6; // 지도 인쇄 여백(mm)
function _paper(){const k=document.getElementById('printPaper')?.value||'A4';return {key:k,w:PRINT_PAPERS[k][0],h:PRINT_PAPERS[k][1]};}
// 지도 인쇄용: 화면의 지도 영역을 선택한 용지의 인쇄면 크기로 + @page 크기 지정
function _applyMapPaper(orient){
  const p=_paper();
  // PRINT_PAPERS는 가로 기준(w>h). 세로면 뒤바꾼다
  const W=orient==='portrait'?p.h:p.w, H=orient==='portrait'?p.w:p.h;
  const root=document.documentElement;
  root.style.setProperty('--print-w',(W-PRINT_MARGIN*2-1)+'mm');
  root.style.setProperty('--print-h',(H-PRINT_MARGIN*2-2)+'mm');
  let st=document.getElementById('printPageStyle');
  if(!st){st=document.createElement('style');st.id='printPageStyle';document.head.appendChild(st);}
  st.textContent=`@media print{@page{size:${W}mm ${H}mm;margin:${PRINT_MARGIN}mm}}`;
}
// 담당구역 모양으로 용지 방향 결정: 남북으로 긴 구역 → 세로, 동서로 긴 구역 → 가로
// (카카오맵 확대 단계는 정해져 있어서, 모양에 맞는 방향이어야 한 단계 더 크게 확대될 수 있다)
function _autoOrient(pts){
  const core=_robustPts(pts);
  const lats=core.map(d=>d.lat),lngs=core.map(d=>d.lng);
  const h=Math.max(...lats)-Math.min(...lats);
  const w=(Math.max(...lngs)-Math.min(...lngs))*Math.cos((Math.max(...lats)+Math.min(...lats))/2*Math.PI/180);
  return h>w?'portrait':'landscape';
}
// 카카오맵 확대 단계별 화면 축척 막대 값(대략)
function _levelScaleText(L){return ({1:'20m',2:'30m',3:'50m',4:'100m',5:'250m',6:'500m',7:'1km',8:'2km',9:'4km',10:'8km'})[L]||('단계 '+L);}
function _printScaleMode(){return document.querySelector('input[name="printScale"]:checked')?.value||'fit';}
function doPrint(){
  safeStorage.set('hy_print_paper',document.getElementById('printPaper').value);
  safeStorage.set('hy_print_scale',_printScaleMode());
  const scope=document.getElementById('printScope').value;
  const fmt=document.querySelector('input[name="printFmt"]:checked')?.value||'list';
  const undoneOnly=document.getElementById('printUndoneOnly').checked;
  if(scope==='area'){
    hideModal('printModal');
    areaStart({fmt,scope:document.getElementById('printAreaScope').value,undoneOnly,showLabels:document.getElementById('printMapLabels').checked});
    return;
  }
  if(scope==='anchor'){
    const a=_findAnchor();
    if(!a){showToast('기준 소화전을 찾을 수 없습니다. 번호를 확인해주세요 (좌표가 있는 소화전만 가능)','err');return;}
    const r=+document.getElementById('printRadius').value||300;
    let near=items.filter(d=>d.lat&&d.lng&&_distM(a,d)<=r);
    if(undoneOnly)near=near.filter(d=>d===a||!doneMap[d.id]);
    const opt={anchor:a,r,label:`${_shortNo(a.name)} 기준 반경 ${r>=1000?(r/1000)+'km':r+'m'}`};
    hideModal('printModal');
    if(fmt==='map')_printMap(scope,near,document.getElementById('printMapLabels').checked,false,opt);
    else _printList(scope,near,opt);
    return;
  }
  let list=items.filter(d=>_inPrintScope(d,scope));
  if(undoneOnly)list=list.filter(d=>!doneMap[d.id]);
  if(!list.length){showToast('해당 범위에 인쇄할 소화전이 없습니다','err');return;}
  hideModal('printModal');
  if(fmt==='map')_printMap(scope,list,document.getElementById('printMapLabels').checked,document.getElementById('printMapPerJo').checked);
  else _printList(scope,list);
}
// ── 점검 목록표: 새 창에 표 형태로 만들어 인쇄 (조별로 페이지 분리) ──
function _printList(scope,list,opt){
  const A=opt?.anchor;
  const typeTxt=d=>{const t=hydrantMap[d.id]?.hydrant_type||getExcelHydrantType(d);return t==='ground'?'지상':t==='underground'?'지하':'';};
  const byGroup={};
  if(A)byGroup[opt.label]=list.slice();
  else list.forEach(d=>{const g=String(d.group_name||'').trim()||'(미지정)';(byGroup[g]=byGroup[g]||[]).push(d);});
  const gNames=Object.keys(byGroup).sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
  const today=new Date().toLocaleDateString('ko-KR');
  const title=currentProject?.name||'소화전 점검';
  const sections=gNames.map((g,gi)=>{
    const rows=A
      ?byGroup[g].slice().sort((a,b)=>_distM(A,a)-_distM(A,b))
      :byGroup[g].slice().sort((a,b)=>_shortNo(a.name).localeCompare(_shortNo(b.name),'ko',{numeric:true}));
    const done=rows.filter(d=>doneMap[d.id]).length;
    const trs=rows.map((d,i)=>{
      const rec=hydrantMap[d.id];
      const res=rec?.result?hyStatusInfo(rec).label.replace(/^[^ ]+ /,''):'';
      return `<tr${A&&d===A?' style="background:#fee2e2"':''}><td class="c">${i+1}</td>${A?`<td class="c">${d===A?'기준':Math.round(_distM(A,d))+'m'}</td>`:''}<td class="b">${esc(_shortNo(d.name))}</td><td>${esc((d.address||'').replace('서울특별시 금천구 ',''))}</td><td>${esc((d.extra?.['지번주소']||'').replace('서울특별시 금천구 ','').replace('서울특별시 ',''))}</td><td class="n">${d.lat?(+d.lat).toFixed(6):''}</td><td class="n">${d.lng?(+d.lng).toFixed(6):''}</td><td class="c">${typeTxt(d)}</td><td class="c">${esc(res)}</td><td class="c">${rec?.paint?PAINT_LABEL[rec.paint]:''}</td><td class="c">${rec?.insul?INSUL_LABEL[rec.insul]:''}</td><td class="c">${doneMap[d.id]?'✔':'☐'}</td><td class="m">${esc(memoMap[d.id]||'')}</td></tr>`;
    }).join('');
    return `<section${gi?' class="pb"':''}><h2>${esc(g)} <small>${rows.length}개 · 완료 ${done}개</small></h2>
      <table><thead><tr><th style="width:28px">No</th>${A?'<th style="width:46px">거리</th>':''}<th style="width:56px">시설번호</th><th>도로명주소</th><th>지번주소</th><th style="width:64px">위도</th><th style="width:70px">경도</th><th style="width:34px">식구분</th><th style="width:56px">점검결과</th><th style="width:38px">도색</th><th style="width:38px">보온</th><th style="width:34px">완료</th><th style="width:13%">메모 / 비고</th></tr></thead><tbody>${trs}</tbody></table></section>`;
  }).join('');
  const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)} - ${esc(opt?.label||_scopeLabel(scope))}</title>
<style>
@page{size:${_paper().w}mm ${_paper().h}mm;margin:10mm}
body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;margin:0;font-size:${_paper().key==='A4'?11:12.5}px}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:4px;margin-bottom:8px}
header h1{font-size:16px;margin:0}header div{font-size:11px;color:#444}
h2{font-size:13px;margin:10px 0 4px}h2 small{font-weight:400;color:#555;font-size:11px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #888;padding:4px 5px;vertical-align:middle;word-break:keep-all;overflow-wrap:anywhere}
th{background:#e8eef7;font-size:10.5px}tr{page-break-inside:avoid}
td.c{text-align:center}td.b{font-weight:700}td.m{font-size:10px;color:#333}td.n{font-size:9.5px;text-align:center;font-variant-numeric:tabular-nums}
thead{display:table-header-group}
.pb{page-break-before:always}
</style></head><body>
<header><h1>🧯 ${esc(title)} — ${esc(opt?.label||_scopeLabel(scope))}</h1><div>출력일 ${today} · 총 ${list.length}개 · 완료 ${list.filter(d=>doneMap[d.id]).length}개 · 점검자 ________</div></header>
${sections}
<script>window.onload=()=>{setTimeout(()=>window.print(),300)};<\/script>
</body></html>`;
  const w=window.open('','_blank');
  if(!w){showToast('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요','err');return;}
  w.document.open();w.document.write(html);w.document.close();
}
