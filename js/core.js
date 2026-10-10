/* 119hyd-Map2 · js/core.js — 기본 도구 (esc · DOM 캐시 · safeStorage · 토스트 · 모달 · sbClient) */
AppFiles.reg('js/core.js','v3.5.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ Utils & DOM Cache ══════════ */
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
const sleep=Utils.sleep;
// DOM 캐시 (반복 getElementById 호출 절감)
const _domCache={};
function $(id){return _domCache[id]||(_domCache[id]=document.getElementById(id));}
// 안전한 localStorage 접근: 사파리 프라이빗 모드, 저장공간 초과, 브라우저 정책 등으로
// setItem/getItem이 예외를 던져도 앱 전체가 멈추지 않도록 감싼다.
const safeStorage={
  get(key,fallback=''){try{return localStorage.getItem(key)??fallback;}catch(e){console.warn('localStorage 읽기 실패:',e);return fallback;}},
  set(key,val){try{localStorage.setItem(key,val);return true;}catch(e){console.warn('localStorage 저장 실패(프라이빗 모드이거나 저장공간 초과일 수 있음):',e);return false;}}
};

let _toastTimer=null;
function showToast(msg,type=''){
  const t=$('toast');
  t.textContent=msg;
  t.className=`toast show ${type}`;
  if(_toastTimer)clearTimeout(_toastTimer); // 이전 타이머가 남아있으면 새 메시지를 조기에 지워버리는 문제 방지
  const duration=type==='err'?9000:4000; // 에러 메시지는 읽을 시간을 더 준다
  _toastTimer=setTimeout(()=>{t.className='toast';_toastTimer=null;},duration);
}
function showModal(id){$(id).classList.add('open');}
function hideModal(id){$(id).classList.remove('open');}
// Supabase는 공통 모듈 SupabaseUtil 사용 (init은 DOMContentLoaded에서)
const sbClient=()=>SupabaseUtil.getClient();
