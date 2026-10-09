/* 119hyd-Map2 · js/project.js — 홈 화면: 계획 목록 · 세분계획 · 구역 담당 팀 순환 · 계획 생성/수정/삭제 */
AppFiles.reg('js/project.js','v3.2.3'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ Home / Project ══════════ */
// 만료 배지 HTML 생성 (공통)
function expireBadgeHtml(expire_at){
  if(!expire_at)return `<span class="badge" style="background:rgba(255,255,255,.05);color:var(--mt)">📅 영구 보관</span>`;
  const exp=new Date(expire_at);
  const dDay=Math.ceil((exp-new Date())/(1000*60*60*24));
  const date=exp.toLocaleDateString('ko-KR');
  if(dDay<0) return `<span class="badge" style="background:rgba(239,68,68,.15);color:#ef4444;font-weight:700">⚠️ 만료됨 (${date})</span>`;
  if(dDay<=30) return `<span class="badge" style="background:rgba(251,146,60,.15);color:#fb923c;font-weight:700">⏰ D-${dDay} · ${date}까지</span>`;
  return `<span class="badge" style="background:rgba(255,255,255,.05);color:var(--mt)">📅 ${date}까지</span>`;
}
// 카드 메타(개소/완료/생성일/만료) HTML 생성 (공통)
// ══ 세분계획 생성/갱신 ══
// 부모 계획의 items에 있는 팀/조(group_name) 고유값마다 세분계획(가상 뷰) 레코드를 만든다.
// 세분계획은 자체 items를 갖지 않고, 열면 부모 데이터를 해당 조 필터로 잠가서 보여준다.
// 재실행하면 기존 세분계획을 지우고 현재 데이터 기준으로 다시 만든다 (엑셀 재업로드 후 갱신용).
async function generateSubPlans(parentId){
  if(!requireAdmin())return;
  const parent=projectList.find(x=>String(x.id)===String(parentId));
  if(!parent){showToast('계획을 찾을 수 없습니다','err');return;}
  showToast('구역/조 정보 확인 중...','');
  try{
    const rows=await SupabaseUtil.select('hydmap_items',{eq:{inspection_id:parentId},columns:'group_name'});
    const groups=[...new Set((rows||[]).map(r=>String(r.group_name||'').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'ko',{numeric:true,sensitivity:'base'}));
    if(!groups.length){showToast('구역/조 정보가 없습니다. 엑셀에 구역·조 컬럼을 매핑해서 업로드해주세요.','err');return;}
    // 팀 목록 추출: "1팀 2조" 형태에서 첫 토큰("1팀")을 팀으로 본다. 공백 없는 값("2조"만)은 팀 없음.
    const teams=[...new Set(groups.filter(g=>g.includes(' ')).map(g=>g.split(' ')[0]))]
      .sort((a,b)=>a.localeCompare(b,'ko',{numeric:true,sensitivity:'base'}));
    const existing=subPlanList.filter(sp=>String(sp.parent_id)===String(parentId));
    const summary=teams.length?`구역 ${teams.length}개 + 조 ${groups.length}개`:`조 ${groups.length}개`;
    // 다시 만들어도 구역별 담당 팀은 유지
    const prevAssign={};existing.forEach(sp=>{if(sp.assigned_team)prevAssign[sp.filter_group]=sp.assigned_team;});
    const msg=existing.length
      ?`기존 세분계획 ${existing.length}개를 지우고 현재 데이터 기준(${summary})으로 다시 만듭니다.\n(점검 데이터는 부모 계획에 있으므로 사라지지 않습니다)\n계속하시겠습니까?`
      :`${summary}(${groups.slice(0,4).join(', ')}${groups.length>4?' 외':''}) 기준으로 세분계획을 생성합니다.\n계속하시겠습니까?`;
    if(!confirm(msg))return;
    if(existing.length)await SupabaseUtil.remove('hydmap_projects',{parent_id:parentId});
    // 팀 카드 먼저 (filter_group='1팀' — 열면 접두어 매칭으로 팀 전체 표시)
    for(const t of teams){
      const row={name:`${t} 전체`,description:`${parent.name} — ${t} 전 조`,parent_id:parentId,filter_group:t};
      if(prevAssign[t])row.assigned_team=prevAssign[t];
      await SupabaseUtil.insert('hydmap_projects',row);
    }
    // 조 카드 (filter_group='1팀 2조' — 정확 매칭으로 해당 조만 표시)
    for(const g of groups){
      await SupabaseUtil.insert('hydmap_projects',{
        name:g,
        description:`${parent.name} — ${g} 담당분`,
        parent_id:parentId,
        filter_group:g,
      });
    }
    showToast(`세분계획 ${teams.length+groups.length}개 생성 완료`,'ok');
    await loadProjects();
  }catch(e){
    showToast('세분계획 생성 실패: '+e.message,'err');
    console.error('generateSubPlans 오류:',e);
  }
}
/* ══════════ 구역 담당 팀 (6개월 순환) ══════════
   소화전은 구역(A/B/C)에 고정되고, 구역을 맡는 팀만 바뀐다. 담당 팀은 구역 카드(hydmap_projects.assigned_team)에 저장. */
async function setAreaTeam(spId){
  if(!requireAdmin())return;
  const sp=subPlanList.find(x=>String(x.id)===String(spId));if(!sp)return;
  const v=prompt(`${sp.filter_group}의 담당 팀을 입력하세요 (예: 1팀). 비우면 미지정`,sp.assigned_team||'');
  if(v===null)return;
  let t=v.trim();if(/^\d+$/.test(t))t+='팀';
  try{
    await SupabaseUtil.update('hydmap_projects',{assigned_team:t||null},{id:sp.id});
    showToast(`${sp.filter_group} 담당: ${t||'미지정'}`,'ok');
    await loadProjects();
  }catch(e){showToast('저장 실패: '+e.message+' (구역 전환 SQL을 실행했는지 확인)','err');}
}
// 순환 규칙: 지금 n팀이 맡은 구역 → 다음엔 (n-1)팀 (1팀 → 3팀으로 돌아감)
//   예) A:1팀 B:2팀 C:3팀  →  A:3팀 B:1팀 C:2팀  →  A:2팀 B:3팀 C:1팀  →  처음으로
async function rotateAreaTeams(parentId){
  if(!requireAdmin())return;
  const areas=subPlanList.filter(sp=>String(sp.parent_id)===String(parentId)&&!String(sp.filter_group||'').includes(' '));
  const teams=[...new Set(areas.map(a=>a.assigned_team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
  if(!areas.length||areas.some(a=>!a.assigned_team)){showToast('모든 구역에 담당 팀을 먼저 지정하세요 (구역 카드의 "변경")','err');return;}
  if(teams.length!==areas.length){showToast('구역마다 서로 다른 팀이 지정되어야 순환할 수 있습니다','err');return;}
  const next=a=>teams[(teams.indexOf(a.assigned_team)-1+teams.length)%teams.length];
  // 확인창: 팀 입장(어느 구역으로 옮겨 가는지)과 구역 입장(담당 팀이 어떻게 바뀌는지)을 함께 보여 준다
  const byTeam=[...areas].sort((x,y)=>x.assigned_team.localeCompare(y.assigned_team,'ko',{numeric:true}))
    .map(a=>{const to=areas.find(b=>next(b)===a.assigned_team);return `${a.assigned_team}: ${a.filter_group} → ${to?to.filter_group:'?'}`;}).join('\n');
  const byArea=areas.map(a=>`${a.filter_group}: ${a.assigned_team} → ${next(a)}`).join('\n');
  if(!confirm(`담당 팀을 순환합니다.\n\n[팀별 이동]\n${byTeam}\n\n[구역별 담당]\n${byArea}\n\n소화전·점검 데이터는 그대로입니다. 계속할까요?`))return;
  try{
    for(const a of areas)await SupabaseUtil.update('hydmap_projects',{assigned_team:next(a)},{id:a.id});
    showToast('담당 팀 순환 완료','ok');
    await loadProjects();
  }catch(e){showToast('순환 실패: '+e.message,'err');}
}
function cardMetaHtml(p){
  const total=p._total==='-'?'-':(p._total||0);
  const done=p._done==='-'?'-':(p._done||0);
  const pct=(typeof total==='number'&&total)?Math.round(done/total*100):0;
  return `
    <span class="badge" style="background:rgba(47,129,247,.1);color:var(--ac)">${total}개소</span>
    <span class="badge" style="background:rgba(63,185,80,.1);color:var(--lo)">${done}완료 ${pct}%</span>
    <span class="badge" style="background:rgba(255,255,255,.05);color:var(--mt)">${new Date(p.created_at).toLocaleDateString('ko-KR')}</span>
    ${expireBadgeHtml(p.expire_at)}`;
}

async function loadProjects(){
  try{
    const projs=await SupabaseUtil.select('hydmap_projects',{order:{column:'created_at',ascending:false}});
    if(!Array.isArray(projs))throw new Error('응답 형식 오류');
    // 부모 계획과 세분계획(parent_id 있는 것) 분리
    const parents=projs.filter(p=>!p.parent_id);
    subPlanList=projs.filter(p=>p.parent_id);
    // sort_order가 있으면 그 순서(작을수록 위)로, 없는(0/null) 항목들은 기존 최신순 유지
    parents.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    subPlanList.sort((a,b)=>String(a.filter_group||'').localeCompare(String(b.filter_group||''),'ko',{numeric:true}));
    // 먼저 목록 표시 (건수 없이)
    projs.forEach(p=>{p._total='-';p._done='-';});
    renderProjects(parents);
    // 건수 일괄 로드: 전체 items/done을 2번 쿼리로 가져와 JS 집계 (N+1 제거)
    // 세분계획별 진행률까지 계산해야 하므로 group_name과 item id도 함께 가져온다
    try{
      const [allItems,allDone]=await Promise.all([
        SupabaseUtil.select('hydmap_items',{columns:'id,inspection_id,group_name'}),
        SupabaseUtil.select('hydmap_done',{columns:'item_id,inspection_id'})
      ]);
      const totalMap={},doneMap2={};
      const groupTotal={},groupDone={},itemGroup={};
      if(Array.isArray(allItems))allItems.forEach(x=>{
        totalMap[x.inspection_id]=(totalMap[x.inspection_id]||0)+1;
        const g=String(x.group_name||'').trim();
        itemGroup[x.id]=g;
        if(g){
          (groupTotal[x.inspection_id]=groupTotal[x.inspection_id]||{})[g]=(groupTotal[x.inspection_id]?.[g]||0)+1;
        }
      });
      if(Array.isArray(allDone))allDone.forEach(x=>{
        doneMap2[x.inspection_id]=(doneMap2[x.inspection_id]||0)+1;
        const g=itemGroup[x.item_id];
        if(g){
          (groupDone[x.inspection_id]=groupDone[x.inspection_id]||{})[g]=(groupDone[x.inspection_id]?.[g]||0)+1;
        }
      });
      projs.forEach(p=>{
        if(p.parent_id){
          // 세분계획: 조 카드는 정확 매칭, 팀 카드('1팀')는 '1팀 x조'들을 접두어 매칭으로 합산
          const fg=String(p.filter_group||'').trim();
          const match=k=>k===fg||k.startsWith(fg+' ');
          const gt=groupTotal[p.parent_id]||{},gd=groupDone[p.parent_id]||{};
          p._total=Object.keys(gt).reduce((s,k)=>s+(match(k)?gt[k]:0),0);
          p._done=Object.keys(gd).reduce((s,k)=>s+(match(k)?gd[k]:0),0);
        }else{
          p._total=totalMap[p.id]||0;
          p._done=doneMap2[p.id]||0;
        }
        const card=document.getElementById('pcard-'+p.id);
        if(card){
          const meta=card.querySelector('.project-card-meta');
          if(meta)meta.innerHTML=cardMetaHtml(p);
        }
      });
    }catch(e){console.warn('건수 로드 실패',e);}
  }catch(e){
    showToast('프로젝트 로드 실패: '+e.message,'err');
    console.error('loadProjects 오류:',e);
  }
}
function renderProjects(list){
  projectList=list;
  const grid=document.getElementById('projectGrid');
  if(!grid)return;
  // empty 요소를 먼저 분리 보관
  const empty=document.getElementById('projectEmpty');
  if(empty&&empty.parentNode===grid)grid.removeChild(empty);
  grid.innerHTML='';
  if(!list.length){
    if(empty){empty.style.display='block';grid.appendChild(empty);}
    return;
  }
  if(empty)empty.style.display='none';
  // ── 트리 접기/펼치기 상태 (localStorage에 기억) ──
  const frag=document.createDocumentFragment();
  list.forEach((p,i)=>{
    const children=subPlanList.filter(sp=>String(sp.parent_id)===String(p.id));
    const isTeamCard=sp=>children.some(o=>o.id!==sp.id&&String(o.filter_group||'').startsWith(String(sp.filter_group||'')+' '));
    const hasTeamParent=sp=>children.some(o=>o.id!==sp.id&&String(sp.filter_group||'').startsWith(String(o.filter_group||'')+' '));
    const card=document.createElement('div');
    card.className='project-card';
    card.id='pcard-'+p.id;
    card.dataset.id=p.id;
    const pOpen=_treeIsOpen(p.id,false);
    card.innerHTML=`
      <div class="project-card-updown">
        <button onclick="event.stopPropagation();moveProject('${p.id}',-1)" title="위로" ${i===0?'disabled':''}>▲</button>
        <button onclick="event.stopPropagation();moveProject('${p.id}',1)" title="아래로" ${i===list.length-1?'disabled':''}>▼</button>
      </div>
      <button class="project-card-del" onclick="event.stopPropagation();deleteProject('${p.id}','${esc(p.name)}')" title="삭제">✕</button>
      <button class="project-card-edit" onclick="event.stopPropagation();showEditModal('${p.id}')" title="수정">✏️</button>
      <div class="project-card-name">📋 ${esc(p.name)}</div>
      <div class="project-card-desc">${esc(p.description||'')}</div>
      <div class="project-card-meta">${cardMetaHtml(p)}</div>
      ${children.length?`<button class="tree-expand-btn" id="tt-${p.id}" data-count="${children.length}" data-kind="plan" onclick="event.stopPropagation();toggleTree('${p.id}',false)">${pOpen?'▲ 팀/조별 담당 접기':'▼ 팀/조별 담당 펼쳐 보기'}</button>`:''}
      ${children.some(isTeamCard)?`<button class="subplan-btn" onclick="event.stopPropagation();rotateAreaTeams('${p.id}')" title="구역별 담당 팀을 순환 (1팀 구역→3팀, 2팀 구역→1팀, 3팀 구역→2팀)">🔄 담당 팀 순환</button> `:''}<button class="subplan-btn" onclick="event.stopPropagation();generateSubPlans('${p.id}')" title="엑셀의 팀/조 값 기준으로 조별 세분계획을 생성하거나 갱신합니다">🗂 조별 세분계획 ${children.length?'갱신':'생성'}</button>`;
    card.onclick=()=>openProject(p);
    frag.appendChild(card);
    if(!children.length)return;
    // ── 하위 트리: 팀 노드 → 그 아래 소속 조 노드, 팀 없는 조는 부모 바로 아래 ──
    const wrap=document.createElement('div');
    wrap.className='tree-children';wrap.id='tw-'+p.id;
    wrap.style.display=pOpen?'flex':'none';
    const teams=children.filter(isTeamCard);
    const under=t=>children.filter(sp=>sp.id!==t.id&&String(sp.filter_group||'').startsWith(String(t.filter_group||'')+' '));
    teams.forEach(t=>{
      const jos=under(t);
      wrap.appendChild(_subPlanCard(t,true,jos.length));
      if(jos.length){
        const tw=document.createElement('div');
        tw.className='tree-children';tw.id='tw-'+t.id;
        tw.style.display=_treeIsOpen(t.id,true)?'flex':'none';
        jos.forEach(j=>tw.appendChild(_subPlanCard(j,false,0)));
        wrap.appendChild(tw);
      }
    });
    children.filter(sp=>!isTeamCard(sp)&&!hasTeamParent(sp)).forEach(j=>wrap.appendChild(_subPlanCard(j,false,0)));
    frag.appendChild(wrap);
  });
  grid.appendChild(frag);
}
// 세분계획(팀/조) 카드 한 장 생성
function _subPlanCard(sp,isTeam,childCount){
  const sc=document.createElement('div');
  sc.className='project-card subplan'+(isTeam?' team':'');
  sc.id='pcard-'+sp.id;
  sc.dataset.id=sp.id;
  const open=_treeIsOpen(sp.id,true);
  sc.innerHTML=`
    <button class="project-card-del" onclick="event.stopPropagation();deleteProject('${sp.id}','${esc(sp.name)}')" title="삭제">✕</button>
    <div class="project-card-name">${isTeam?'🏢':'👥'} ${esc(sp.name)}${isTeam?` <span style="font-size:12px;font-weight:700;color:${sp.assigned_team?'var(--lo)':'var(--mt)'}">· 담당 ${esc(sp.assigned_team||'미지정')}</span>`:''}${isTeam?`<button class="subplan-btn" style="margin:0 0 0 6px;padding:1px 7px" onclick="event.stopPropagation();setAreaTeam('${sp.id}')" title="이 구역의 담당 팀 지정">변경</button>`:''}</div>
    <div class="project-card-meta">${cardMetaHtml(sp)}</div>
    ${isTeam&&childCount?`<button class="tree-expand-btn" id="tt-${sp.id}" data-count="${childCount}" data-kind="team" onclick="event.stopPropagation();toggleTree('${sp.id}',true)">${open?'▲ 조 목록 접기':`▼ ${childCount}개 조 펼치기`}</button>`:''}`;
  sc.onclick=()=>openProject(sp);
  return sc;
}
// ── 트리 접기/펼치기 ──
let _treeOpen={};
try{_treeOpen=JSON.parse(safeStorage.get('hy_tree_open','{}'))||{};}catch(e){_treeOpen={};}
function _treeIsOpen(id,def){return (id in _treeOpen)?!!_treeOpen[id]:def;}
function toggleTree(id,def){
  _treeOpen[id]=!_treeIsOpen(id,def);
  safeStorage.set('hy_tree_open',JSON.stringify(_treeOpen));
  const w=document.getElementById('tw-'+id);
  const t=document.getElementById('tt-'+id);
  if(w)w.style.display=_treeOpen[id]?'flex':'none';
  if(t){
    const n=t.dataset.count||'';
    if(t.dataset.kind==='team'){
      t.textContent=_treeOpen[id]?'▲ 조 목록 접기':`▼ ${n}개 조 펼치기`;
    }else{
      t.textContent=_treeOpen[id]?'▲ 팀/조별 담당 접기':'▼ 팀/조별 담당 펼쳐 보기';
    }
  }
}
// 드래그가 잘 안 될 때를 위한 대안: 버튼으로 한 칸씩 순서 이동
async function moveProject(id,dir){
  if(!requireAdmin())return;
  const i=projectList.findIndex(x=>String(x.id)===String(id));
  const j=i+dir;
  if(i<0||j<0||j>=projectList.length)return;
  [projectList[i],projectList[j]]=[projectList[j],projectList[i]];
  renderProjects(projectList);
  try{
    await Promise.all(projectList.map((p,idx)=>SupabaseUtil.update('hydmap_projects',{sort_order:idx},{id:p.id})));
    projectList.forEach((p,idx)=>{p.sort_order=idx;});
  }catch(e){showToast('순서 저장 실패: '+e.message,'err');}
}

function showCreateModal(){if(!requireAdmin())return;document.getElementById('projName').value='';document.getElementById('projDesc').value='';document.getElementById('projExpire').value='';showModal('createModal');}

function showEditModal(id){
  if(!requireAdmin())return;
  const p=projectList.find(x=>String(x.id)===String(id));
  if(!p){showToast('프로젝트 정보를 찾을 수 없습니다','err');return;}
  document.getElementById('editProjId').value=p.id;
  document.getElementById('editProjName').value=p.name||'';
  document.getElementById('editProjDesc').value=p.description||'';
  // 현재 만료일 표시
  const info=document.getElementById('editExpireInfo');
  if(p.expire_at){
    const exp=new Date(p.expire_at);
    const dDay=Math.ceil((exp-new Date())/(1000*60*60*24));
    info.textContent=`현재: ${exp.toLocaleDateString('ko-KR')} (${dDay>0?'D-'+dDay:'만료됨'})`;
    info.style.color=dDay<=0?'#ef4444':dDay<=30?'#fb923c':'var(--mt)';
  }else{
    info.textContent='현재: 영구 보관';
    info.style.color='var(--mt)';
  }
  document.getElementById('editProjExpire').value='';
  showModal('editModal');
}
async function saveEditProject(){
  const id=document.getElementById('editProjId').value;
  const name=document.getElementById('editProjName').value.trim();
  if(!name){showToast('프로젝트명을 입력하세요','err');return;}
  const desc=document.getElementById('editProjDesc').value.trim();
  const expireMonths=document.getElementById('editProjExpire').value;
  const patch={name,description:desc};
  if(expireMonths===''){
    // 선택 안 함 → 기존 유지 (변경 안 함)
  }else if(expireMonths==='clear'){
    patch.expire_at=null;
  }else{
    const d=new Date();
    d.setMonth(d.getMonth()+parseInt(expireMonths));
    patch.expire_at=d.toISOString();
  }
  try{
    await SupabaseUtil.update('hydmap_projects',patch,{id});
    hideModal('editModal');
    showToast('수정됨','ok');
    loadProjects();
  }catch(e){showToast('수정 실패','err');}
}
async function createProject(){
  const name=document.getElementById('projName').value.trim();
  if(!name){showToast('프로젝트명을 입력하세요','err');return;}
  const desc=document.getElementById('projDesc').value.trim();
  const expireMonths=document.getElementById('projExpire').value;
  let expire_at=null;
  if(expireMonths){
    const d=new Date();
    d.setMonth(d.getMonth()+parseInt(expireMonths));
    expire_at=d.toISOString();
  }
  try{
    const [proj]=await SupabaseUtil.insert('hydmap_projects',{name,description:desc,expire_at});
    hideModal('createModal');
    showToast('프로젝트 생성됨','ok');
    openProject(proj);
  }catch(e){showToast('생성 실패','err');}
}
async function deleteProject(id,name){
  if(!requireAdmin())return;
  if(!confirm(`"${name}" 프로젝트를 삭제하시겠습니까?\n(모든 점검 데이터 및 사진 기록, 원본 파일이 삭제됩니다)`))return;
  try{
    showToast('삭제 중...','');
    const store=sbClient().storage;

    // 사진은 Cloudinary에 저장되므로 Storage 삭제 불필요 (DB 기록만 정리)

    // 원본 엑셀 삭제
    try{
      const {data:files}=await store.from('hydmap-files').list(String(id),{limit:10});
      if(Array.isArray(files)&&files.length){
        await store.from('hydmap-files').remove(files.map(f=>`${id}/${f.name}`));
      }
    }catch(e){console.warn('원본 엑셀 Storage 삭제 실패',e);}

    // DB 삭제 (CASCADE 없을 경우 대비 순서대로)
    await SupabaseUtil.remove('hydmap_photos',{inspection_id:id});
    await SupabaseUtil.remove('hydmap_memo',{inspection_id:id});
    await SupabaseUtil.remove('hydmap_done',{inspection_id:id});
    await SupabaseUtil.remove('hydmap_records',{inspection_id:id});
    await SupabaseUtil.remove('hydmap_items',{inspection_id:id});
    await SupabaseUtil.remove('hydmap_projects',{id});

    showToast('프로젝트 삭제 완료','ok');
    loadProjects();
  }catch(e){showToast('삭제 실패: '+e.message,'err');}
}
