/* 119hyd-Map2 · js/init.js — 시작 (DOMContentLoaded) · 키보드 */
AppFiles.reg('js/init.js','v3.2.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ Init ══════════ */
document.addEventListener('DOMContentLoaded',()=>{
  if(!_CFG||!window.KakaoGeo){
    document.body.insertAdjacentHTML('afterbegin','<div style="position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;background:#0d1117;color:#e6edf3;padding:24px;text-align:center;font-size:15px;line-height:1.6">공통 설정 파일(common/keys.js, kakao-geo.js)을 불러오지 못했습니다.<br>인터넷 연결을 확인하고 새로고침하세요.</div>');
    return;
  }
  SupabaseUtil.init(SB_URL,SB_KEY);
  _checkAdminSession();
  try{SupabaseUtil.getClient().auth.onAuthStateChange((ev)=>{if(ev==='SIGNED_OUT')_setAdmin(false);});}catch{}
  tooltipOn=safeStorage.get('hy_tooltip_on','1')!=='0';
  _applyTooltipBtn();
  // 버전 표시: 화면 하단(캐시된 옛 버전인지 사용자가 바로 확인 가능) + 콘솔(문의 대응용)
  const verEl=document.getElementById('appVersion');
  if(verEl)verEl.textContent=`소화전 점검 지도 ${APP_VERSION}`;
  console.info(`%c🧯 소화전 점검 지도 ${APP_VERSION}`,'font-weight:bold');
  // 공유 툴팁 요소 (body에 단 하나, stacking context 문제 해결)
  _sharedTooltip=document.createElement('div');
  _sharedTooltip.className='mk-tooltip';
  document.body.appendChild(_sharedTooltip);
  document.getElementById('mapView').style.display='none';
  loadProjects();
  // 홈 화면을 보는 동안 지도 SDK를 미리 받아 둠 (카드 누른 뒤 기다리는 시간 단축)
  KakaoGeo.preload();
  // 점검자/점검일자 복원
  const nameEl=document.getElementById('inspNameGlobal');
  const dateEl=document.getElementById('inspDateGlobal');
  if(nameEl)nameEl.value=safeStorage.get('hy_insp_name');
  if(dateEl)dateEl.value=new Date().toISOString().slice(0,10); // 점검일자는 항상 오늘 날짜로 자동 입력
});

// 키보드
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(document.getElementById('rvPanel').style.display!=='none'){closeRv();return;}
    if(rvMode){setRvMode(false);return;}
    if(distMode){finishDist();return;}
    if(fixLocationIdx>=0){startFixLocation(fixLocationIdx);return;}
    closeIw();
  }
});
