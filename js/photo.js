/* 119hyd-Map2 · js/photo.js — 사진: 썸네일 · 압축 · Cloudinary 업로드 · 뷰어 · 바텀시트 */
AppFiles.reg('js/photo.js','v3.2.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ Photo Grid ══════════ */
function renderPhotoGrid(idx,photos){
  const grid=document.getElementById(`photoGrid-${idx}`);
  if(!grid)return;
  // innerHTML로 전체 렌더 (onclick 인라인 사용)
  const thumbsHtml=photos.map(p=>`
    <div class="iw-photo-thumb">
      <img src="${p.url}" loading="lazy" onclick="openPhotoViewer('${p.url}','')">
      <button class="iw-photo-del" onclick="deletePhoto(${idx},'${p.id}','${p.url}')">✕</button>
    </div>`).join('');
  grid.innerHTML=thumbsHtml;
}

// ━━ 이미지 압축 (공통 Utils 모듈) ━━
// 장변 1280px 이하, JPEG quality 0.75 → 압축 결과가 더 크면 원본 사용
async function compressImage(file){
  try{
    const blob=await Utils.compressImage(file,{maxWidth:1280,maxHeight:1280,quality:0.75});
    return (blob&&blob.size<file.size)?blob:file;
  }catch{ return file; }
}

// ━━ 사진 (Cloudinary 업로드) ━━
// 현장에서 통신이 불안정할 때(지하 소화전, 지하주차장 등) 업로드가 한 번에 실패하는 경우가 많아
// 지수 백오프로 최대 2회 재시도한다. 네트워크 요청 자체가 아예 안 나간 경우(fetch 자체 실패)와
// 서버가 명확히 4xx로 거절한 경우(잘못된 preset 등)는 재시도해도 의미 없으므로 구분해서 처리한다.
async function uploadToCloudinaryOnce(blob,folder){
  const formData=new FormData();
  formData.append('upload_preset',CLOUDINARY_PRESET);
  formData.append('folder',`hydmap/${folder}`);
  formData.append('file',blob);
  const res=await fetch(CLOUDINARY_UPLOAD_URL,{method:'POST',body:formData});
  if(!res.ok){
    const err=new Error('Cloudinary 업로드 실패: '+res.statusText);
    err.status=res.status;
    throw err;
  }
  const data=await res.json();
  return data.secure_url;
}
async function uploadToCloudinary(blob,folder,onRetry){
  const maxRetries=2;
  for(let attempt=0;attempt<=maxRetries;attempt++){
    try{
      return await uploadToCloudinaryOnce(blob,folder);
    }catch(e){
      // 4xx(잘못된 preset/폴더 등 클라이언트 설정 문제)는 재시도해도 계속 실패하므로 바로 던진다
      const isClientError=e.status&&e.status>=400&&e.status<500;
      if(isClientError||attempt===maxRetries)throw e;
      const delay=800*Math.pow(2,attempt); // 800ms → 1600ms
      onRetry?.(attempt+1,maxRetries);
      await sleep(delay);
    }
  }
}
async function uploadPhotoFile(idx,file){
  const d=items[idx];if(!d||!currentProject||!file)return;
  showToast('사진 압축 중...','');
  let upload=file;
  try{upload=await compressImage(file);}catch{}
  const kb=Math.round(upload.size/1024);
  showToast(`업로드 중... (${kb}KB)`,'');
  try{
    const url=await uploadToCloudinary(upload,`${currentProject.id}/${d.id}`,
      (attempt,max)=>showToast(`업로드 재시도 중... (${attempt}/${max})`,''));
    const [photo]=await SupabaseUtil.insert('hydmap_photos',{item_id:d.id,inspection_id:currentProject.id,url,caption:''});
    if(!photoMap[d.id])photoMap[d.id]=[];
    photoMap[d.id].push(photo);
    logHistory(d,'사진 추가',{url});
    renderPhotoGrid(idx,photoMap[d.id]);
    showToast(`사진 저장됨 (${kb}KB)`,'ok');
  }catch(e){showToast('업로드 실패: '+e.message,'err');console.error('uploadPhoto error:',e);}
}
// 하위 호환 (기존 inline onchange 혹시 남아있을 경우)
async function uploadPhoto(idx,input){
  if(!input.files[0])return;
  await uploadPhotoFile(idx,input.files[0]);
  input.value='';
}
async function deletePhoto(idx,photoId,url){
  if(!confirm('사진을 삭제하시겠습니까? (기록만 삭제되며 Cloudinary 원본은 남습니다)'))return;
  const d=items[idx];if(!d)return;
  await SupabaseUtil.remove('hydmap_photos',{id:photoId});
  logHistory(d,'사진 삭제',{url});
  if(photoMap[d.id])photoMap[d.id]=photoMap[d.id].filter(p=>String(p.id)!==String(photoId));
  renderPhotoGrid(idx,photoMap[d.id]||[]);
  showToast('사진 삭제됨','ok');
}
function openPhotoViewer(url,caption){
  document.getElementById('photoViewerImg').src=url;
  document.getElementById('photoViewerCaption').textContent=caption;
  document.getElementById('photoViewer').classList.add('open');
}
function closePhotoViewer(){document.getElementById('photoViewer').classList.remove('open');}

/* ══════════ Photo BottomSheet ══════════ */
let photoSheetIdx=-1;
function openPhotoSheet(idx){
  if(window.innerWidth>600){
    // PC: 바로 파일 선택창
    photoSheetIdx=idx;
    const el=document.getElementById('photoInputGallery');
    el.value='';el.click();
  }else{
    // 모바일: 바텀시트
    photoSheetIdx=idx;
    document.getElementById('photoSheetBg').classList.add('open');
  }
}
function closePhotoSheet(e){
  if(e&&e.target!==document.getElementById('photoSheetBg'))return;
  document.getElementById('photoSheetBg').classList.remove('open');
  photoSheetIdx=-1;
}
function triggerPhotoInput(mode){
  document.getElementById('photoSheetBg').classList.remove('open');
  if(mode==='camera'){
    const el=document.getElementById('photoInputCamera');
    el.value='';el.click();
  }else{
    const el=document.getElementById('photoInputGallery');
    el.value='';el.click();
  }
}
async function handlePhotoInput(input){
  if(photoSheetIdx<0||!input.files.length)return;
  const idx=photoSheetIdx;
  photoSheetIdx=-1;
  const files=Array.from(input.files);
  for(const file of files){
    await uploadPhotoFile(idx,file);
  }
  input.value='';
}
