/* 119hyd-Map2 · js/export-original.js — 처음 올린 엑셀과 같은 형식(칸 이름·순서)으로, 고친 내용을 채워 내려받기 */
AppFiles.reg('js/export-original.js','v3.7.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 원본 형식으로 내려받기 ══════════
   "결과 파일출력"은 앱이 정한 칸으로 나오므로, 처음 올린 대장 엑셀과 형식이 다르다.
   이 기능은 보관해 둔 원본 엑셀(hydmap-files/{계획}/original.*)을 다시 읽어
     · 원본의 칸 이름·순서·앱이 쓰지 않는 칸은 그대로 두고
     · 앱에서 고친 값(위도·경도, 주소·지번, 팀·조, 종류)만 바꿔 넣고
     · 추가 업로드로 넣은 소화전은 맨 아래에 줄을 더하고
     · 맨 뒤에 '폐전' · '위치수정일' · 점검 결과 칸을 덧붙여
   새 엑셀로 내려받는다. 받은 파일은 그대로 다시 올릴 수 있다 ('폐전' 칸은 올릴 때 폐전 표시로 이어짐).
   칸 연결은 업로드 때와 같은 컬럼 설정 창(공통 ExcelUtil)에서 확인한다 — 시트·헤더 행·칸 연결을 거기서 알 수 있기 때문.
   ⚠ 값과 구조만 옮긴다. 셀 색·테두리·병합·다른 시트는 옮기지 않는다. */

// 덧붙이는 칸 (원본에 같은 이름의 칸이 이미 있으면 그 칸에 덮어쓴다 — 받은 파일을 다시 올렸다가 또 받는 경우)
const XO_COLS=['폐전','위치수정일','점검_종류','점검_결과','점검_도색','점검_보온','점검_보호틀','점검_노면표시','점검_고장·이상내용','점검_점검자','점검_점검일','점검_완료','점검_완료일','점검_메모','점검_사진수'];

// 보관해 둔 원본 엑셀 파일 가져오기 (데이터 재설정과 같이 씀)
async function fetchOriginalFile(){
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
  return new File([blob],orig.name,{type:blob.type||'application/octet-stream'});
}
// 버튼: 원본 엑셀을 불러와 컬럼 설정 창을 연다 → [확인]을 누르면 _onExcelConfirm이 runExportOriginal을 부른다
async function exportOriginalFormat(){
  if(!requireAdmin())return;
  if(!currentProject){showToast('프로젝트를 먼저 선택하세요','err');return;}
  if(!items.length){showToast('내려받을 소화전이 없습니다','err');return;}
  showToast('원본 파일 확인 중...','');
  try{
    const file=await fetchOriginalFile();
    _excelMode='export';
    _excelOrigFile=null;
    showToast('칸 연결을 확인하고 [확인]을 누르면 원본 형식으로 내려받습니다 (데이터는 바뀌지 않습니다)','');
    await getExcelReader().open(file);
  }catch(e){
    console.error('원본 형식 내려받기 실패:',e);
    showToast('원본 파일 불러오기 실패: '+(e?.message||''),'err');
  }
}
// 팀·조 칸 글자 → 앱의 그룹 이름 (업로드 때와 같은 규칙)
function _xoGroupOf(teamCell,joCell){
  let t=String(teamCell||'').trim(), j=String(joCell||'').trim();
  if(t&&/^\d+$/.test(t))t+='팀';
  if(t&&/^[A-Za-z]$/.test(t))t=t.toUpperCase()+'구역';
  if(j&&/^\d+$/.test(j))j+='조';
  return [t,j].filter(Boolean).join(' ');
}
// 앱의 그룹 이름을 팀·조 칸에 다시 적을 글자로. 원래 칸이 숫자(또는 알파벳 한 글자)만 적는 방식이었으면 그 방식을 따른다.
function _xoSplitGroup(groupName,teamSample,joSample){
  const parts=String(groupName||'').trim().split(/\s+/).filter(Boolean);
  let t=parts[0]||'', j=parts.slice(1).join(' ');
  if(/^\d+$/.test(String(teamSample||'').trim()))t=t.replace(/팀$/,'');
  else if(/^[A-Za-z]$/.test(String(teamSample||'').trim()))t=t.replace(/구역$/,'');
  if(/^\d+$/.test(String(joSample||'').trim()))j=j.replace(/조$/,'');
  return {t,j};
}
function _xoDate(v){if(!v)return '';const d=new Date(v);return isNaN(d)?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
// 한 소화전의 덧붙이는 칸 값 (XO_COLS 순서)
function _xoExtra(d){
  const rec=hydrantMap[d.id], done=doneMap[d.id];
  const yesMidNo={yes:'양호',mid:'보통',no:'재도색'}, insul={yes:'설치됨',mid:'불필요',no:'재설치'}, protect={yes:'설치',no:'미설치'};
  return [
    isClosed(d)?(_xoDate(d.extra._closed_at)||'폐전'):'',
    _xoDate(d.loc_fixed_at),
    HY_TYPE_LABEL[rec?.hydrant_type]||'',
    rec?.result||'',
    yesMidNo[rec?.paint]||'', insul[rec?.insul]||'', protect[rec?.protect]||'', rec?.roadmark||'',
    rec?.defect_detail||'', rec?.insp_name||'', rec?.insp_date||'',
    done?'○':'', _xoDate(done?.done_at),
    memoMap[d.id]||'', (photoMap[d.id]?.length)||0
  ];
}
// 컬럼 설정 창에서 [확인]을 눌렀을 때. headers: 헤더 글자들, rows: 줄(칸 값 배열)들, ix: 각 앱 컬럼이 몇 번째 칸인지
async function runExportOriginal(headers,rows,ix){
  const H=headers.map(h=>String(h==null?'':h));
  let width=Math.max(H.length,...rows.map(r=>r.length));
  while(H.length<width)H.push('');
  // 덧붙일 칸 자리: 같은 이름이 이미 있으면 그 자리, 없으면 맨 뒤에 새로
  const col=name=>{let i=H.findIndex(h=>h.trim()===name);if(i<0){i=H.length;H.push(name);}return i;};
  // 위도·경도 칸이 연결되지 않았으면 새로 만든다 (고친 위치를 담을 곳이 있어야 하므로)
  const cLat=ix.iLat!=null?ix.iLat:col('위도'), cLng=ix.iLng!=null?ix.iLng:col('경도');
  const cX=XO_COLS.map(col);
  width=H.length;
  // 번호로 앱의 소화전 찾기 (추가 업로드와 같은 비교: "금천-001595" = "금천-1595" = "001595")
  const byNum=new Map(), byRaw=new Map();
  items.forEach(d=>{const k=_nameKey(d.name);if(k.num===null)byRaw.set(String(d.name).trim(),d);else{if(!byNum.has(k.num))byNum.set(k.num,[]);byNum.get(k.num).push({pre:k.pre,d});}});
  const find=name=>{
    const raw=String(name==null?'':name).trim();if(!raw)return null;
    const k=_nameKey(raw);
    if(k.num===null)return byRaw.get(raw)||null;
    const c=byNum.get(k.num)||[];
    return (c.find(x=>x.pre===k.pre)||c.find(x=>k.pre===''||x.pre==='')||{}).d||null;
  };
  const curType=d=>hyTypeOf(d);
  // 팀·조 칸을 적는 방식(숫자만/글자 포함)을 알기 위한 본보기 값
  const sample=i=>i==null?'':String((rows.find(r=>String(r[i]==null?'':r[i]).trim())||[])[i]||'');
  const teamSample=sample(ix.iTeam), joSample=sample(ix.iGroup);
  const fill=(out,d,isNew)=>{
    if(d.lat&&d.lng){out[cLat]=+(+d.lat).toFixed(7);out[cLng]=+(+d.lng).toFixed(7);}
    if(ix.iAddr!=null&&(isNew||d.address))out[ix.iAddr]=d.address||'';
    if(ix.iJibun!=null&&d.extra?.['지번주소'])out[ix.iJibun]=d.extra['지번주소'];
    // 팀·조: 원본 칸이 가리키는 조와 앱의 조가 다를 때만 다시 적는다 (원본 표기를 되도록 그대로 두려고)
    if(ix.iTeam!=null||ix.iGroup!=null){
      const now=String(d.group_name||'').trim();
      const was=isNew?null:_xoGroupOf(ix.iTeam!=null?out[ix.iTeam]:'',ix.iGroup!=null?out[ix.iGroup]:'');
      if(was!==now){
        const s=_xoSplitGroup(now,teamSample,joSample);
        if(ix.iTeam!=null&&ix.iGroup!=null){out[ix.iTeam]=s.t;out[ix.iGroup]=s.j;}
        else if(ix.iTeam!=null)out[ix.iTeam]=now;
        else out[ix.iGroup]=now;
      }
    }
    // 종류: 앱에서 바꾼 경우에만 다시 적는다
    if(ix.iType!=null){
      const t=curType(d);
      if(t&&(isNew||hyTypeFromText(String(out[ix.iType]==null?'':out[ix.iType]).trim())!==t))out[ix.iType]=HY_TYPE_LABEL[t]||'';
    }
    _xoExtra(d).forEach((v,k)=>{out[cX[k]]=v;});
  };
  const matched=new Set();
  const aoa=[H];
  rows.forEach(r=>{
    const out=Array.from({length:width},(_,i)=>r[i]==null?'':r[i]);
    const d=find(r[ix.iName]);
    if(d&&!matched.has(d.id)){matched.add(d.id);fill(out,d,false);}
    aoa.push(out);
  });
  // 원본에 없던 소화전(추가 업로드로 넣은 것 등)은 맨 아래에 줄을 더한다
  const added=items.filter(d=>!matched.has(d.id));
  added.forEach(d=>{
    const out=Array.from({length:width},()=>'');
    out[ix.iName]=d.name;
    fill(out,d,true);
    aoa.push(out);
  });
  const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
  const fname=`${currentProject?.name||'소화전'}_원본형식_${stamp}.xlsx`;
  if(window.XLSX&&XLSX.utils&&XLSX.utils.aoa_to_sheet&&XLSX.writeFile){
    // SheetJS가 준비돼 있으면 칸 그대로(이름이 같거나 비어 있는 칸도 원래 자리에) 쓴다
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(aoa),'소화전');
    XLSX.writeFile(wb,fname);
  }else{
    // 아니면 공통 ExcelUtil.download로. 줄을 {칸이름:값}으로 넘겨야 해서 이름이 겹치거나 빈 칸은 구별되게 바꾼다
    const seen={};
    const keys=H.map((h,i)=>{let k=h.trim()||`(빈 칸 ${i+1})`;if(/^\d+$/.test(k))k+=' ';if(seen[k]){seen[k]++;k=`${k} (${seen[k]})`;}else seen[k]=1;return k;});
    const objs=aoa.slice(1).map(r=>{const o={};keys.forEach((k,i)=>{o[k]=r[i]==null?'':r[i];});return o;});
    await ExcelUtil.download([{name:'소화전',rows:objs}],fname);
  }
  const closed=items.filter(isClosed).length;
  showToast(`📥 원본 형식으로 저장 — ${aoa.length-1}줄 (앱 데이터 반영 ${matched.size}개`+(added.length?` · 아래에 추가 ${added.length}개`:'')+(closed?` · 폐전 ${closed}개`:'')+`)`,'ok');
}
