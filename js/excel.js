/* 119hyd-Map2 · js/excel.js — 엑셀 업로드 · 컬럼 재설정 · 결과 내보내기 (공통 ExcelUtil 사용) */
AppFiles.reg('js/excel.js','v3.11.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ Excel 업로드 / 컬럼 재설정 (공통 ExcelUtil.createReader 사용) ══════════ */
let excelReader=null;
let _excelMode='upload';     // 'upload'(전체 교체) | 'append'(새 번호만 추가) | 'reset' | 'export'(원본 형식으로 내려받기 — 데이터는 바꾸지 않음)
let _excelOrigFile=null;     // 업로드 모드에서 Storage에 원본 저장할 File
let _resetOpts={rec:true,done:true,memo:true,photos:true}; // 재설정 때 이어받을 기록 (끄면 지움)

function getExcelReader(){
  if(excelReader)return excelReader;
  excelReader=ExcelUtil.createReader({
    columns:[
      {id:'name',label:'이름',required:true,keywords:['이름','명칭','건물','시설','대상','name','번호','용수']},
      {id:'addr',label:'도로명주소',required:true,keywords:['도로명','주소','도로','위치','addr']},
      {id:'jibun',label:'지번주소',keywords:['지번']},
      {id:'lat',label:'위도',keywords:['위도','lat','latitude','y좌표']},
      {id:'lng',label:'경도',keywords:['경도','lng','lon','longitude','x좌표']},
      {id:'team',label:'구역',keywords:['구역','팀','team','area']},
      {id:'group',label:'조',keywords:['조','반','그룹','group']},
      {id:'type',label:'소화전 종류(식구분)',keywords:['식구분','종류','구분','소화전종류','형식']},
      {id:'extra',label:'추가정보',keywords:['비고','추가','기타','결과','검수','extra']},
    ],
    defaultHeaderRow:1,
    storageKey:'hydmap', // 새 excel.js의 앱별 컬럼 설정 저장 키 (work-div 등 다른 앱과 localStorage 분리)
    confirmLabel:'확인',
    onConfirm:(headers,rows,mapping)=>_onExcelConfirm(headers,rows,mapping),
  });
  return excelReader;
}

// ━━ 업로드 ━━
function showUploadModal(){
  if(!requireAdmin())return;
  if(!currentProject){showToast('프로젝트를 먼저 선택하세요','err');return;}
  if(items.length>0){
    // 이미 데이터가 있으면: 추가할지 전체를 바꿀지 먼저 고른다
    document.getElementById('uploadModeCount').textContent=items.length;
    showModal('uploadModeModal');
    return;
  }
  startUpload('replace');
}
// mode: 'append' = 기존 데이터에 새 번호만 추가, 'replace' = 전체 교체
function startUpload(mode){
  hideModal('uploadModeModal');
  if(!requireAdmin()||!currentProject)return;
  if(mode==='replace'&&items.length>0){
    const ok=confirm(`이미 업로드된 소화전 ${items.length}개가 있습니다.\n전체 교체를 하면 기존 데이터(점검 기록 포함)는 모두 삭제되고 새 엑셀 내용으로 교체됩니다.\n계속하시겠습니까?`);
    if(!ok)return;
  }
  const input=document.createElement('input');
  input.type='file';
  input.accept='.xlsx,.xls,.csv,.ods,.tsv';
  input.onchange=async()=>{
    const file=input.files[0];if(!file)return;
    _excelMode=mode==='append'?'append':'upload';
    _excelOrigFile=mode==='append'?null:file; // 추가분은 원본 백업을 덮어쓰지 않는다 (원본은 '데이터 재설정'이 씀)
    await getExcelReader().open(file);
  };
  input.click();
}

// ━━ 컬럼 재설정 ━━
async function showResetColModal(){
  if(!requireAdmin())return;
  if(!currentProject){showToast('프로젝트를 먼저 선택하세요','err');return;}
  ['resetKeepRec','resetKeepDone','resetKeepMemo','resetKeepPhotos'].forEach(id=>{const el=document.getElementById(id);if(el)el.checked=true;});
  showModal('resetOptModal');
}
async function proceedReset(){
  hideModal('resetOptModal');
  const on=id=>!!document.getElementById(id)?.checked;
  _resetOpts={rec:on('resetKeepRec'),done:on('resetKeepDone'),memo:on('resetKeepMemo'),photos:on('resetKeepPhotos')};
  showToast('원본 파일 확인 중...','');
  try{
    const file=await fetchOriginalFile(); // export-original.js
    _excelMode='reset';
    _excelOrigFile=null; // 재설정 시 원본은 다시 저장하지 않음 (이미 Storage에 있음)
    await getExcelReader().open(file);
  }catch(e){
    console.error('재설정용 원본 파일 불러오기 실패:',e);
    showToast('원본 파일 불러오기 실패: '+(e?.message||''),'err');
  }
}

// ━━ 공통 확인 핸들러 (업로드/재설정 분기) ━━
async function _onExcelConfirm(headers,rows,mapping){
  // 매핑 인덱스 해석기: 구버전 excel.js는 mapping.name처럼 컬럼 id를 키로 쓰지만,
  // 신버전(동적 컬럼 지원)은 정규화된 내부 키(col._id)로 넘겨줄 수 있다.
  // 두 구조 모두에서 "이 컬럼이 시트의 몇 번째 열인지"를 얻는다.
  const _mi=id=>{
    if(mapping[id]!=null)return mapping[id];
    if(Array.isArray(mapping._dynCols)){
      const col=mapping._dynCols.find(c=>c.id===id);
      if(col&&col._id!=null&&mapping[col._id]!=null)return mapping[col._id];
    }
    return null;
  };
  const iName=_mi('name'),iAddr=_mi('addr'),iLat=_mi('lat'),iLng=_mi('lng'),
        iTeam=_mi('team'),iGroup=_mi('group'),iType=_mi('type'),iExtra=_mi('extra'),iJibun=_mi('jibun');
  console.debug('excel mapping 수신:',mapping,'→ 해석:',{iName,iAddr,iLat,iLng,iTeam,iGroup,iType,iExtra});
  if(iName==null){
    showToast('이름 컬럼이 매핑되지 않았습니다. 컬럼 설정을 확인해주세요.','err');
    return;
  }
  // 원본 형식으로 내려받기: DB는 건드리지 않고 엑셀만 만든다 (export-original.js)
  if(_excelMode==='export'){
    _excelMode='upload';
    await runExportOriginal(headers,rows,{iName,iAddr,iLat,iLng,iTeam,iGroup,iType,iJibun});
    return;
  }
  // '폐전' 칸: 원본 형식으로 받은 파일을 다시 올리면 폐전 표시가 이어지도록, 이 이름의 칸이 있으면 읽는다 (칸 연결과 무관)
  const iClosed=headers.findIndex(h=>String(h==null?'':h).trim()==='폐전');
  const parsed=rows.map(r=>{
    const typeRaw=iType!=null?String(r[iType]||'').trim():'';
    // 119hyd-inspec.html과 동일한 판별 규칙: "지상" 포함 또는 '1'/'G' → 지상식, 그 외(값이 있으면) 지하식
    // "비상" 포함 → 비상소화장치(함). 그 밖에는 "지상" 포함 또는 '1'/'G' → 지상식, 나머지(값이 있으면) 지하식
    const hydrantType=hyTypeFromText(typeRaw); // 비상소화장치 · 지하식소화장치 · 지상식 · 지하식 (hydrant-form.js)
    const extraObj={};
    // ⚠ 매핑값은 컬럼명이 아니라 "몇 번째 열인지"를 가리키는 인덱스 숫자다.
    //    그래서 실제 헤더 텍스트(headers[iExtra])를 키로 써야 "도색년월일: 2012-06-12"처럼 나온다.
    if(iExtra!=null){
      const colName=headers[iExtra]||'정보';
      extraObj[colName]=String(r[iExtra]||'').trim();
    }
    // 새 excel.js: 모달에서 사용자가 직접 추가한 커스텀 컬럼(mapping._dynCols)도 extra에 수집한다.
    // 정보카드는 extra의 모든 키-값을 동적으로 표시하므로, 컬럼이 늘어나면 카드 표시도 자동으로 늘어난다.
    // 구버전 excel.js(_dynCols 없음)에서도 그대로 동작하도록 방어적으로 처리.
    if(Array.isArray(mapping._dynCols)){
      const baseIds=new Set(['name','addr','jibun','lat','lng','team','group','type','extra']);
      mapping._dynCols.forEach(col=>{
        if(baseIds.has(col.id))return; // 기본 컬럼은 위에서 이미 처리됨
        const colIdx=mapping[col._id]??mapping[col.id];
        if(colIdx==null)return; // 시트 컬럼과 매핑 안 된 항목은 건너뜀
        const val=String(r[colIdx]||'').trim();
        if(val)extraObj[col.label||headers[colIdx]||'정보']=val;
      });
    }
    if(iJibun!=null){const j=String(r[iJibun]||'').trim();if(j)extraObj['지번주소']=j;}
    if(hydrantType)extraObj._type=hydrantType;
    if(iClosed>=0){
      const cv=String(r[iClosed]==null?'':r[iClosed]).trim();
      if(cv){
        // 날짜로 읽히면 그 날짜, 엑셀 날짜 숫자(예: 46305)면 날짜로 바꾸고, 그 밖의 글자("폐전", "O" 등)면 오늘로
        let cd=/^\d{5}(\.\d+)?$/.test(cv)?new Date(Date.UTC(1899,11,30)+parseFloat(cv)*86400000):new Date(cv);
        if(isNaN(cd)||cd.getFullYear()<2000||cd.getFullYear()>2100)cd=new Date();
        extraObj._closed_at=cd.toISOString();extraObj._closed_by='';
      }
    }
    // 엑셀에 위도/경도 컬럼이 매핑되어 있으면 그 값을 바로 사용 (지오코딩보다 정확함).
    // 값이 없거나 숫자가 아니면 null로 두고, 이후 업로드 단계에서 주소로 지오코딩해서 채운다.
    let excelLat=null,excelLng=null;
    if(iLat!=null){const v=parseFloat(r[iLat]);if(!isNaN(v)&&v>=-90&&v<=90)excelLat=v;}
    if(iLng!=null){const v=parseFloat(r[iLng]);if(!isNaN(v)&&v>=-180&&v<=180)excelLng=v;}
    // 팀/조 결합: 두 컬럼("1팀"+"2조" 또는 "1"+"2")을 "1팀 2조" 형태로 합쳐 group_name에 저장.
    // 값이 숫자만 있으면 팀/조 접미어를 자동으로 붙인다. 조만 있거나 팀만 있으면 있는 것만 쓴다.
    let teamVal=iTeam!=null?String(r[iTeam]||'').trim():'';
    let joVal=iGroup!=null?String(r[iGroup]||'').trim():'';
    if(teamVal&&/^\d+$/.test(teamVal))teamVal+='팀';
    if(teamVal&&/^[A-Za-z]$/.test(teamVal))teamVal=teamVal.toUpperCase()+'구역'; // A → A구역
    if(joVal&&/^\d+$/.test(joVal))joVal+='조';
    const groupName=[teamVal,joVal].filter(Boolean).join(' ')||null;
    return{
      name:String(iName!=null?r[iName]:'').replace(/^\s+|\s+$/g,'').replace(/\s+/g,' '),
      address:String(iAddr!=null?r[iAddr]:'').replace(/^\s+|\s+$/g,'').replace(/\s+/g,' '),
      group_name:groupName,
      extra:Object.keys(extraObj).length?extraObj:null,
      lat:(excelLat&&excelLng)?excelLat:null,
      lng:(excelLat&&excelLng)?excelLng:null,
    };
  }).filter(d=>d.name);

  if(!parsed.length){showToast('가져올 행이 없습니다','err');return;}

  const masterN=await applyLocationMaster(parsed);
  if(masterN)showToast(`보정 위치 ${masterN}개를 적용해 올립니다`,'ok');

  try{
    if(_excelMode==='reset'){
      await _runReset(parsed);
    }else if(_excelMode==='append'){
      await _runAppend(parsed);
    }else{
      await _runUpload(parsed);
    }
  }finally{if(_uploading)upProgEnd();} // 끝나거나 실패해도 진행바를 점검 진행률로 되돌림
}

// ━━ 업로드 진행바 ━━ 사이드바의 점검 진행률 막대를 업로드·추가·재설정 중에는 업로드 진행 표시로 쓴다 (v3.10.0)
let _uploading=false;
function upProg(text,done,total){
  _uploading=true;
  const pct=total?Math.min(100,Math.round(done/total*100)):0;
  document.querySelector('.prog-wrap')?.classList.add('uploading');
  const f=document.getElementById('progFill'),t=document.getElementById('progPctText');
  if(f)f.style.width=(total?pct:100)+'%'; // 단계만 있는 표시(삭제 중 등)는 꽉 찬 막대에 글자만
  if(t)t.textContent=total?`${text} ${done}/${total} (${pct}%)`:text;
}
function upProgEnd(){
  _uploading=false;
  document.querySelector('.prog-wrap')?.classList.remove('uploading');
  updateStats(); // 다시 점검 진행률로
}

// 좌표 찾기와 저장
//   예전: 3개씩 [좌표 찾기 → 1행 저장]을 묶어 기다리고, 묶음마다 0.06초 쉼 → 868개면 저장 요청 868번
//   지금: 좌표는 5개씩 동시에(같은 주소는 한 번만, 엑셀에 위도·경도가 있으면 건너뜀), 저장은 100행씩 묶어서
//         묶음 저장이 실패하면 그 묶음만 한 행씩 다시 시도해 어느 소화전이 실패했는지 알려 준다
const GEO_WORKERS=5,INSERT_CHUNK=100;
async function _insertParsedItems(parsed,pid,verb,outRows){ // outRows: 넣은 행(새 id 포함)을 담아 받을 배열 (재설정이 씀)
  let ok=0;
  const errors=[]; // {name, message}
  // ① 좌표 찾기 (엑셀에 위도·경도가 없는 것만)
  const addrs=[...new Set(parsed.filter(d=>!(d.lat&&d.lng)&&d.address).map(d=>d.address))];
  const geo=new Map();
  if(addrs.length){
    let gi=0,gdone=0;
    upProg(`${verb}: 좌표 찾는 중`,0,addrs.length);
    const worker=async()=>{
      while(gi<addrs.length){
        const a=addrs[gi++];
        try{geo.set(a,await geocodeAddr(a));}catch{geo.set(a,null);}
        gdone++;
        if(gdone%5===0||gdone===addrs.length)upProg(`${verb}: 좌표 찾는 중`,gdone,addrs.length);
      }
    };
    await Promise.all(Array.from({length:Math.min(GEO_WORKERS,addrs.length)},worker));
  }
  // ② 저장 (100행씩)
  const recs=parsed.map(d=>{
    let lat=d.lat,lng=d.lng;
    if(!(lat&&lng)){const g=geo.get(d.address);lat=g?g.lat:null;lng=g?g.lng:null;}
    return {inspection_id:pid,name:d.name,address:d.address,group_name:d.group_name||null,lat,lng,extra:d.extra||null,loc_fixed_at:d.loc_fixed_at||null};
  });
  for(let i=0;i<recs.length;i+=INSERT_CHUNK){
    upProg(`${verb}: 저장 중`,i,recs.length);
    const chunk=recs.slice(i,i+INSERT_CHUNK);
    try{
      const got=await SupabaseUtil.insert('hydmap_items',chunk);
      ok+=chunk.length;
      if(outRows)(got||[]).forEach(r=>outRows.push(r));
    }catch(e){
      console.warn('묶음 저장 실패, 한 행씩 다시',e);
      for(const r of chunk){
        try{const got=await SupabaseUtil.insert('hydmap_items',r);ok++;if(outRows)(got||[]).forEach(x=>outRows.push(x));}
        catch(e2){console.error(`[업로드 실패] ${r.name}:`,e2);errors.push({name:r.name,message:e2?.message||String(e2)});}
      }
    }
  }
  upProg(`${verb}: 저장 완료`,recs.length,recs.length);
  if(errors.length){
    console.error(`총 ${errors.length}건 삽입 실패:`,errors);
    // 첫 실패 건의 실제 원인을 화면에 노출 (RLS/컬럼명/제약조건 오류 등을 바로 확인할 수 있도록)
    showToast(`⚠ ${errors.length}건 저장 실패 — 예: "${errors[0].name}": ${errors[0].message}`,'err');
  }
  return ok;
}

async function _runUpload(parsed){
  const pid=currentProject.id;
  let origSaveErr=null;
  // 원본 파일 Storage에 저장
  if(_excelOrigFile&&currentProject){
    try{
      const path=`${pid}/original.${_excelOrigFile.name.split('.').pop()||'xlsx'}`;
      await SupabaseUtil.uploadFile('hydmap-files',path,_excelOrigFile);
    }catch(e){
      console.error('원본 파일 저장 실패:',e);
      origSaveErr=e?.message||'알 수 없는 오류';
    }
  }

  // 기존 데이터가 있으면 새 엑셀로 완전히 교체 (중복 생성 방지)
  if(items.length>0){
    try{
      upProg('업로드: 기존 데이터 지우는 중',0,0);
      await SupabaseUtil.remove('hydmap_photos',{inspection_id:pid});
      await SupabaseUtil.remove('hydmap_memo',{inspection_id:pid});
      await SupabaseUtil.remove('hydmap_done',{inspection_id:pid});
      await SupabaseUtil.remove('hydmap_records',{inspection_id:pid});
      await SupabaseUtil.remove('hydmap_items',{inspection_id:pid});
    }catch(e){showToast('기존 데이터 삭제 실패: '+e.message,'err');return;}
  }

  const ok=await _insertParsedItems(parsed,pid,'업로드');
  if(origSaveErr){
    showToast(`${ok}/${parsed.length}개 업로드 완료 (⚠ 원본 백업 실패: ${origSaveErr})`,'err');
  }else{
    showToast(`${ok}/${parsed.length}개 업로드 완료`,'ok');
  }
  await loadProjectData();
}

// 번호 비교용: "금천-001595" · "금천-1595" · "001595"를 같은 것으로 본다 (지역명이 서로 다르게 적혀 있으면 다른 것)
function _nameKey(name){
  const s=String(name||'').replace(/\s+/g,'');
  const m=s.match(/^(.*?)[-_]?(\d+)$/);
  return m?{pre:m[1],num:String(+m[2])}:{pre:s,num:null};
}
// 추가 업로드: 엑셀에서 아직 없는 번호만 넣는다. 기존 소화전과 점검 기록은 건드리지 않는다.
async function _runAppend(parsed){
  const pid=currentProject.id;
  const have=new Map(); // 숫자 → 지역명 집합
  const seenRaw=new Set();
  const add=(k,raw)=>{if(k.num===null)seenRaw.add(raw);else{if(!have.has(k.num))have.set(k.num,new Set());have.get(k.num).add(k.pre);}};
  const has=(k,raw)=>k.num===null?seenRaw.has(raw):(have.has(k.num)&&(k.pre===''||have.get(k.num).has(k.pre)||have.get(k.num).has('')));
  items.forEach(d=>add(_nameKey(d.name),String(d.name).trim()));
  const fresh=[];let exist=0;
  parsed.forEach(d=>{
    const raw=String(d.name).trim(),k=_nameKey(raw);
    if(has(k,raw)){exist++;return;} // 이미 있는 번호(또는 엑셀 안에서 중복된 번호)는 건너뜀
    add(k,raw);fresh.push(d);
  });
  if(!fresh.length){showToast(`추가할 새 번호가 없습니다 (엑셀 ${parsed.length}개 모두 이미 있는 번호)`,'');return;}
  const sample=fresh.slice(0,5).map(d=>d.name).join(', ')+(fresh.length>5?' …':'');
  if(!confirm(`엑셀 ${parsed.length}개 중 새 번호 ${fresh.length}개를 추가합니다.\n(${sample})\n\n이미 있는 ${exist}개는 건너뜁니다. 기존 점검 기록은 그대로 둡니다.\n계속할까요?`))return;
  const oldGroups=new Set(groups);
  const ok=await _insertParsedItems(fresh,pid,'추가');
  await loadProjectData();
  const newG=groups.filter(g=>!oldGroups.has(g));
  showToast(`✅ ${ok}/${fresh.length}개 추가 · 기존 ${exist}개는 그대로`+(newG.length?` · 새 조(${newG.join(', ')})가 생겼습니다 — 홈에서 세분계획을 갱신하세요`:''),ok===fresh.length?'ok':'err');
}

/* ══════════ 엑셀 재설정 — 기록 이어받기 (v3.11.0) ══════════
   예전 방식: 기존 소화전을 모두 지우고 새로 넣었다. 점검 기록(완료·메모·사진·점검 입력)은 소화전 id에 묶여 있어
   새 소화전으로 옮겨 갈 수 없었고, DB 연결(외래키) 때문에 기록이 하나라도 있으면 소화전을 지울 수 없어 재설정이 실패했다.
   지금 방식:
     ① 새 소화전을 먼저 넣는다 (하나라도 실패하면 새로 넣은 것을 지우고 멈춤 — 기존 데이터는 그대로)
     ② 시설번호가 같은 기존 소화전(_nameKey: 금천-001595 = 금천-1595 = 001595)과 짝지어
        고른 기록과 변경 이력의 소화전 id를 새 것으로 바꾼다. 폐전 표시도 옮긴다.
     ③ 남은 기록(짝이 없거나 이어받지 않기로 한 것)을 지우고, 기존 소화전을 지운다. */
// 여러 요청을 n개씩 동시에
async function _runPool(tasks,n,onDone){
  let i=0,done=0;
  const worker=async()=>{while(i<tasks.length){const t=tasks[i++];await t();done++;onDone?.(done,tasks.length);}};
  await Promise.all(Array.from({length:Math.min(n,tasks.length)},worker));
}
// id 목록을 나눠서 지우기 (한 번에 너무 많은 id를 주소에 넣지 않도록 200개씩)
async function _deleteByIds(table,col,ids,extraEq){
  const c=SupabaseUtil.getClient();
  for(let i=0;i<ids.length;i+=200){
    let q=c.from(table).delete().in(col,ids.slice(i,i+200));
    if(extraEq)Object.entries(extraEq).forEach(([k,v])=>{q=q.eq(k,v);});
    const {error}=await q;
    if(error)throw new Error(`${table} 삭제: ${error.message}`);
  }
}
async function _runReset(parsed){
  const pid=currentProject.id;
  const keep=_resetOpts;
  const olds=items.slice(); // 지금 불러온 기존 소화전 (1000개 넘어도 전부 — sbSelectAll)
  try{
    // 새로 선택한 원본 파일을 Storage에 백업 (실패해도 재설정 자체는 계속 진행)
    if(_excelOrigFile){
      try{
        const path=`${pid}/original.${_excelOrigFile.name.split('.').pop()||'xlsx'}`;
        await SupabaseUtil.uploadFile('hydmap-files',path,_excelOrigFile);
      }catch(e){console.warn('원본 파일 백업 저장 실패 (재설정은 계속 진행됨)',e);}
    }
    // ① 새 소화전 넣기
    const news=[];
    const ok=await _insertParsedItems(parsed,pid,'재설정',news);
    if(ok<parsed.length||news.length<ok){
      upProg('재설정: 실패 — 새로 넣은 것 되돌리는 중',0,0);
      const ids=news.map(r=>r.id).filter(x=>x!=null);
      try{await _deleteByIds('hydmap_items','id',ids);}catch(e){console.error('되돌리기 실패',e);}
      showToast(`재설정을 멈췄습니다 — 새 소화전 ${parsed.length-ok}개 저장 실패. 기존 데이터는 그대로입니다`,'err');
      await loadProjectData();
      return;
    }
    // ② 짝짓기: 시설번호가 같은 기존 소화전 → 새 소화전
    const pool=new Map(); // 번호 → [기존 소화전…]
    const keyOf=name=>{const k=_nameKey(String(name).trim());return k.num===null?'raw:'+String(name).trim():'n:'+k.num;};
    olds.forEach(o=>{const k=keyOf(o.name);if(!pool.has(k))pool.set(k,[]);pool.get(k).push(o);});
    const pairs=[]; // [기존, 새]
    news.forEach(n=>{
      const cand=pool.get(keyOf(n.name));if(!cand||!cand.length)return;
      const nk=_nameKey(String(n.name).trim());
      // 지역명까지 같은 것을 먼저, 없으면 지역명이 비어 있는 쪽과
      let j=cand.findIndex(o=>_nameKey(String(o.name).trim()).pre===nk.pre);
      if(j<0)j=cand.findIndex(o=>{const p=_nameKey(String(o.name).trim()).pre;return p===''||nk.pre==='';});
      if(j<0)return;
      pairs.push([cand[j],n]);cand.splice(j,1);
    });
    // 변경 이력이 있는 기존 소화전 (이력은 항상 이어받음)
    let histIds=new Set();
    try{histIds=new Set((await sbSelectAll('hydmap_history',{eq:{inspection_id:pid},columns:'item_id'})).map(h=>h.item_id));}
    catch(e){console.warn('이력 조회 실패 — 이력은 옮기지 않음',e);}
    const c=SupabaseUtil.getClient();
    const move=(table,o,n)=>async()=>{
      const {error}=await c.from(table).update({item_id:n.id}).eq('item_id',o.id).eq('inspection_id',pid);
      if(error)throw new Error(`${table} 이어받기: ${error.message}`);
    };
    const tasks=[];
    let cnt={rec:0,done:0,memo:0,photos:0,closed:0};
    pairs.forEach(([o,n])=>{
      if(keep.rec&&hydrantMap[o.id]){tasks.push(move('hydmap_records',o,n));cnt.rec++;}
      if(keep.done&&doneMap[o.id]){tasks.push(move('hydmap_done',o,n));cnt.done++;}
      if(keep.memo&&memoMap[o.id]){tasks.push(move('hydmap_memo',o,n));cnt.memo++;}
      if(keep.photos&&photoMap[o.id]?.length){tasks.push(move('hydmap_photos',o,n));cnt.photos++;}
      if(histIds.has(o.id))tasks.push(move('hydmap_history',o,n));
      // 폐전 표시: 새 엑셀에 '폐전' 칸이 없어 표시가 빠졌으면 옮김
      if(isClosed(o)&&!(n.extra&&n.extra._closed_at)){
        const extra={...(n.extra||{}),_closed_at:o.extra._closed_at,_closed_by:o.extra._closed_by||''};
        tasks.push(async()=>{await SupabaseUtil.update('hydmap_items',{extra},{id:n.id});});
        cnt.closed++;
      }
    });
    upProg('재설정: 기록 이어받는 중',0,tasks.length);
    await _runPool(tasks,6,(d,t)=>{if(d%5===0||d===t)upProg('재설정: 기록 이어받는 중',d,t);});
    // ③ 남은 기록과 기존 소화전 지우기
    const oldIds=olds.map(o=>o.id);
    upProg('재설정: 남은 기록 정리 중',0,0);
    for(const t of ['hydmap_records','hydmap_done','hydmap_memo','hydmap_photos'])await _deleteByIds(t,'item_id',oldIds,{inspection_id:pid});
    upProg('재설정: 기존 소화전 지우는 중',0,0);
    await _deleteByIds('hydmap_items','id',oldIds,{inspection_id:pid});
    const unmatched=olds.length-pairs.length;
    showToast(`✅ 재설정 완료 — 새 소화전 ${ok}개 · 이어받음: 점검 입력 ${cnt.rec} · 완료 ${cnt.done} · 메모 ${cnt.memo} · 사진 ${cnt.photos}`
      +(cnt.closed?` · 폐전 ${cnt.closed}`:'')+(unmatched?` · 새 엑셀에 없는 기존 소화전 ${unmatched}개는 지움`:''),'ok');
    await loadProjectData();
  }catch(e){
    console.error('재설정 오류',e);
    showToast('재설정 중 오류: '+e.message+' — 화면을 다시 불러옵니다. 결과를 확인해 주세요','err');
    await loadProjectData();
  }
}

/* ══════════ Excel Export ══════════ */
async function exportExcel(){
  const stamp=localDate().replace(/-/g,''); // 파일 이름의 날짜 (이 기기 시간대 기준)
  const typeLabel=HY_TYPE_LABEL; // 지상식 · 지하식 · 비상소화장치
  const yesMidNo={yes:'양호',mid:'보통',no:'재도색'};
  const insulLabel={yes:'설치됨',mid:'불필요',no:'재설치'};
  const protectLabel={yes:'설치',no:'미설치'};
  const allRows=items.map(d=>{
    const rec=hydrantMap[d.id];
    return{
      '수정여부':rec?'✏️ 수정됨':'',
      '이름':d.name,'도로명주소':d.address||'','지번주소':d.extra?.['지번주소']||'','그룹':d.group_name||'',
      '소화전종류':typeLabel[rec?.hydrant_type]||'',
      '도색상태':yesMidNo[rec?.paint]||'',
      '보온상태':insulLabel[rec?.insul]||'',
      '보호틀':protectLabel[rec?.protect]||'',
      '노면표시':rec?.roadmark||'',
      '사용가부':rec?.result||'',
      '고장내용':rec?.defect_detail||'',
      '점검자':rec?.insp_name||'',
      '점검(입력)일':rec?.insp_date||'',
      '점검완료':doneMap[d.id]?'○':'',
      '완료체크일자':doneMap[d.id]?.done_at?new Date(doneMap[d.id].done_at).toLocaleDateString('ko-KR'):'',
      '메모':memoMap[d.id]||'',
      '사진수':(photoMap[d.id]?.length)||0,
      '폐전':isClosed(d)?(new Date(d.extra._closed_at).toLocaleDateString('ko-KR')||'폐전'):'',
      // 현재 좌표(위치 수정 시 바뀐 값) — 다른 시스템/엑셀로 옮길 때 쓰도록 출력
      '위도':d.lat?+d.lat.toFixed(7):'',
      '경도':d.lng?+d.lng.toFixed(7):'',
      '위치수정일':d.loc_fixed_at?new Date(d.loc_fixed_at).toLocaleDateString('ko-KR'):'',
    };
  });
  // 폐전은 완료/미완료 시트에서 빼고 따로 '폐전' 시트에 모은다 (전체현황에는 '폐전' 칸과 함께 남음)
  const doneRows=allRows.filter((_,i)=>!!doneMap[items[i].id]&&!isClosed(items[i]));
  const undoneRows=allRows.filter((_,i)=>!doneMap[items[i].id]&&!isClosed(items[i]));
  const closedRows=allRows.filter((_,i)=>isClosed(items[i]));
  const modifiedRows=allRows.filter((_,i)=>!!hydrantMap[items[i].id]);
  const locFixedRows=allRows.filter((_,i)=>!!items[i].loc_fixed_at);
  let histRows=[];
  try{
    const hs=await SupabaseUtil.select('hydmap_history',{eq:{inspection_id:currentProject.id},order:{column:'created_at',ascending:true}});
    const strip=t=>String(t||'').replace(/<br>/g,' / ').replace(/<[^>]+>/g,'').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
    histRows=(hs||[]).map(h=>({'일시':_histTime(h.created_at),'점검자':h.actor||'','시설번호':h.item_name||'','항목':h.action,'내용':strip(_histText(h))}));
  }catch(e){console.warn('변경이력 조회 실패',e);}
  await ExcelUtil.download([
    {name:'전체현황',rows:allRows},
    {name:'수정됨(점검입력완료)',rows:modifiedRows.length?modifiedRows:[{'안내':'점검 입력된 항목 없음'}]},
    {name:'점검완료',rows:doneRows.length?doneRows:[{'안내':'완료 없음'}]},
    {name:'미완료',rows:undoneRows.length?undoneRows:[{'안내':'미완료 없음'}]},
    {name:'위치수정됨',rows:locFixedRows.length?locFixedRows:[{'안내':'위치를 수정한 소화전 없음'}]},
    {name:'폐전',rows:closedRows.length?closedRows:[{'안내':'폐전으로 표시한 소화전 없음'}]},
    {name:'변경이력',rows:histRows.length?histRows:[{'안내':'기록된 변경 이력 없음'}]},
  ],`${currentProject?.name||'점검결과'}_${stamp}.xlsx`);
  showToast('📊 엑셀 저장 완료','ok');
}

// ━━ 원본 파일 다운로드 ━━
