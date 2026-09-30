const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'">
  <title>Yamone Golf 코스 관리자</title>
  <style>
    :root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#173f34;background:#f4f7f5;color-scheme:light}
    *{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button{cursor:pointer}.wrap{max-width:1180px;margin:auto;padding:24px}.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.brand{font-weight:850;letter-spacing:.06em}.muted{color:#5e716b}.card{background:#fff;border:1px solid #dce5e1;border-radius:16px;padding:18px;box-shadow:0 6px 24px #173f340d}.stack{display:grid;gap:14px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.grow{flex:1 1 220px}.field{display:grid;gap:6px}.field span{font-size:13px;font-weight:700}.field input,.field select{width:100%;min-height:44px;border:1px solid #b7c6c0;border-radius:10px;padding:9px 11px;background:#fff}.primary,.secondary,.danger{min-height:44px;border-radius:10px;padding:9px 14px;font-weight:750;border:1px solid transparent}.primary{background:#173f34;color:white}.secondary{background:#edf4f1;color:#173f34;border-color:#c9d9d2}.danger{background:#fff1ef;color:#9d2d1f;border-color:#f1c1ba}.tabs{display:flex;gap:8px;margin:18px 0}.tabs button[aria-selected="true"]{background:#173f34;color:#fff}.notice{padding:12px 14px;border-radius:10px;background:#fff7d8;color:#674f00}.error{padding:12px 14px;border-radius:10px;background:#fff0ed;color:#9d2d1f}.success{padding:12px 14px;border-radius:10px;background:#e5f7ef;color:#176243}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.course h3{margin:0 0 6px}.badge{display:inline-block;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:800;background:#e5f7ef;color:#176243}.badge.off{background:#eee;color:#666}.source{font-size:13px}.segments{display:grid;gap:12px}.segment{border:1px solid #dce5e1;border-radius:12px;padding:12px}.pars{display:grid;grid-template-columns:repeat(9,minmax(52px,1fr));gap:6px;overflow-x:auto;padding-bottom:4px}.par{display:grid;gap:3px;text-align:center;font-size:11px}.par input{min-width:50px;text-align:center}.actions{display:flex;gap:8px;flex-wrap:wrap}.hidden{display:none!important}dialog{border:0;border-radius:18px;padding:0;max-width:min(900px,calc(100vw - 24px));width:100%;box-shadow:0 18px 60px #0004}dialog::backdrop{background:#0b201a99}.dialog-body{padding:20px;max-height:88vh;overflow:auto}.history-item{border-left:3px solid #82b9a6;padding-left:12px}.tiny{font-size:12px}.footer{padding:30px 0;text-align:center;color:#687b75}@media(max-width:640px){.wrap{padding:14px}.pars{grid-template-columns:repeat(3,1fr)}.primary,.secondary,.danger{width:100%}}
  </style>
</head>
<body>
  <main class="wrap stack">
    <header class="bar">
      <div><div class="brand">YAMONE GOLF</div><h1>골프장 데이터 관리자</h1></div>
      <button id="logout" class="secondary hidden" type="button">잠금</button>
    </header>
    <section id="login" class="card stack">
      <div><h2>관리자 인증</h2><p class="muted">Cloudflare secret에 등록한 COURSE_ADMIN_TOKEN을 입력합니다. 토큰은 이 탭에만 보관됩니다.</p></div>
      <label class="field"><span>관리자 토큰</span><input id="token" type="password" autocomplete="off" spellcheck="false"></label>
      <button id="login-button" class="primary" type="button">관리 화면 열기</button>
    </section>
    <section id="app" class="hidden stack">
      <div class="notice">GolfCore는 검색·초안 생성에만 사용합니다. 가져오기 전에 이름·도시·9홀별 PAR를 확인하세요. 지도와 이미지는 저장하지 않습니다.</div>
      <nav class="tabs" aria-label="관리 메뉴">
        <button class="secondary" data-tab="local" aria-selected="true" type="button">저장된 골프장</button>
        <button class="secondary" data-tab="golfcore" aria-selected="false" type="button">GolfCore 가져오기</button>
        <button class="secondary" data-tab="manual" aria-selected="false" type="button">직접 등록</button>
      </nav>
      <div id="message" aria-live="polite"></div>
      <section id="local-panel" class="stack">
        <div class="card row">
          <label class="field grow"><span>이름·도시 검색</span><input id="local-query"></label>
          <label class="field"><span>국가</span><select id="local-country"><option value="">전체</option><option value="KR">한국</option><option value="PH">필리핀</option></select></label>
          <label class="field"><span>상태</span><select id="local-status"><option value="all">전체</option><option value="active">사용 중</option><option value="inactive">비활성</option></select></label>
          <button id="local-search" class="primary" type="button">조회</button>
        </div>
        <div id="local-list" class="grid"></div>
        <button id="local-more" class="secondary hidden" type="button">더 보기</button>
      </section>
      <section id="golfcore-panel" class="stack hidden">
        <div class="card row">
          <label class="field"><span>국가</span><select id="gc-country"><option value="kr">한국</option><option value="ph">필리핀</option></select></label>
          <label class="field grow"><span>골프장·도시 검색</span><input id="gc-query" placeholder="예: Seoul, Manila"></label>
          <button id="gc-search" class="primary" type="button">GolfCore 검색</button>
        </div>
        <div id="gc-list" class="grid"></div>
        <button id="gc-more" class="secondary hidden" type="button">더 보기</button>
        <p class="muted source">데이터 출처: <a href="https://www.golfcore.org" target="_blank" rel="noopener noreferrer">GolfCore</a>. 각 저장 항목에는 원본 코스 링크가 함께 기록됩니다.</p>
      </section>
      <section id="manual-panel" class="hidden">
        <div class="card stack"><h2>골프장 직접 등록</h2><div id="manual-editor"></div></div>
      </section>
    </section>
    <footer class="footer">운영 DB 변경은 저장 즉시 반영됩니다. 삭제 대신 비활성화를 사용합니다.</footer>
  </main>
  <dialog id="editor-dialog"><div class="dialog-body stack"><div class="bar"><h2 id="editor-title">골프장 편집</h2><button id="editor-close" class="secondary" type="button">닫기</button></div><div id="editor"></div></div></dialog>
  <dialog id="history-dialog"><div class="dialog-body stack"><div class="bar"><h2>변경 이력</h2><button id="history-close" class="secondary" type="button">닫기</button></div><div id="history" class="stack"></div></div></dialog>
  <script>
  (()=>{
    const $=id=>document.getElementById(id), state={token:sessionStorage.getItem('ymg.course-admin')||'',localOffset:null,gcOffset:null,editor:null};
    const labels={unauthorized:'관리자 토큰이 올바르지 않습니다.',admin_not_configured:'서버에 COURSE_ADMIN_TOKEN이 아직 설정되지 않았습니다.',invalid_course:'이름·도시·9홀별 PAR 3~7을 확인하세요.',duplicate_segment:'9홀 코스 이름은 중복될 수 없습니다.',course_changed:'다른 변경이 먼저 저장되었습니다. 다시 불러온 뒤 수정하세요.',golfcore_unavailable:'GolfCore에 연결하지 못했습니다. 잠시 후 다시 시도하세요.',golfcore_scorecard_unavailable:'완전한 9홀 또는 18홀 PAR 데이터가 없습니다.',source_country_mismatch:'GolfCore 국가와 선택한 국가가 다릅니다.'};
    function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
    function clear(n){n.replaceChildren()}
    function showMessage(text,kind='error'){const box=$('message');clear(box);if(text){const n=node('div',text,kind);box.append(n)}}
    async function api(path,options={}){const headers={Authorization:'Bearer '+state.token,...(options.body?{'Content-Type':'application/json'}:{})};const response=await fetch(path,{...options,headers:{...headers,...options.headers}});let data={};try{data=await response.json()}catch{}if(!response.ok){const code=data.error||'server_error';if(response.status===401)logout();throw new Error(labels[code]||code)}return data}
    function loginView(ok){$('login').classList.toggle('hidden',ok);$('app').classList.toggle('hidden',!ok);$('logout').classList.toggle('hidden',!ok)}
    async function login(){state.token=$('token').value.trim()||state.token;if(!state.token)return;try{await api('/admin/api/session');sessionStorage.setItem('ymg.course-admin',state.token);loginView(true);showMessage('');await loadLocal()}catch(error){showMessage(error.message)}}
    function logout(){state.token='';sessionStorage.removeItem('ymg.course-admin');$('token').value='';loginView(false)}
    function button(text,handler,cls='secondary'){const b=node('button',text,cls);b.type='button';b.addEventListener('click',handler);return b}
    function badge(active){return node('span',active?'사용 중':'비활성','badge'+(active?'':' off'))}
    function countryName(code){return code==='KR'?'한국':code==='PH'?'필리핀':code||'국가 미지정'}
    function courseCard(course,remote=false){const card=node('article',undefined,'card course stack');const title=node('div');title.append(node('h3',course.name));title.append(badge(remote?true:course.active));card.append(title,node('div',[countryName(course.country||course.country_code),course.city||course.region||'',course.hole_count?course.hole_count+'홀':course.segments?course.segments.length*9+'홀':''].filter(Boolean).join(' · '),'muted'));
      if(!remote&&course.segments)card.append(node('div',course.segments.map(x=>x.name+' (PAR '+x.pars.reduce((a,b)=>a+b,0)+')').join(' / '),'tiny'));
      if(!remote&&course.source_name==='golfcore'){const a=node('a','GolfCore 원본 보기 ↗','source');a.href=course.source_url;a.target='_blank';a.rel='noopener noreferrer';card.append(a)}
      const actions=node('div',undefined,'actions');
      if(remote){actions.append(button(course.existing_course_id?'검토·갱신':'검토·가져오기',()=>reviewGolfCore(course.slug,course.existing_course_id),'primary'));const a=node('a','원본','secondary');a.href=course.source_url;a.target='_blank';a.rel='noopener noreferrer';actions.append(a)}else{actions.append(button('수정',()=>openEditor(course,'edit'),'primary'),button('이력',()=>openHistory(course),'secondary'))}
      card.append(actions);return card}
    async function loadLocal(offset=0){try{showMessage('');const params=new URLSearchParams({q:$('local-query').value,country:$('local-country').value,status:$('local-status').value,offset:String(offset)});const data=await api('/admin/api/courses?'+params);const list=$('local-list');if(!offset)clear(list);data.courses.forEach(c=>list.append(courseCard(c)));state.localOffset=data.next_offset;$('local-more').classList.toggle('hidden',data.next_offset===null);if(!offset&&!data.courses.length)list.append(node('p','조건에 맞는 골프장이 없습니다.','muted'))}catch(error){showMessage(error.message)}}
    async function searchGolfCore(offset=0){try{showMessage('');const params=new URLSearchParams({country:$('gc-country').value,q:$('gc-query').value,offset:String(offset)});const data=await api('/admin/api/golfcore/search?'+params);const list=$('gc-list');if(!offset)clear(list);data.courses.forEach(c=>list.append(courseCard(c,true)));state.gcOffset=data.next_offset;$('gc-more').classList.toggle('hidden',data.next_offset===null);if(!offset&&!data.courses.length)list.append(node('p','GolfCore에서 조건에 맞는 스코어카드를 찾지 못했습니다.','muted'))}catch(error){showMessage(error.message)}}
    async function reviewGolfCore(slug,existingId){try{showMessage('');const [data,existing]=await Promise.all([api('/admin/api/golfcore/courses/'+encodeURIComponent(slug)),existingId?api('/admin/api/courses/'+existingId):Promise.resolve(null)]);data.course.active=existing?existing.course.active:true;if(existing){data.course.version=existing.course.version;data.course.course_id=existing.course.course_id}openEditor(data.course,'import')}catch(error){showMessage(error.message)}}
    function field(labelText,value,type='text'){const label=node('label',undefined,'field');label.append(node('span',labelText));const input=document.createElement('input');input.type=type;input.value=value??'';label.append(input);return {label,input}}
    function renderEditor(target,course,mode){clear(target);const form=node('div',undefined,'stack');const source=course.source_name==='golfcore';if(source){const info=node('div',undefined,'notice');info.append(node('div','GolfCore에서 가져온 초안입니다. 저장 전에 PAR를 확인하세요.'));if(course.warnings)course.warnings.forEach(w=>info.append(node('div','• '+w,'tiny')));form.append(info)}
      const first=node('div',undefined,'row');const name=field('골프장 이름',course.name||'');name.label.classList.add('grow');const countryLabel=node('label',undefined,'field');countryLabel.append(node('span','국가'));const country=document.createElement('select');[['KR','한국'],['PH','필리핀']].forEach(([v,t])=>{const o=node('option',t);o.value=v;country.append(o)});country.value=course.country_code||'KR';countryLabel.append(country);const city=field('도시',course.city||course.region||'');city.label.classList.add('grow');first.append(name.label,countryLabel,city.label);form.append(first);
      const activeLabel=node('label',undefined,'field');activeLabel.append(node('span','상태'));const active=document.createElement('select');[['true','사용 중'],['false','비활성']].forEach(([v,t])=>{const o=node('option',t);o.value=v;active.append(o)});active.value=course.active===false?'false':'true';activeLabel.append(active);form.append(activeLabel);
      const segments=node('div',undefined,'segments');form.append(node('h3','9홀 코스와 홀별 PAR'),segments);let values=(course.segments||[{name:'OUT',pars:Array(9).fill(4)}]).map(s=>({name:s.name,pars:[...s.pars]}));
      function drawSegments(){clear(segments);values.forEach((segment,index)=>{const box=node('section',undefined,'segment stack');const top=node('div',undefined,'row');const title=field((index+1)+'번째 9홀 코스 이름',segment.name);title.label.classList.add('grow');title.input.maxLength=30;title.input.addEventListener('input',()=>segment.name=title.input.value);top.append(title.label);if(values.length>1)top.append(button('코스 제거',()=>{values.splice(index,1);drawSegments()},'danger'));box.append(top);const pars=node('div',undefined,'pars');segment.pars.forEach((par,hole)=>{const item=node('label',undefined,'par field');item.append(node('span',(hole+1)+'홀'));const input=document.createElement('input');input.type='number';input.min='3';input.max='7';input.step='1';input.value=String(par);input.addEventListener('input',()=>segment.pars[hole]=Number(input.value));item.append(input);pars.append(item)});box.append(pars,node('div','9홀 PAR '+segment.pars.reduce((a,b)=>a+Number(b||0),0),'muted tiny'));segments.append(box)});if(values.length<9)segments.append(button('9홀 코스 추가',()=>{values.push({name:'COURSE '+(values.length+1),pars:Array(9).fill(4)});drawSegments()},'secondary'))}
      drawSegments();const actions=node('div',undefined,'actions');const save=button(mode==='import'?'검토 내용으로 가져오기':mode==='create'?'등록':'변경 저장',async()=>{save.disabled=true;try{const payload={name:name.input.value,country_code:country.value,city:city.input.value,segments:values,active:active.value==='true'};let data;if(mode==='import')data=await api('/admin/api/golfcore/import',{method:'POST',body:JSON.stringify({...payload,slug:course.slug,...(course.version?{version:course.version}:{})})});else if(mode==='create')data=await api('/admin/api/courses',{method:'POST',body:JSON.stringify(payload)});else data=await api('/admin/api/courses/'+course.course_id,{method:'PUT',body:JSON.stringify({...payload,version:course.version})});showMessage('저장했습니다.','success');$('editor-dialog').open&&$('editor-dialog').close();if(mode==='create'){renderManual()}await loadLocal()}catch(error){showMessage(error.message);save.disabled=false}},'primary');actions.append(save);if(mode!=='create')actions.append(button('취소',()=>$('editor-dialog').close(),'secondary'));form.append(actions);target.append(form)}
    function openEditor(course,mode){$('editor-title').textContent=mode==='import'?'GolfCore 가져오기 검토':'골프장 수정';renderEditor($('editor'),course,mode);$('editor-dialog').showModal()}
    function renderManual(){renderEditor($('manual-editor'),{name:'',country_code:'KR',city:'',active:true,segments:[{name:'OUT',pars:Array(9).fill(4)}]},'create')}
    async function openHistory(course){try{const data=await api('/admin/api/courses/'+course.course_id+'/history');const list=$('history');clear(list);if(!data.changes.length)list.append(node('p','관리자 변경 이력이 없습니다.','muted'));data.changes.forEach(change=>{const item=node('div',undefined,'history-item');const action={create:'직접 등록',import:'GolfCore 가져오기/갱신',update:'수정',deactivate:'비활성화',reactivate:'재활성화'}[change.action]||change.action;item.append(node('strong',action),node('div',new Date(change.created_at).toLocaleString(),'muted tiny'));const after=change.after;item.append(node('div',[after.name,countryName(after.country_code),after.city,after.segments?.length*9+'홀'].filter(Boolean).join(' · '),'tiny'));list.append(item)});$('history-dialog').showModal()}catch(error){showMessage(error.message)}}
    function setTab(tab){document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));['local','golfcore','manual'].forEach(name=>$(name+'-panel').classList.toggle('hidden',name!==tab));if(tab==='manual')renderManual()}
    $('login-button').addEventListener('click',login);$('token').addEventListener('keydown',e=>{if(e.key==='Enter')login()});$('logout').addEventListener('click',logout);$('local-search').addEventListener('click',()=>loadLocal());$('local-more').addEventListener('click',()=>loadLocal(state.localOffset));$('gc-search').addEventListener('click',()=>searchGolfCore());$('gc-more').addEventListener('click',()=>searchGolfCore(state.gcOffset));$('editor-close').addEventListener('click',()=>$('editor-dialog').close());$('history-close').addEventListener('click',()=>$('history-dialog').close());document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
    if(state.token){$('token').value=state.token;login()}else loginView(false);
  })();
  </script>
</body>
</html>`;

export function adminPage() {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "X-Frame-Options": "DENY",
    },
  });
}
