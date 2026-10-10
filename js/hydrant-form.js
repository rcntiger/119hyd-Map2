/* 119hyd-Map2 · js/hydrant-form.js — 정보카드 안의 소화전 점검 입력 · 자동 저장 */
AppFiles.reg('js/hydrant-form.js','v3.7.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 소화전 점검 입력 (정보카드 내) ══════════ */
// ━━ 정보카드 컴팩트 UX: 선택사항(도색/보온/보호틀) 항목을 접이식으로 ━━
// 필수(종류·사용가부)만 항상 펼쳐두고, 나머지는 "입력" 버튼 → 탭하면 펼쳐지고
// 값을 고르면 자동으로 다시 접혀서, 모바일에서 카드가 화면을 다 차지하지 않도록 한다.
let hyExpanded={}; // key: `${idx}:${field}` → true면 펼침
const PAINT_LABEL={yes:'양호',mid:'보통',no:'재도색'};
const INSUL_LABEL={yes:'설치됨',mid:'불필요',no:'재설치'};
const PROTECT_LABEL={yes:'설치',no:'미설치'};
function hyToggleSection(idx,field){
  const key=`${idx}:${field}`;
  hyExpanded[key]=!hyExpanded[key];
  hyReRender(idx);
}
// summaryText: 이미 선택된 값이 있으면 그 값을 라벨로 보여주고, 없으면 "입력"만 표시
function hyCollapsibleField(idx,field,title,labelMap,rawValue,expandedHtml){
  const key=`${idx}:${field}`;
  const isOpen=!!hyExpanded[key];
  const summary=labelMap?(labelMap[rawValue]||''):(rawValue||'');
  if(!isOpen){
    return `
    <div class="hy-section hy-collapsible">
      <button class="hy-collapse-btn" onclick="hyToggleSection(${idx},'${field}')">
        <span>${title}</span>
        <span class="hy-collapse-val">${summary?esc(summary):'입력'} ▾</span>
      </button>
    </div>`;
  }
  return `
    <div class="hy-section hy-collapsible open">
      <button class="hy-collapse-btn open" onclick="hyToggleSection(${idx},'${field}')">
        <span>${title}</span>
        <span class="hy-collapse-val">접기 ▴</span>
      </button>
      <div class="hy-collapse-body">${expandedHtml}</div>
    </div>`;
}
function hyStatusInfo(rec){
  const r=rec?.result;
  if(!r)return{label:'🔲 미점검',bg:'#94a3b822',fg:'#64748b'};
  if(['A','B','C','D'].includes(r))return{label:`✅ 양호 (${r}등급)`,bg:'#22c55e22',fg:'#16a34a'};
  if(r==='이상없음')return{label:'✅ 이상 없음',bg:'#22c55e22',fg:'#16a34a'};   // 비상소화장치
  if(r==='이상있음')return{label:'⚠️ 이상 있음',bg:'#ef444422',fg:'#dc2626'};  // 비상소화장치
  if(r==='불량사용가')return{label:'🔧 고장·사용가능',bg:'#f59e0b22',fg:'#b45309'};
  if(r==='불량사용불가')return{label:'⛔ 고장·사용불가',bg:'#ef444422',fg:'#dc2626'};
  return{label:'🔲 미점검',bg:'#94a3b822',fg:'#64748b'};
}
// 엑셀에서 자동 판별된 종류(_type)가 있으면 그걸 쓰고, 없으면 다른 추가정보 필드(예: '정보'
// 컬럼에 "지하식(일반)"처럼 들어간 경우)라도 지상/지하 키워드를 뒤져서 판별한다.
// → 업로드 시 종류 컬럼을 "추가정보"로 잘못 매핑했어도 카드에서는 정상적으로 자동 인식됨.
function getExcelHydrantType(d){
  if(!d.extra)return null;
  if(d.extra._type)return d.extra._type;
  const vals=Object.entries(d.extra).filter(([k])=>!String(k).startsWith('_')).map(([,v])=>v).join(' ');
  const k=hyTypeFromText(vals);if(k==='emergency'||k==='ugdevice')return k; // 비상소화장치 · 지하식소화장치
  if(/지상/.test(vals))return 'ground';
  if(/지하/.test(vals))return 'underground';
  return null;
}
// 시설 종류는 올린 데이터(엑셀)로 정해진다. 데이터에 종류가 없을 때만 저장된 점검 기록의 값을 쓴다.
function hyTypeOf(d){return getExcelHydrantType(d)||hydrantMap[d.id]?.hydrant_type||null;}
function hyGetDraft(idx,d){
  if(!hyDraft[idx]){
    let rec=hydrantMap[d.id];
    const excelType=getExcelHydrantType(d);
    // 예전에 카드에서 종류를 바꿔 저장한 기록이 데이터의 종류와 점검 방식(소화전 ↔ 소화장치)까지 다르면, 그 결과 값은 쓸 수 없으므로 비운다
    if(rec&&excelType&&rec.hydrant_type&&hyIsSimpleType(rec.hydrant_type)!==hyIsSimpleType(excelType))rec={...rec,result:null,defect_detail:''};
    hyDraft[idx]={
      hydrant_type:excelType||rec?.hydrant_type||null,
      paint:rec?.paint||null,
      insul:rec?.insul||null,
      protect:rec?.protect||null,
      roadmark:rec?.roadmark||null,
      result:rec?.result||null,
      resultTop:rec?.result?(['A','B','C','D'].includes(rec.result)?'양호':rec.result):null,
      defect_detail:rec?.defect_detail||'',
      _fromExcel:!rec&&!!excelType
    };
  }
  return hyDraft[idx];
}
function hyReRender(idx){
  const d=items[idx],ov=overlays[idx];
  if(d&&!ov){ncReRender(idx);return;} // 좌표가 없어 지도 카드가 없는 항목: 화면 가운데 카드를 다시 그림
  if(!d||!ov||!ov.iw)return;
  const el=ov.iw.getContent&&ov.iw.getContent();
  if(el){renderPopup(el,idx,d,ov.iw);ov.popupRendered=true;}
}
// 종류 고르기 — 올린 데이터에 종류가 없는 시설에서만 쓰인다 (종류가 있으면 버튼이 나오지 않고, 불러도 바뀌지 않음)
function hySetType(idx,val){
  const d=items[idx];if(!d)return;
  if(getExcelHydrantType(d))return;
  const draft=hyGetDraft(idx,d);
  const before=draft.hydrant_type;
  draft.hydrant_type=(draft.hydrant_type===val)?null:val;
  // 소화전 ↔ 비상소화장치로 바꾸면 점검 항목이 달라지므로 고른 결과를 비운다
  if(hyIsSimpleType(before)!==hyIsSimpleType(draft.hydrant_type)){draft.result=null;draft.resultTop=null;draft.defect_detail='';}
  hyReRender(idx);
  hyMaybeAutoSave(idx);
}
function hySetField(idx,field,val){
  const d=items[idx];if(!d)return;
  const draft=hyGetDraft(idx,d);
  if(field==='defect_detail'){draft.defect_detail=val;return;}
  draft[field]=(draft[field]===val)?null:val;
  // 값 하나를 고르면 해당 접이식 섹션은 자동으로 접어서 카드를 다시 컴팩트하게 만든다.
  // (단, 보호틀·노면표시는 항목이 2개라 하나 고르자마자 접으면 나머지를 못 고르니 자동 접힘 제외)
  if(field==='paint'||field==='insul'){
    hyExpanded[`${idx}:${field}`]=false;
  }
  hyReRender(idx);
  hyMaybeAutoSave(idx);
}
function hySetResultTop(idx,val){
  const d=items[idx];if(!d)return;
  const draft=hyGetDraft(idx,d);
  draft.resultTop=(draft.resultTop===val)?null:val;
  if(draft.resultTop==='양호'){
    if(!['A','B','C','D'].includes(draft.result))draft.result=null;
  }else if(draft.resultTop){
    draft.result=draft.resultTop;
  }else{
    draft.result=null;
  }
  hyReRender(idx);
  hyMaybeAutoSave(idx);
}
/* ── 소화장치 2종: 이상유무만 점검하는 종류 ──
   emergency = 비상소화장치: 소화전을 쓰는 데 필요한 물품을 넣어 둔 함
   ugdevice  = 지하식소화장치: 소화전과 소방호스릴이 한 몸으로 된 지하 설비
   둘 다 도색·보온·보호틀·사용가부 점검은 없고 이상유무와 메모만 기록한다.
   저장: hydmap_records에 hydrant_type='emergency'|'ugdevice', result='이상없음'|'이상있음', defect_detail=이상 내용 */
const HY_TYPE_LABEL={ground:'지상식',underground:'지하식',emergency:'비상소화장치',ugdevice:'지하식소화장치'};
const HY_SIMPLE={
  emergency:{hint:'함과 보관 물품',ex:'호스 1본 없음, 함 잠금장치 파손'},
  ugdevice:{hint:'소화전 · 호스릴',ex:'호스릴 인출 불량, 뚜껑 파손'}
};
function hyIsSimpleType(t){return t==='emergency'||t==='ugdevice';}
// 엑셀 종류 칸 등의 글자에서 종류 판별. "지하식소화장치"에는 "지하"가 들어 있으므로 소화장치를 먼저 본다.
function hyTypeFromText(s){
  s=String(s||'');
  if(/비상/.test(s))return 'emergency';
  if(/소화\s*장치|호스\s*릴/.test(s))return 'ugdevice'; // 비상이 아닌 소화장치 = 지하식소화장치(소화전+호스릴 일체형)
  if(/지상|^1$|^G$/i.test(s))return 'ground';
  return s?'underground':null;
}
function hyIsEmergency(d){return hyTypeOf(d)==='emergency';}
const HY_TYPE_ICON={ground:'🔴',underground:'🔵',emergency:'🧰',ugdevice:'🌀'};
// 카드의 종류 표시: 데이터에 종류가 있으면 글자로만 보여 주고, 없을 때만 고르는 버튼을 낸다
function hyTypeView(idx,d,draft,title,right){
  const fixed=getExcelHydrantType(d);
  if(fixed)return `<div class="hy-type-fixed"><span class="hy-type-k">${title}</span><b>${HY_TYPE_ICON[fixed]||''} ${HY_TYPE_LABEL[fixed]||fixed}</b>${right||''}</div>`;
  return `<div class="hy-label" style="display:flex;align-items:baseline;gap:6px">${title}<span style="color:#dc2626;font-weight:800">(데이터에 없음 · 선택)</span>${right||''}</div>
      ${hyTypeButtons(idx,draft)}`;
}
// 종류 버튼: 윗줄 소화전(지상식·지하식), 아랫줄 소화장치(비상·지하식)
function hyTypeButtons(idx,draft){
  const b=(k,t)=>`<button class="hy-tbtn${draft.hydrant_type===k?' on':''}" onclick="hySetType(${idx},'${k}')">${t}</button>`;
  return `<div class="hy-toggle-row">${b('ground','🔴 지상식')}${b('underground','🔵 지하식')}</div>
        <div class="hy-toggle-row" style="margin-top:5px">${b('emergency','🧰 비상소화장치')}${b('ugdevice','🌀 지하식소화장치')}</div>`;
}
function hySetEmResult(idx,val){
  const d=items[idx];if(!d)return;
  const draft=hyGetDraft(idx,d);
  if(!hyIsSimpleType(draft.hydrant_type))draft.hydrant_type='emergency';
  draft.result=(draft.result===val)?null:val;
  draft.resultTop=draft.result;
  hyReRender(idx);
  hyMaybeAutoSave(idx);
}
// 소화장치(비상소화장치·지하식소화장치)용 점검 입력: 종류 + 이상유무 (+ 이상 있음이면 내용)
function hyEmergencyFormHtml(idx,draft){
  const S=HY_SIMPLE[draft.hydrant_type]||HY_SIMPLE.emergency;
  return `
    <div class="hy-section">
      ${hyTypeView(idx,items[idx],draft,'시설 종류','')}
    </div>
    <div class="hy-section" style="margin-bottom:0">
      <div class="hy-label">이상유무 <span class="hy-req">필수</span> <span style="text-transform:none;font-weight:600;color:#94a3b8">· ${S.hint}</span></div>
      <div class="hy-toggle-row">
        <button class="hy-tbtn hy-good${draft.result==='이상없음'?' on':''}" onclick="hySetEmResult(${idx},'이상없음')">이상 없음</button>
        <button class="hy-tbtn hy-bad${draft.result==='이상있음'?' on':''}" onclick="hySetEmResult(${idx},'이상있음')">이상 있음</button>
      </div>
      ${draft.result==='이상있음'?`
      <textarea class="hy-defect" placeholder="이상 내용을 입력해주세요 (예: ${S.ex})" oninput="hySetField(${idx},'defect_detail',this.value)" onblur="hySaveNow(${idx})">${esc(draft.defect_detail||'')}</textarea>`:''}
    </div>`;
}
function hySetGrade(idx,val){
  const d=items[idx];if(!d)return;
  const draft=hyGetDraft(idx,d);
  draft.result=val;
  hyReRender(idx);
  hyMaybeAutoSave(idx);
}
// ━━ 자동 저장 (디바운스 + 직렬화) ━━
// 토글을 연타해도 마지막 변경 후 600ms 뒤 1회만 저장하고, 같은 항목의 저장이 진행 중이면
// 끝난 뒤 최신 상태로 한 번 더 저장한다 (동시 upsert로 값이 꼬이는 경쟁상태 방지).
const AUTOSAVE_DEBOUNCE_MS=600;
const _autoSaveTimers={};   // idx → setTimeout id
const _saveInFlight={};     // idx → true(저장 중)
const _saveQueued={};       // idx → true(저장 중에 또 변경됨 → 끝나고 재저장)
function hyMaybeAutoSave(idx){
  const d=items[idx];if(!d)return;
  const draft=hyGetDraft(idx,d);
  if(!(draft.hydrant_type&&draft.result))return;
  clearTimeout(_autoSaveTimers[idx]);
  _autoSaveTimers[idx]=setTimeout(()=>hySaveNow(idx),AUTOSAVE_DEBOUNCE_MS);
}
async function hySaveNow(idx){
  const d=items[idx];if(!d||!currentProject)return;
  if(_saveInFlight[idx]){_saveQueued[idx]=true;return;} // 진행 중이면 예약만
  const draft=hyGetDraft(idx,d);
  if(!draft.hydrant_type||!draft.result)return; // 필수 항목 미완성 — 자동저장 대상 아님
  const name=getInspName();
  if(!name){showToast('상단에 점검자 이름을 입력하세요','err');return;}
  const record={
    item_id:d.id,
    inspection_id:currentProject.id,
    hydrant_type:draft.hydrant_type,
    paint:draft.paint,
    insul:draft.hydrant_type==='underground'?draft.insul:null,
    protect:draft.hydrant_type==='ground'?draft.protect:null,
    roadmark:draft.hydrant_type==='ground'?draft.roadmark:null,
    result:draft.result,
    defect_detail:(draft.defect_detail||'').trim(),
    insp_name:name,
    insp_date:getInspDate(),
    updated_at:new Date().toISOString()
  };
  _saveInFlight[idx]=true;
  const prevRec=hydrantMap[d.id]?{...hydrantMap[d.id]}:null;
  try{
    const saved=await SupabaseUtil.upsert('hydmap_records',record,'item_id');
    const changes=_hyDiff(prevRec,record);
    if(changes.length)logHistory(d,'점검 입력',{changes});
    hydrantMap[d.id]=Array.isArray(saved)?(saved[0]||record):(saved||record);
    // 저장 중 추가 변경이 없었을 때만 draft를 비운다 (있으면 최신 draft 유지 후 재저장)
    if(!_saveQueued[idx])delete hyDraft[idx];
    showToast('✅ 자동 저장됨','ok');
    hyReRender(idx);
    updateMarkerIcon(idx);
    updateStats();
    updateListItem(idx);
  }catch(e){showToast('저장 실패: '+(e?.message||''),'err');}
  finally{
    _saveInFlight[idx]=false;
    if(_saveQueued[idx]){_saveQueued[idx]=false;hySaveNow(idx);} // 밀린 변경 재저장
  }
}
