/* 119hyd-Map2 · js/excel.js — 엑셀 업로드 · 컬럼 재설정 · 결과 내보내기 (공통 ExcelUtil 사용) */
AppFiles.reg('js/excel.js','v3.2.4'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ Excel 업로드 / 컬럼 재설정 (공통 ExcelUtil.createReader 사용) ══════════ */
let excelReader=null;
let _excelMode='upload';     // 'upload' | 'reset'
let _excelOrigFile=null;     // 업로드 모드에서 Storage에 원본 저장할 File
let _resetOpts={delDone:false,delMemo:false,delPhotos:false};

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
    const ok=confirm(`이미 업로드된 소화전 ${items.length}개가 있습니다.\n엑셀을 다시 업로드하면 기존 데이터(점검 기록 포함)는 모두 삭제되고 새 엑셀 내용으로 교체됩니다.\n계속하시겠습니까?`);
    if(!ok)return;
  }
  const input=document.createElement('input');
  input.type='file';
  input.accept='.xlsx,.xls,.csv,.ods,.tsv';
  input.onchange=async()=>{
    const file=input.files[0];if(!file)return;
    _excelMode='upload';
    _excelOrigFile=file;
    await getExcelReader().open(file);
  };
  input.click();
}

// ━━ 컬럼 재설정 ━━
async function showResetColModal(){
  if(!requireAdmin())return;
  if(!currentProject){showToast('프로젝트를 먼저 선택하세요','err');return;}
  document.getElementById('resetDelDone').checked=false;
  document.getElementById('resetDelMemo').checked=false;
  document.getElementById('resetDelPhotos').checked=false;
  showModal('resetOptModal');
}
async function proceedReset(){
  hideModal('resetOptModal');
  _resetOpts={
    delDone:document.getElementById('resetDelDone').checked,
    delMemo:document.getElementById('resetDelMemo').checked,
    delPhotos:document.getElementById('resetDelPhotos').checked,
  };
  showToast('원본 파일 확인 중...','');
  try{
    const store=sbClient().storage;
    const {data:files,error:listErr}=await store.from('hydmap-files').list(String(currentProject.id),{limit:10});
    if(listErr)throw new Error('목록 조회 오류: '+listErr.message);
    const orig=Array.isArray(files)?files.find(f=>f.name&&f.name.startsWith('original.')):null;
    if(!orig){
      console.warn('hydmap-files 목록:',files);
      throw new Error(`원본 파일을 찾지 못했습니다 (해당 폴더에 파일 ${files?.length||0}개 있음)`);
    }
    const {data:blob,error:dlErr}=await store.from('hydmap-files').download(`${currentProject.id}/${orig.name}`);
    if(dlErr)throw new Error('다운로드 오류: '+dlErr.message);
    if(!blob)throw new Error('다운로드된 파일이 비어있습니다');
    const file=new File([blob],orig.name,{type:blob.type||'application/octet-stream'});
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
  const parsed=rows.map(r=>{
    const typeRaw=iType!=null?String(r[iType]||'').trim():'';
    // 119hyd-inspec.html과 동일한 판별 규칙: "지상" 포함 또는 '1'/'G' → 지상식, 그 외(값이 있으면) 지하식
    const hydrantType=typeRaw?(/지상|^1$|^G$/i.test(typeRaw)?'ground':'underground'):null;
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

  if(_excelMode==='reset'){
    await _runReset(parsed);
  }else{
    await _runUpload(parsed);
  }
}

// 지오코딩 + DB 삽입을 3개씩 병렬 배치로 처리 (완전 순차 대비 약 3배 빠름).
// 카카오 로컬 API 쿼터를 고려해 동시 3개로 제한하고, 배치 사이에 짧게 쉰다.
const GEOCODE_BATCH_SIZE=3;
async function _insertParsedItems(parsed,pid,verb){
  let done=0,ok=0;
  const errors=[]; // {name, message} 수집 — 지금까지 catch{}로 완전히 숨겨져서 원인을 알 수 없었음
  for(let i=0;i<parsed.length;i+=GEOCODE_BATCH_SIZE){
    const batch=parsed.slice(i,i+GEOCODE_BATCH_SIZE);
    await Promise.all(batch.map(async d=>{
      let lat=d.lat,lng=d.lng;
      // 엑셀에 이미 유효한 위도/경도가 있으면 지오코딩을 건너뛴다 (더 정확하고 더 빠름)
      if(!(lat&&lng)){
        try{const geo=await geocodeAddr(d.address);if(geo){lat=geo.lat;lng=geo.lng;}}catch{}
      }
      try{
        await SupabaseUtil.insert('hydmap_items',{inspection_id:pid,name:d.name,address:d.address,group_name:d.group_name||null,lat,lng,extra:d.extra||null,loc_fixed_at:d.loc_fixed_at||null});
        ok++;
      }catch(e){
        console.error(`[업로드 실패] ${d.name}:`,e);
        errors.push({name:d.name,message:e?.message||String(e)});
      }
      done++;
      showToast(`(${done}/${parsed.length}) ${verb} 중...`,'');
    }));
    await sleep(60);
  }
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
      showToast('기존 데이터 삭제 중...','');
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

async function _runReset(parsed){
  const pid=currentProject.id;
  const {delDone,delMemo,delPhotos}=_resetOpts;
  try{
    // 새로 선택한 원본 파일을 Storage에 백업 (실패해도 재설정 자체는 계속 진행)
    if(_excelOrigFile){
      try{
        const path=`${pid}/original.${_excelOrigFile.name.split('.').pop()||'xlsx'}`;
        await SupabaseUtil.uploadFile('hydmap-files',path,_excelOrigFile);
      }catch(e){console.warn('원본 파일 백업 저장 실패 (재설정은 계속 진행됨)',e);}
    }
    if(delPhotos){
      showToast('사진 기록 삭제 중...','');
      // 사진은 Cloudinary에 저장되므로 DB 기록만 삭제 (Cloudinary 원본은 남음)
      await SupabaseUtil.remove('hydmap_photos',{inspection_id:pid});
    }
    if(delMemo){showToast('메모 삭제 중...','');await SupabaseUtil.remove('hydmap_memo',{inspection_id:pid});}
    if(delDone){showToast('완료 기록 삭제 중...','');await SupabaseUtil.remove('hydmap_done',{inspection_id:pid});}

    showToast('기존 항목 삭제 중...','');
    await SupabaseUtil.remove('hydmap_items',{inspection_id:pid});

    const ok=await _insertParsedItems(parsed,pid,'재설정');
    showToast(`✅ 재설정 완료 (${ok}/${parsed.length}개)`,'ok');
    await loadProjectData();
  }catch(e){
    showToast('재설정 실패: '+e.message,'err');
  }
}

/* ══════════ Excel Export ══════════ */
async function exportExcel(){
  const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
  const typeLabel={ground:'지상식',underground:'지하식'};
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
      // 현재 좌표(위치 수정 시 바뀐 값) — 다른 시스템/엑셀로 옮길 때 쓰도록 출력
      '위도':d.lat?+d.lat.toFixed(7):'',
      '경도':d.lng?+d.lng.toFixed(7):'',
      '위치수정일':d.loc_fixed_at?new Date(d.loc_fixed_at).toLocaleDateString('ko-KR'):'',
    };
  });
  const doneRows=allRows.filter((_,i)=>!!doneMap[items[i].id]);
  const undoneRows=allRows.filter((_,i)=>!doneMap[items[i].id]);
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
    {name:'변경이력',rows:histRows.length?histRows:[{'안내':'기록된 변경 이력 없음'}]},
  ],`${currentProject?.name||'점검결과'}_${stamp}.xlsx`);
  showToast('📊 엑셀 저장 완료','ok');
}

// ━━ 원본 파일 다운로드 ━━
