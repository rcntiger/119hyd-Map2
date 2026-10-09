/* 119hyd-Map2 · js/location-master.js — 위치 원장 (hydmap_locations) */
AppFiles.reg('js/location-master.js','v3.2.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 위치 원장 (hydmap_locations) ══════════
   위치를 고치면 계획과 별개로 '시설번호 → 보정 위치'를 원장에 저장한다.
   새 계획에 엑셀을 올리거나 데이터를 재설정할 때 원장에 있는 시설번호는 보정 위치를 자동 적용.
   같은 Supabase를 쓰는 다른 앱(119hyd-inspec 등)도 이 표를 읽어 쓸 수 있다. */
let _locWarned=false;
function saveLocationMaster(d,method){
  if(!d||!d.name||!d.lat||!d.lng)return;
  const row={name:d.name,lat:d.lat,lng:d.lng,address:d.address||null,jibun:d.extra?.['지번주소']||null,
             fixed_at:d.loc_fixed_at||new Date().toISOString(),method:method||null,updated_by:getInspName()||null};
  const c=SupabaseUtil.getClient();
  c.from('hydmap_locations').upsert(row,{onConflict:'name'}).then(({error})=>{
    if(error){console.warn('위치 원장 저장 실패',error);
      if(!_locWarned){_locWarned=true;showToast('위치 원장에 저장되지 않았습니다 — hydmap_locations 표가 있는지 확인하세요','err');}}
  });
}
// 업로드할 목록(parsed)에 원장의 보정 위치를 덮어씀. 적용한 개수를 돌려준다.
async function applyLocationMaster(parsed){
  let rows=[];
  try{
    // Supabase는 한 번에 최대 1000행만 돌려주므로 나눠서 모두 가져온다
    const c=SupabaseUtil.getClient();
    for(let from=0;;from+=1000){
      const {data,error}=await c.from('hydmap_locations').select('*').order('name').range(from,from+999);
      if(error)throw error;
      rows=rows.concat(data||[]);
      if(!data||data.length<1000)break;
    }
  }catch(e){console.warn('위치 원장 조회 실패',e);return 0;}
  if(!rows.length)return 0;
  const map=new Map(rows.map(r=>[String(r.name).trim(),r]));
  const hits=parsed.filter(d=>map.has(String(d.name).trim()));
  if(!hits.length)return 0;
  if(!confirm(`이전에 위치를 보정한 소화전이 ${hits.length}개 있습니다.\n엑셀 좌표 대신 보정된 위치·주소를 적용할까요?\n(취소하면 엑셀 좌표 그대로 올립니다)`))return 0;
  hits.forEach(d=>{
    const r=map.get(String(d.name).trim());
    d.lat=+r.lat;d.lng=+r.lng;
    if(r.address)d.address=r.address;
    if(r.jibun)d.extra={...(d.extra||{}),'지번주소':r.jibun};
    d.loc_fixed_at=r.fixed_at||null;
  });
  return hits.length;
}
