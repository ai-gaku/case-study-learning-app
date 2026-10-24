(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cfg = window.APP_CONFIG || {};
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY);
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
  const uuid = () => crypto.randomUUID();
  const KEY = 'case-study-active-v2'; // V2との互換性を維持
  const PARTICIPANT_KEY = 'case-study-participant-code-v3';
  const demoKey = 'case-study-trial-v1';
  const types = new Set(['start','draft','hint_open','extra_open','final','transfer','reflection']);
  let current = window.CASES[0], sessionId = uuid(), userId = null, step = 1;
  let initial = '', final = '', transfer = '', reflection = '', activeText = '', gapNote = '';
  let viewed = new Set(), extraShown = false, done = false, feedbackOpen = false, nextFocus = ''; 
  let participantCode = '';
  let mode = 'demo', pending = Promise.resolve(), saveFailed = false, localFailed = false;
  let stateStorageEnabled = true;
  const byId = x => window.CASES.find(c => c.id === x);
  // 全角英数字→半角、英字→大文字。内部の空白や異なる文字は混同しない。
  function normalizeParticipantCode(value){return String(value ?? '').normalize('NFKC').trim().toUpperCase();}
  function status(msg, error=false){ const e=$('status'); if(e){e.textContent=msg;e.className='status'+(error?' error':'');} }
  function localState(){return {schema:3,participantCode,userId,caseId:current.id,caseVersion:current.version,sessionId,step,initial,final,transfer,reflection,activeText,gapNote,viewed:[...viewed],extraShown,done,feedbackOpen,nextFocus,updatedAt:new Date().toISOString()};}
  function cache(){
    if(!stateStorageEnabled) return;
    try{localStorage.setItem(KEY,JSON.stringify(localState()));localFailed=false;}
    catch(e){localFailed=true;console.warn('ブラウザ内一時保存に失敗',e);status('このブラウザ内への一時保存に失敗しました。空き容量やブラウザ設定を確認してください。',true);}
  }
  function rememberInput(){const a=$('answer');if(a)activeText=a.value;cache();}
  function readCached(){try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch{return null;}}
  function loadSaved(s){
    participantCode=normalizeParticipantCode(s.participantCode || participantCode);
    $('participantCode').value=participantCode;
    current=byId(s.caseId);sessionId=s.sessionId;step=s.step;initial=s.initial||'';final=s.final||'';transfer=s.transfer||'';reflection=s.reflection||'';
    activeText=s.activeText||'';gapNote=s.gapNote||'';viewed=new Set((s.viewed||[]).filter(x=>typeof x==='string'));extraShown=Boolean(s.extraShown);done=Boolean(s.done);feedbackOpen=Boolean(s.feedbackOpen);nextFocus=s.nextFocus||'';
  }
  async function verifyCode(code){
    if(!code || mode!=='database') return 'ok';
    const {data,error}=await db.rpc('claim_participant_code',{input_code:code});
    if(error){console.error('参加コード照合エラー',error);return 'connection_error';}
    return data;
  }
  function explainCodeResult(result){
    return ({not_found:'この参加コードは発行済み一覧にありません。配布されたコードを確認してください。',
      already_used:'このコードは別のブラウザ・利用者ですでに使われています。教員に確認してください。',
      invalid_format:'半角英数字6～12文字で入力してください。',
      not_authenticated:'Supabaseの認証ができていません。ページを再読み込みしてください。',
      connection_error:'コードを確認できませんでした。ネットワークとSupabaseの設定を確認してください。'})[result] || '参加コードを確認できませんでした。';
  }
  function log(type,payload={}){
    if(!types.has(type))return;
    const record={session_id:sessionId,case_id:current.id,case_version:current.version,event_type:type,payload:{...payload,participant_code:participantCode||null}};
    if(mode==='demo'){
      try{const arr=JSON.parse(localStorage.getItem(demoKey)||'[]');arr.push({...record,created_at:new Date().toISOString()});localStorage.setItem(demoKey,JSON.stringify(arr));}
      catch(e){saveFailed=true;status('デモ記録の保存に失敗しました。',true);}return;
    }
    pending=pending.then(async()=>{const {error}=await db.from('learning_events').insert(record);if(error)throw error;}).catch(e=>{
      saveFailed=true;console.error('Supabaseへの保存失敗',e);
      status('Supabaseへの記録に失敗しました。この端末の一時保存が残っている可能性があります。教員に連絡してください。',true);
    });
  }
  function newSession(c){
    current=c;sessionId=uuid();step=1;initial='';final='';transfer='';reflection='';activeText='';gapNote='';viewed=new Set();extraShown=false;done=false;feedbackOpen=false;nextFocus='';saveFailed=false;cache();log('start',{});render();
  }
  function label(){
    $('caseText').textContent=`${current.age}\n${current.description}`;$('caseSelect').value=current.id;
    for(let i=1;i<=5;i++)$('s'+i).classList.toggle('on',!done && i===step);
  }
  const focusChoices = [
    {id:'fact',label:'事実と推測を分けて考える'},
    {id:'multiple',label:'背景の可能性を複数考える'},
    {id:'information',label:'判断前に確認したい情報を具体化する'},
    {id:'reason',label:'対応を選ぶ理由まで説明する'},
    {id:'other',label:'まだ決めていない・その他'}
  ];
  const focusLabel=id=>(focusChoices.find(c=>c.id===id)||{label:'未選択'}).label;
  function feedbackHtml(){
    const explanation=current.feedback || {};
    const history=[];
    if(extraShown)history.push('追加の観察情報を確認しました。');
    if(viewed.size)history.push(`考えるためのヒントを${viewed.size}種類確認しました。`);
    if(!extraShown&&!viewed.size)history.push('追加の観察情報やヒントを開かずに考えました。');
    return `<div class="feedback"><h3>事例の考え方（教員作成）</h3><p>${esc(explanation.main||'行動の背景を一つに決めつけず、本人・活動・環境に関する情報を確かめながら考えましょう。')}</p><h3>考える際に確認したい点</h3><ul>${(explanation.checks||[]).map(c=>`<li>${esc(c)}</li>`).join('')}</ul><p class="tip">これは唯一の模範解答ではありません。状況が異なれば適切な対応も変わります。</p><h3>今回の学習過程</h3><p>${esc(history.join(' '))}</p><p>初回回答・最終回答・別事例の回答を比べて、今後も活用したい考え方を確認してみましょう。</p><details><summary>自分の振り返りを確認</summary><div class="saved">${esc(reflection)}</div></details></div>`;
  }
  async function completeFeedback(){
    if(!nextFocus){status('次に意識したいことを1つ選んでください。',true);return;}
    log('reflection',{text:reflection,next_focus:nextFocus,next_focus_label:focusLabel(nextFocus)});
    done=true;cache();render();status('学習記録を送信しています…');await pending;
    status(saveFailed?'送信できなかった記録があります。教員に連絡してください。':mode==='demo'?'デモ記録をこのブラウザに保存しました。':'学習記録を送信しました。',saveFailed);
  }
  function render(){
    label();let html='';
    if(done){html=`<h2>この事例の学習が完了しました</h2><p>振り返りと「次に意識したいこと」を記録しました。</p><p class="tip">次に意識したいこと：${esc(focusLabel(nextFocus))}</p>${feedbackHtml()}<div class="btns"><button id="restart">新しい取り組みを始める</button></div>`;}
    else if(step===1){html=`<h2>1. まず自分で考える</h2><p>${esc(current.prompts.initial)}</p><label for="answer">最初の回答</label><textarea id="answer" placeholder="今わかっている範囲で書いてください。">${esc(activeText)}</textarea><p class="tip">入力途中の文章は、この端末のブラウザに自動保存されます。「次へ」を押すと回答が送信されます。</p><div class="btns"><button id="next" class="primary">最初の回答を保存して進む →</button></div>`;}
    else if(step===2){
      html=`<h2>2. 追加情報と自分の判断を照らし合わせる</h2><p>最初の回答を見直し、必要なら情報やヒントを確認しましょう。ヒントを使わなくても進めます。利用による減点はありません。</p><div class="tip"><strong>最初の回答</strong><div class="saved">${esc(initial)}</div></div>`;
      html+=`<div class="hint"><button id="extra" type="button">${extraShown?'追加の観察情報：表示中（閉じるには下の見出しをタップ）':'追加の観察情報を確認する'}</button>${extraShown?`<details open><summary>追加の観察情報（開閉できます）</summary><p>${esc(current.extra)}</p></details>`:''}</div>`;
      html+=`<div class="hint"><label for="gapNote"><strong>いま、まだ判断できないことは？（任意）</strong></label><p class="tip">追加情報と最初の回答を比べて、まだ確認したいことがあれば短くメモしてください。</p><textarea id="gapNote" rows="3">${esc(gapNote)}</textarea></div>`;
      html+='<h3>考えるためのヒント（必要な場合だけ）</h3>';
      current.hints.forEach(h=>html+=`<div class="hint"><strong>${esc(h.title)}</strong><span class="tag">${esc(h.type)}</span>${viewed.has(h.id)?`<details open><summary>ヒント：表示中（タップで閉じる）</summary><p>${esc(h.text)}</p></details>`:`<div class="btns"><button data-hint="${esc(h.id)}">必要ならヒントを見る</button></div>`}</div>`);
      html+='<div class="btns"><button id="back">← 戻る</button><button id="next" class="primary">最終回答へ →</button></div>';
    }
    else if(step===3){html=`<h2>3. もう一度考えてまとめる</h2><p>${esc(current.prompts.final)}</p><p class="tip">これまでの情報を必要に応じて見返せます。判断を変えない場合も根拠を書きましょう。</p><div class="review"><details open><summary>最初の自分の回答</summary><div class="saved">${esc(initial)}</div></details>${extraShown?`<details><summary>確認した追加の観察情報</summary><p>${esc(current.extra)}</p></details>`:''}${viewed.size?`<details><summary>利用したヒント（${viewed.size}件）</summary>${current.hints.filter(h=>viewed.has(h.id)).map(h=>`<p><strong>${esc(h.title)}</strong>：${esc(h.text)}</p>`).join('')}</details>`:''}${gapNote?`<details><summary>まだ判断できないことのメモ</summary><div class="saved">${esc(gapNote)}</div></details>`:''}</div><label for="answer">最終回答</label><textarea id="answer">${esc(activeText)}</textarea><div class="btns"><button id="back">← ヒントに戻る</button><button id="next" class="primary">最終回答を保存して進む →</button></div>`;}
    else if(step===4){html=`<h2>4. 別の場面でも考えてみる</h2><p>ここまで、子どもの行動について情報を確かめながら考えてきました。次の事例では、<strong>同じ支援を当てはめるのではなく、「何が分かっていて、何を確認して判断するか」という考え方</strong>を使ってみましょう。</p><p class="tip">まだ分からないことがあっても構いません。学習用ヒントはここでは表示しません。</p><div class="story">${esc(current.transfer)}</div><label for="answer">別事例への回答</label><textarea id="answer">${esc(activeText)}</textarea><div class="btns"><button id="back">← 戻る</button><button id="next" class="primary">別事例の回答を保存して進む →</button></div>`;}
    else if(step===5){
      const compare=`<div class="review"><details open><summary>最初の回答</summary><div class="saved">${esc(initial)}</div></details><details open><summary>最終回答</summary><div class="saved">${esc(final)}</div></details><details><summary>別事例への回答</summary><div class="saved">${esc(transfer)}</div></details></div>`;
      if(!feedbackOpen){html=`<h2>5. 回答を比べて振り返る</h2><p>最初と最後の回答を見比べ、<strong>何を新たに考えたか、あるいは判断を維持した理由</strong>を振り返りましょう。別事例で考えたことも参考にできます。</p>${compare}<label for="answer">振り返り</label><textarea id="answer">${esc(activeText)}</textarea><div class="btns"><button id="back">← 戻る</button><button id="next" class="primary">振り返りを確定して解説を見る →</button></div>`;}
      else {html=`<h2>5. 解説とフィードバック</h2><p class="tip">ここからは教員が作成した解説と、閲覧履歴にもとづく振り返りです。自由記述の良し悪しを自動採点したものではありません。</p>${feedbackHtml()}<h3>次の事例で、特に意識したいことを1つ選びましょう</h3><p>次の学習に向けた自分の目標です。正解・不正解はありません。</p><div class="choices">${focusChoices.map(c=>`<label class="choice"><input type="radio" name="nextFocus" value="${c.id}" ${nextFocus===c.id?'checked':''}> ${esc(c.label)}</label>`).join('')}</div><div class="btns"><button id="backFeedback">← 振り返りを見直す</button><button id="complete" class="primary">選んで学習を完了する</button></div>`;}
    }
    $('stage').innerHTML=html+'<p id="status" class="status" role="status"></p>';
    $('answer')?.addEventListener('input',rememberInput);
    $('gapNote')?.addEventListener('input', e => {gapNote=e.target.value;cache();});
    $('next')?.addEventListener('click',next);
    $('back')?.addEventListener('click',()=>{rememberInput();step--;activeText=step===1?initial:step===3?final:step===4?transfer:step===5?reflection:'';cache();render();});
    $('restart')?.addEventListener('click',()=>{if(confirm('同じ事例で新しい取り組みを開始しますか？'))newSession(current);});
    $('extra')?.addEventListener('click',()=>{if(!extraShown){extraShown=true;log('extra_open',{extra_id:'observation'});cache();render();}else{const panel=document.querySelector('#stage .hint details');if(panel)panel.open=!panel.open;}});
    document.querySelectorAll('[data-hint]').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.hint;if(!viewed.has(key)){viewed.add(key);log('hint_open',{hint_id:key});}cache();render();}));
    document.querySelectorAll('input[name="nextFocus"]').forEach(r=>r.addEventListener('change',e=>{nextFocus=e.target.value;cache();}));
    $('backFeedback')?.addEventListener('click',()=>{feedbackOpen=false;activeText=reflection;cache();render();});
    $('complete')?.addEventListener('click',completeFeedback);
    if(localFailed)status('このブラウザ内への一時保存に失敗しています。',true);
    else if(saveFailed)status('Supabaseへの記録に失敗した履歴があります。担当者に連絡してください。',true);
    else if(!done)status('入力途中の文章は、このブラウザに自動保存されます。回答を確定すると学習記録として送信されます。');
  }
  async function next(){
    const val=$('answer')?.value.trim();if(step!==2&&!val){status('回答を入力してください。',true);return;}
    if(step===1){initial=val;log('draft',{text:val});step=2;activeText='';}
    else if(step===2){step=3;activeText=final;}
    else if(step===3){final=val;log('final',{text:val,reconsideration_note:gapNote});step=4;activeText=transfer;}
    else if(step===4){transfer=val;log('transfer',{text:val});step=5;activeText=reflection;}
    else if(step===5){reflection=val;feedbackOpen=true;activeText='';cache();render();return;}
    cache();render();
  }
  async function boot(){
    try { participantCode = normalizeParticipantCode(localStorage.getItem(PARTICIPANT_KEY) || ''); } catch {}
    $('participantCode').value = participantCode;
    $('applyParticipantCode').addEventListener('click', async () => {
      const button=$('applyParticipantCode');
      if(button.disabled)return;
      const nextCode=normalizeParticipantCode($('participantCode').value);
      $('participantCode').value=nextCode;
      if(nextCode && !/^[A-Z0-9]{6,12}$/.test(nextCode)){
        alert('研究用参加コードは半角英数字6～12文字で入力してください。小文字は大文字に変換されます。');
        $('participantCode').value=participantCode;return;
      }
      if(nextCode===participantCode){alert('現在のコードと同じです。');return;}
      button.disabled=true;button.textContent='コードを確認中…';
      try{
        const result=await verifyCode(nextCode);
        if(result!=='ok'){alert(explainCodeResult(result));$('participantCode').value=participantCode;return;}
        if(!confirm('参加コードを変更すると、現在の課題を終了して新しい取り組みを開始します。よろしいですか？')){
          $('participantCode').value=participantCode;return;
        }
        participantCode=nextCode;
        try{if(nextCode)localStorage.setItem(PARTICIPANT_KEY,nextCode);else localStorage.removeItem(PARTICIPANT_KEY);}catch{}
        newSession(current);
        alert(nextCode?'参加コードを確認して設定しました。':'コードを解除して新しい取り組みを開始しました。');
      }finally{button.disabled=false;button.textContent='このコードを設定';}
    });
    window.CASES.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.title;$('caseSelect').appendChild(o);});
    $('caseSelect').addEventListener('change',e=>{
      rememberInput();if(!confirm('別の事例で新しい取り組みを始めますか？ 現在の未完了の入力は、この画面から再開できなくなります。')){e.target.value=current.id;return;}
      newSession(byId(e.target.value));
    });
    if(db){
      try{let {data:{session},error}=await db.auth.getSession();if(error)throw error;
        if(!session){const result=await db.auth.signInAnonymously();if(result.error)throw result.error;session=result.data.session;}
        userId=session.user.id;mode='database';$('mode').textContent='データベース接続';
      }catch(e){console.error(e);$('mode').textContent='接続エラー';$('stage').innerHTML='<h2>データベースに接続できません</h2><p>設定を確認してください。回答は開始できません。</p>';return;}
    } else {$('mode').textContent='デモ（ブラウザ内保存）';}
    // 既存のブラウザ保存コードも毎回サーバーで検証し、失効・未登録なら外す。
    if(participantCode && mode==='database'){
      const outcome=await verifyCode(participantCode);
      if(outcome!=='ok'){
        const old=participantCode;participantCode='';$('participantCode').value='';
        try{localStorage.removeItem(PARTICIPANT_KEY);}catch{}
        // 過去の同コードの入力途中記録を誤って復元させない。
        try{localStorage.removeItem(KEY);}catch{}
        alert('保存済みコード '+old+' を確認できません。'+explainCodeResult(outcome)+' コードなしの新しい試用を開始します。');
      }
    }
    const saved=readCached();
    // 既存のV2の作業中セッションには研究用参加コードを後付けしない。
    // V3の新規セッションからコードを紐付ける。
    if(saved&&(saved.schema===2||saved.schema===3)&&normalizeParticipantCode(saved.participantCode||'')===participantCode&&byId(saved.caseId)?.version===saved.caseVersion&&saved.userId===userId&&typeof saved.sessionId==='string'&&saved.step>=1&&saved.step<=5){
      if(confirm(saved.done?'前回は課題を完了しています。前回の画面を表示しますか？（キャンセルすると新しい取り組みを開始）':'このブラウザに前回の入力途中の記録があります。続きを再開しますか？（キャンセルすると新しい取り組みを開始）')){
        loadSaved(saved);render();status(saved.done?'前回の完了画面を表示しています。':'前回の入力内容を復元しました。');return;
      }
    }
    newSession(current);
  }
  boot();
})();
