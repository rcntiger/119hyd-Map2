/* 119hyd-Map2 · js/auth.js — 관리자 로그인 · 점검자/점검일자 */
AppFiles.reg('js/auth.js','v3.1.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 관리자 로그인 (Supabase Auth) ══════════
   로그인 세션은 SupabaseUtil의 같은 클라이언트에 붙으므로, 이후 모든 DB 요청이 관리자 권한으로 나간다.
   관리자 여부는 DB의 hydmap_admins 목록으로 판단 (hydmap_is_admin 함수) — 회원가입만 해서는 관리자가 될 수 없음. */
let isAdmin=false;
function _setAdmin(on,email){
  isAdmin=!!on;
  document.body.classList.toggle('is-admin',isAdmin);
  const who=document.getElementById('adminWho'),btn=document.getElementById('adminBtn');
  if(who){who.style.display=isAdmin?'':'none';who.textContent=isAdmin?`👤 관리자 ${email||''}`:'';}
  if(btn)btn.textContent=isAdmin?'로그아웃':'🔐 관리자';
}
async function _checkAdminSession(){
  try{
    const c=SupabaseUtil.getClient();
    const {data}=await c.auth.getSession();
    const sess=data?.session;
    if(!sess){_setAdmin(false);return;}
    const {data:ok,error}=await c.rpc('hydmap_is_admin');
    if(error)throw error;
    _setAdmin(!!ok,sess.user?.email);
  }catch(e){console.warn('관리자 확인 실패',e);_setAdmin(false);}
}
function adminButton(){
  if(isAdmin){adminLogout();return;}
  document.getElementById('adminPw').value='';
  showModal('adminModal');
  setTimeout(()=>document.getElementById(document.getElementById('adminEmail').value?'adminPw':'adminEmail').focus(),50);
}
async function adminLogin(){
  const email=document.getElementById('adminEmail').value.trim(),pw=document.getElementById('adminPw').value;
  if(!email||!pw){showToast('이메일과 비밀번호를 입력하세요','err');return;}
  const btn=document.getElementById('adminLoginBtn');btn.disabled=true;btn.textContent='확인 중...';
  try{
    const c=SupabaseUtil.getClient();
    const {error}=await c.auth.signInWithPassword({email,password:pw});
    if(error)throw error;
    const {data:ok,error:e2}=await c.rpc('hydmap_is_admin');
    if(e2)throw e2;
    if(!ok){await c.auth.signOut();showToast('관리자 권한이 없는 계정입니다','err');return;}
    _setAdmin(true,email);
    hideModal('adminModal');
    showToast('관리자로 로그인했습니다','ok');
  }catch(e){
    const m=String(e?.message||'');
    showToast(/Invalid login/i.test(m)?'이메일 또는 비밀번호가 맞지 않습니다':/hydmap_is_admin/i.test(m)?'관리자 설정(SQL)이 아직 적용되지 않았습니다':'로그인 실패: '+m,'err');
  }finally{btn.disabled=false;btn.textContent='로그인';}
}
async function adminLogout(){
  if(!confirm('관리자 로그아웃할까요?'))return;
  try{await SupabaseUtil.getClient().auth.signOut();}catch{}
  _setAdmin(false);
  if(_bf)_bfExit();
  showToast('로그아웃했습니다','');
}
// 관리자 전용 동작 앞에서 호출 (버튼이 숨겨져 있어도 다른 경로로 불릴 수 있으니 한 번 더 확인)
function requireAdmin(){
  if(isAdmin)return true;
  showToast('관리자만 할 수 있는 작업입니다. 홈 화면 오른쪽 위 🔐 관리자로 로그인하세요','err');
  return false;
}

function saveInspName(){safeStorage.set('hy_insp_name',document.getElementById('inspNameGlobal').value.trim());}
function saveInspDate(){safeStorage.set('hy_insp_date',document.getElementById('inspDateGlobal').value);}
function getInspName(){return document.getElementById('inspNameGlobal')?.value.trim()||'';}
function getInspDate(){return document.getElementById('inspDateGlobal')?.value||new Date().toISOString().slice(0,10);}
