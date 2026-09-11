
'use strict';
/* UI-ONLY PROTOTYPE. No network, token, database or email integration.
 * Data is held only in this tab's memory. Never use the simulated timers as
 * real server state. In production use a server-side OAuth transaction and
 * return redacted status to the browser. No credentials belong in this file.
 */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const model={view:'form',timers:[],toastTimer:null,hasSubmitted:false};
const demo={fullName:'김셀럽',phone:'010-0000-0000',email:'creator@example.com',instagram:'celeblife_demo'};
const checkSvg='<svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>';
function clearTimers(){model.timers.forEach(clearTimeout);model.timers=[];$('#view-loading').setAttribute('aria-busy','false');}
function readForm(){return {fullName:$('#full-name').value.trim(),phone:$('#phone').value.trim(),email:$('#email').value.trim(),instagram:$('#instagram').value.trim().replace(/^@+/,'')};}
function displayData(){const d=readForm();return Object.fromEntries(Object.keys(d).map(k=>[k,d[k]||demo[k]]));}
function updateStatusData(){const d=displayData();$('#loading-account').textContent='@'+d.instagram;$('#demo-account').textContent='@'+d.instagram;$('#success-account').textContent='@'+d.instagram;$('#success-name').textContent=d.fullName;$('#success-email').textContent=d.email;$('#success-phone').textContent=d.phone;}
function showView(view,{focus=true,run=false}={}){
 if(!['intro','form','loading','success','error'].includes(view))view='form';
 clearTimers();$$('dialog[open]').forEach(d=>d.close());model.view=view;
 $$('.view').forEach(el=>el.hidden=el.id!=='view-'+view);
 $$('.preview-nav [data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 updateStatusData();
 document.title=({intro:'시작',form:'정보 입력',loading:'연동 중',success:'접수 완료',error:'연동 확인'}[view])+' · 셀럽라이프 v2 UI';
 if(view==='loading'){setLoadingStage(0);if(run)startSimulation();}
 if(focus){const title=$('#view-'+view+' h1');if(title)title.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}
function toast(text){clearTimeout(model.toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');model.toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}
function setError(id,errorId,message){const el=$('#'+id),err=$('#'+errorId);el.setAttribute('aria-invalid',message?'true':'false');err.textContent=message;err.hidden=!message;return !message;}
function validateField(id){const d=readForm();switch(id){
 case 'full-name':return setError(id,'name-error',!d.fullName?'이름을 입력해 주세요.':d.fullName.length<2?'이름을 두 글자 이상 입력해 주세요.':'');
 case 'phone':{const n=d.phone.replace(/\D/g,'');return setError(id,'phone-error',!n?'연락처를 입력해 주세요.':!/^0\d{8,10}$/.test(n)?'연락 가능한 전화번호를 확인해 주세요.':'');}
 case 'email':return setError(id,'email-error',!d.email?'이메일을 입력해 주세요.':(!$('#email').validity.valid||!/^\S+@\S+\.\S+$/.test(d.email))?'이메일 주소를 확인해 주세요.':'');
 case 'instagram':return setError(id,'instagram-error',!d.instagram?'인스타그램 아이디를 입력해 주세요.':!/^\w[\w.]{0,29}$/.test(d.instagram)?'영문, 숫자, 마침표, 밑줄로 된 아이디를 입력해 주세요.':'');
}return true;}
function syncConsent(){const all=$$('[data-consent]');const checked=all.filter(el=>el.checked).length;$('#agree-all').checked=checked===all.length;$('#agree-all').indeterminate=checked>0&&checked<all.length;if(checked===all.length)$('#consent-error').hidden=true;}
$('#agree-all').addEventListener('change',e=>{$$('[data-consent]').forEach(c=>c.checked=e.target.checked);syncConsent();});
$$('[data-consent]').forEach(c=>c.addEventListener('change',syncConsent));
$('#phone').addEventListener('input',e=>{const n=e.target.value.replace(/\D/g,'').slice(0,11);e.target.value=n.length<=3?n:n.length<=7?n.slice(0,3)+'-'+n.slice(3):n.length<=10?n.slice(0,3)+'-'+n.slice(3,6)+'-'+n.slice(6):n.slice(0,3)+'-'+n.slice(3,7)+'-'+n.slice(7);});
$('#instagram').addEventListener('blur',e=>e.target.value=e.target.value.trim().replace(/^@+/,''));
$$('#onboarding-form input:not([type=checkbox])').forEach(el=>{el.addEventListener('blur',()=>{if(el.value||model.hasSubmitted)validateField(el.id);});el.addEventListener('input',()=>{if(el.getAttribute('aria-invalid')==='true')validateField(el.id);});});
$('#onboarding-form').addEventListener('submit',e=>{e.preventDefault();model.hasSubmitted=true;const ids=['full-name','phone','email','instagram'];const valid=ids.map(validateField).every(Boolean);const agreed=$$('[data-consent]').every(c=>c.checked);$('#consent-error').hidden=agreed;if(!valid){$('#onboarding-form input[aria-invalid=true]').focus();return;}if(!agreed){$('[data-consent]:not(:checked)').focus();return;}updateStatusData();$('#oauth-dialog').showModal();});
$('#sample-btn').addEventListener('click',()=>{showView('form');$('#full-name').value=demo.fullName;$('#phone').value=demo.phone;$('#email').value=demo.email;$('#instagram').value=demo.instagram;$$('[data-consent]').forEach(c=>c.checked=false);syncConsent();$$('.field-error').forEach(p=>p.hidden=true);$$('[aria-invalid]').forEach(i=>i.removeAttribute('aria-invalid'));model.hasSubmitted=false;toast('예시 정보가 채워졌어요. 동의 항목을 직접 확인해 주세요.');});
$$('[data-view]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
function setLoadingStage(stage){const steps=$$('.loading-step');const details=['확인 중','저장 중','접수 중'];steps.forEach((el,i)=>{el.className='loading-step'+(i<stage?' done':i===stage?' active':'');el.querySelector('.loading-node').innerHTML=i<stage?checkSvg:String(i+1);el.querySelector('.loading-detail').textContent=i<stage?'완료':i===stage?details[i]:'대기';});const copy=[['셀럽님과 연결하고 있어요.','인스타그램 계정을 확인하고 있어요.','셀럽님에게 맞는 분석을 준비하는 첫 단계예요.'],['신청 정보를 정리하고 있어요.','연결된 계정과 연락처를 안전하게 저장합니다.','조금 뒤 접수 완료 화면으로 안내드릴게요.'],['AI 분석 신청을 접수하고 있어요.','셀럽님의 채널에 맞는 분석을 준비합니다.','분석 결과는 담당자가 직접 안내드릴 거예요.']][Math.min(stage,2)];$('#loading-title').textContent=copy[0];$('#loading-copy').replaceChildren(document.createTextNode(copy[1]),document.createElement('br'),document.createTextNode(copy[2]));}
function startSimulation(){// Demo durations only; replace with actual backend status in production.
 $('#view-loading').setAttribute('aria-busy','true');
 model.timers.push(setTimeout(()=>setLoadingStage(1),1800));
 model.timers.push(setTimeout(()=>setLoadingStage(2),3600));
 model.timers.push(setTimeout(()=>showView('success'),5600));
}
$('#simulate-btn').addEventListener('click',()=>{$('#oauth-dialog').close();showView('loading',{run:true});});
$('#simulate-error').addEventListener('click',()=>{$('#oauth-dialog').close();showView('error');});
const policies={
 help:{title:'인스타그램 연동 안내',html:'<span class="demo-badge">UI 검토용 안내</span><h3>어떻게 연결하나요?</h3><p>기본 정보 입력과 필수 동의 후, Instagram 공식 승인 화면에서 계정을 연결하는 흐름입니다. 현재 시안에서는 실제 인증 대신 모의 연결 안내창을 보여줍니다.</p><h3>분석 결과는 어디서 보나요?</h3><p>별도 대시보드 없이 접수 완료로 끝납니다. 담당자가 입력한 연락처로 안내하는 흐름을 제안합니다.</p><h3>비밀번호를 입력해야 하나요?</h3><p>셀럽라이프는 인스타그램 비밀번호를 직접 입력받지 않습니다. 실제 인증은 Instagram에서 처리합니다.</p><h3>이 시안에서 개인정보가 저장되나요?</h3><p>아니요. 네트워크 통신과 영구 저장 기능이 없고, 입력값은 열린 탭 안에서만 화면 확인에 사용됩니다. 예시 정보를 사용해 주세요.</p>'},
 terms:{title:'서비스 이용약관',html:'<span class="demo-badge">UI용 요약 · 법적 문서 확정 전</span><p>약관을 확인하는 화면의 동작과 형태를 보여주는 시안입니다. 기존 운영 약관 전문을 대체하지 않습니다.</p><h3>서비스 범위</h3><p>인스타그램 계정 연결, 분석 신청 접수, 채널 데이터 기반 분석과 담당자 안내를 위한 서비스 흐름을 전제로 합니다.</p><h3>운영 적용 전 확인</h3><p>실제 운영 약관 전문, 제공 범위, 책임, 이용 해지 및 문의 경로를 연결해야 합니다. 이 미리보기에서 체크한 동의는 저장되지 않습니다.</p>'},
 privacy:{title:'개인정보 수집·이용 안내',html:'<span class="demo-badge">UI용 요약 · 운영 정책 확정 전</span><p>아래 내용은 새 입력 항목을 확인하기 위한 초안이며, 실제 개인정보처리방침이나 동의서를 대체하지 않습니다.</p><dl><dt>수집 항목</dt><dd>이름, 이메일, 연락처, 인스타그램 아이디 및 연동 계정 식별정보</dd><dt>이용 목적</dt><dd>분석 신청 접수, 계정 연결, 결과 안내 및 담당자 연락</dd><dt>보유 기간</dt><dd>운영 정책 확정 후 실제 기간과 파기 기준을 명시해야 합니다.</dd><dt>동의 거부</dt><dd>필수 정보 제공을 거부할 수 있으며, 거부 시 신청 접수가 제한될 수 있습니다. 필수 항목의 필요성을 운영 전에 검토해야 합니다.</dd></dl><p>처리 위탁, 국외 이전 여부 및 문의·삭제 요청 경로도 실제 구성에 맞춰 확정해야 합니다. 이 UI는 입력값을 외부로 전송하지 않습니다.</p>'},
 instagramData:{title:'인스타그램 데이터 이용 안내',html:'<span class="demo-badge">UI용 요약 · 운영 설정 확인 필요</span><h3>왜 연결하나요?</h3><p>연결된 계정의 데이터를 바탕으로 채널에 맞는 분석과 커머스 방향을 준비하기 위한 흐름입니다.</p><h3>어떤 정보가 연결되나요?</h3><p>실제 앱이 요청하고 계정 소유자가 승인한 권한 범위에 따라 달라집니다. 운영 시 계정 정보·게시물·인사이트 등 실제 요청 범위와 일치하는 안내 전문을 연결해야 합니다.</p><h3>연동 해제</h3><p>연동 권한 해제와 개인정보 삭제 요청 경로는 별도로 안내해야 합니다. 이 시안에서는 실제 계정 권한이나 토큰을 생성·저장하지 않습니다.</p>'},
 deletion:{title:'연동 해제·데이터 삭제',html:'<span class="demo-badge">UI 미리보기</span><p>실제 운영에서는 인스타그램 연동 해제 안내, 셀럽라이프에 보관된 데이터의 삭제 요청 절차와 담당 연락처를 이 화면에 제공합니다.</p><p>현재는 UI 시안으로, 실제 계정 연동이나 데이터 저장·삭제 기능이 없습니다. 기존 운영 서비스의 삭제 처리 경로는 v2에서도 유지해야 합니다.</p>'},
 contact:{title:'연락처 수정 안내',html:'<span class="demo-badge">UI 미리보기</span><p>실제 접수 완료 후에는 본인 확인을 거친 연락처 수정 또는 담당자 문의 경로가 필요합니다.</p><p>지금은 상단의 <strong>정보·동의</strong> 탭으로 돌아가 입력값을 바꾼 뒤 흐름을 다시 확인할 수 있습니다. 실제 이메일이나 문자, 네이버웍스 알림은 발송되지 않습니다.</p>'}
};
$$('[data-dialog]').forEach(btn=>btn.addEventListener('click',()=>{const p=policies[btn.dataset.dialog];$('#dialog-title').textContent=p.title;$('#dialog-body').innerHTML=p.html;$('#info-dialog').showModal();}));
$$('[data-close]').forEach(btn=>btn.addEventListener('click',()=>btn.closest('dialog').close()));
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
window.addEventListener('pagehide',clearTimers);
// Hashes select UI states only; personal information is never put in URLs.
const initial=location.hash.slice(1);
showView(['intro','form','loading','success','error'].includes(initial)?initial:'form',{focus:false});
