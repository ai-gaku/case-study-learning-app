(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cfg = window.APP_CONFIG || {};
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY);
  const db = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
  const uuid = () => crypto.randomUUID();
  const KEY = 'case-study-active-v9'; // 旧版とは学習段階が異なるため分離
  const PARTICIPANT_KEY = 'case-study-participant-code-v3';
  const demoKey = 'case-study-trial-v1';
  const types = new Set(['start','draft','hint_open','extra_open','final','transfer','reflection']);
  let current = window.CASES[0], sessionId = uuid(), userId = null, step = 1;
  let initial = '', final = '', transfer = '', reflection = '', activeText = '', gapNote = '', transferCheck = ''; 
  let viewed = new Set(), extraShown = false, done = false, feedbackOpen = false, nextFocus = '';  
  let participantCode = '';
  let mode = 'demo', pending = Promise.resolve(), saveFailed = false, localFailed = false;
  let stateStorageEnabled = true;
  const byId = x => window.CASES.find(c => c.id === x);
  // 全角英数字→半角、英字→大文字。内部の空白や異なる文字は混同しない。
  function normalizeParticipantCode(value){return String(value ?? '').normalize('NFKC').trim().toUpperCase();}
  function status(msg, error=false){ const e=$('status'); if(e){e.textContent=msg;e.className='status'+(error?' error':'');} }
  function localState(){return {schema:9,transferCheck,participantCode,userId,caseId:current.id,caseVersion:current.version,sessionId,step,initial,final,transfer,reflection,activeText,gapNote,viewed:[...viewed],extraShown,done,feedbackOpen,nextFocus,updatedAt:new Date().toISOString()};}
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
    activeText=s.activeText||'';gapNote=s.gapNote||'';transferCheck=s.transferCheck||'';viewed=new Set((s.viewed||[]).filter(x=>typeof x==='string'));extraShown=Boolean(s.extraShown);done=Boolean(s.done);feedbackOpen=Boolean(s.feedbackOpen);nextFocus=s.nextFocus||'';
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
    current=c;sessionId=uuid();step=1;initial='';final='';transfer='';reflection='';activeText='';gapNote='';transferCheck='';viewed=new Set();extraShown=false;done=false;feedbackOpen=false;nextFocus='';saveFailed=false;cache();log('start',{});render();
  }
  const focusChoices=[
    {id:'fact',label:'事実と推測を分けて考える'},
    {id:'multiple',label:'背景の可能性を複数考える'},
    {id:'information',label:'判断前に確認したい情報を具体化する'},
    {id:'reason',label:'対応を選ぶ理由まで説明する'},
    {id:'other',label:'まだ決めていない・その他'}
  ];
  const focusLabel=id=>(focusChoices.find(x=>x.id===id)||{label:'未選択'}).label;
  function label(){
    $('caseText').textContent=`${current.age}\n${current.description}`;
    $('caseSelect').value=current.id;
    for(let i=1;i<=6;i++)$('s'+i).classList.toggle('on',!done && i===step);
  }
  function feedbackHtml(){
    const f=current.feedback||{}, notes=[];
    notes.push('追加の観察情報を確認しました。');
    notes.push(viewed.size?`ヒントを${viewed.size}種類確認しました。`:'ヒントは利用せずに考えました。');
    const example=f.example||'現在の情報だけでは理由を断定できません。本人・活動・環境の情報を確認し、複数の可能性と対応の根拠を検討します。';
    return `<div class="feedback"><h3>回答例（教員作成・一例）</h3><div class="saved">${esc(example)}</div><h3>なぜ、このように考えるのか</h3><p>${esc(f.main||'行動だけで結論を出さず、観察された事実と推測を分け、確認事項から対応を考えましょう。')}</p><h3>考える際に確認したい点</h3><ul>${(f.checks||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="tip">回答例は唯一の正解ではありません。事実・可能性・必要な情報・対応の根拠が示されているか、自分の回答と比べてみてください。</p><h3>今回の学習過程</h3><p>${esc(notes.join(' '))}</p><p>閲覧履歴から回答の良し悪しを判定することはできません。自分の考えの変化を確かめてみましょう。</p></div>`;
  }
  const response = (title,content,open=false)=>`<details ${open?'open':''}><summary>${esc(title)}</summary><div class="saved">${esc(content||'（入力なし）')}</div></details>`;
  const focusOptions=()=>`<div class="choices">${focusChoices.map(c=>`<label class="choice"><input type="radio" name="nextFocus" value="${c.id}" ${nextFocus===c.id?'checked':''}>${esc(c.label)}</label>`).join('')}</div>`;
  function render(){
    label();let html='';
    if(done){
      html=`<h2>学習が完了しました</h2><p>今回選んだ視点：<strong>${esc(focusLabel(nextFocus))}</strong></p><p>別事例での自己確認：<strong>${esc(({yes:'意識して考えることができた',partly:'意識したが、十分には考えられなかった',no:'考えるときに忘れていた・難しかった'})[transferCheck]||'未回答')}</strong></p><details><summary>別事例について考える手がかりを確認する</summary><p>${esc(current.transferFeedback||'本人・活動・環境について確認することを考えましょう。')}</p></details><div class="btns"><button id="restart">新しい取り組みを始める</button></div>`;
    }else if(step===1){
      html=`<h2>1. まず自分で考える</h2><p>${esc(current.prompts.initial)}</p><label for="answer">最初の回答</label><textarea id="answer" placeholder="今わかっている範囲で書いてください。">${esc(activeText)}</textarea><p class="tip">入力途中の文章はこのブラウザ内に自動保存されます。「次へ」を押すと回答が送信されます。</p><div class="btns"><button id="next" class="primary">回答を保存して追加情報へ →</button></div>`;
    }else if(step===2){
      html=`<h2>2. 追加の観察情報を確認する</h2><p>ここからは全員が確認する情報です。最初の事例と比べ、考え直す必要がある点や、まだ分からない点を探してみましょう。</p>${response('自分の最初の回答',initial)}<div class="story"><strong>追加の観察情報</strong><p>${esc(current.extra)}</p></div><label for="gapNote">この情報を見ても、まだ判断できないことは？（任意）</label><textarea id="gapNote" rows="3" placeholder="例：本人が説明を理解できていたかどうか">${esc(gapNote)}</textarea><div class="btns"><button id="next" class="primary">確認して最終回答へ →</button></div>`;
    }else if(step===3){
      html=`<h2>3. ヒントを使いながら最終回答する</h2><p>${esc(current.prompts.final)}</p><p class="tip">必要だと思ったときにヒントを選んで開けます。ヒントを使っても減点されません。</p><div class="review">${response('最初の回答を見返す',initial)}${response('追加の観察情報を見返す',current.extra)}${gapNote?response('まだ判断できないことのメモ',gapNote):''}</div><h3>考えるためのヒント（任意）</h3>`;
      current.hints.forEach(h=>{html+=`<div class="hint"><strong>${esc(h.title)}</strong><span class="tag">${esc(h.type)}</span>${viewed.has(h.id)?`<details><summary>ヒントを見返す（表示／非表示）</summary><p>${esc(h.text)}</p></details>`:`<div class="btns"><button type="button" data-hint="${esc(h.id)}">このヒントを見る</button></div>`}</div>`;});
      html+=`<label for="answer">最終回答</label><textarea id="answer" placeholder="追加情報や必要なヒントを参考に、判断とその理由をまとめましょう。">${esc(activeText)}</textarea><div class="btns"><button id="back">← 追加情報に戻る</button><button id="next" class="primary">最終回答を保存して振り返る →</button></div>`;
    }else if(step===4){
      if(!feedbackOpen){
        html=`<h2>4. 自分の回答を振り返る</h2><p><strong>最初の回答と最終回答を見比べて</strong>、考えが変わったところ、または判断を維持した理由を振り返ってみましょう。</p><div class="review">${response('最初の回答',initial,true)}${response('最終回答',final,true)}</div><label for="answer">振り返り</label><textarea id="answer">${esc(activeText)}</textarea><div class="btns"><button id="back">← 最終回答に戻る</button><button id="next" class="primary">振り返りを確定して解説へ →</button></div>`;
      }else{
        html=`<h2>4. 解説を確かめ、次の目標を選ぶ</h2><p>まず回答例と理由を読み、自分の回答でできていたこと、新しく気づいたことを確かめてください。</p>${feedbackHtml()}${response('自分の最終回答を見返す',final)}${response('自分の振り返りを見返す',reflection)}<h3>次の事例で、特に意識したいことを1つ選びましょう</h3><p>次の事例では、ここで選んだ視点を実際に試します。正解・不正解はありません。</p>${focusOptions()}<div class="btns"><button id="toTransfer" class="primary">視点を決めて別事例へ →</button></div>`;
      }
    }else if(step===5){
      html=`<h2>5. 選んだ視点を別事例で試す</h2><p>先ほどの事例で学んだ考え方を、新しい場面で試してみましょう。<strong>前と同じ支援方法を使う必要はありません。</strong></p><div class="focus-box"><strong>今回、自分が意識する視点</strong><p>${esc(focusLabel(nextFocus))}</p></div><div class="story">${esc(current.transfer)}</div><p class="tip">この事例については、ヒントなしで自分の考えをまとめてみましょう。</p><label for="answer">別事例への回答</label><textarea id="answer">${esc(activeText)}</textarea><div class="btns"><button id="next" class="primary">回答を保存して自己確認へ →</button></div>`;
    }else if(step===6){
      html=`<h2>6. 別事例での取り組みを確かめる</h2><p>選んだ視点を実際に意識できたか、自分の回答を見ながら振り返りましょう。</p><div class="focus-box"><strong>意識すると決めた視点</strong><p>${esc(focusLabel(nextFocus))}</p></div>${response('別事例への自分の回答',transfer,true)}<h3>選んだ視点を、別事例で意識できましたか？</h3><div class="choices">${[{id:'yes',label:'意識して考えることができた'},{id:'partly',label:'意識したが、十分には考えられなかった'},{id:'no',label:'考えるときに忘れていた・難しかった'}].map(c=>`<label class="choice"><input type="radio" name="transferCheck" value="${c.id}" ${transferCheck===c.id?'checked':''}>${c.label}</label>`).join('')}</div><p class="tip">これは自己確認です。回答の良し悪しを自動採点するものではありません。</p><div class="btns"><button id="complete" class="primary">自己確認を記録して完了する</button></div>`;
    }
    $('stage').innerHTML=html+'<p id="status" class="status" role="status"></p>';
    $('answer')?.addEventListener('input',rememberInput);
    $('gapNote')?.addEventListener('input',e=>{gapNote=e.target.value;cache();});
    $('next')?.addEventListener('click',next);
    $('back')?.addEventListener('click',()=>{
      rememberInput();if(step===3){step=2;activeText='';}else if(step===4&&!feedbackOpen){step=3;activeText=final;}
      cache();render();
    });
    document.querySelectorAll('[data-hint]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.hint;if(!viewed.has(id)){viewed.add(id);log('hint_open',{hint_id:id});}rememberInput();render();}));
    document.querySelectorAll('input[name="nextFocus"]').forEach(r=>r.addEventListener('change',e=>{nextFocus=e.target.value;cache();}));
    document.querySelectorAll('input[name="transferCheck"]').forEach(r=>r.addEventListener('change',e=>{transferCheck=e.target.value;cache();}));
    $('toTransfer')?.addEventListener('click',()=>{
      if(!nextFocus){status('次に意識する視点を1つ選んでください。',true);return;}
      log('reflection',{text:reflection,next_focus:nextFocus,next_focus_label:focusLabel(nextFocus),phase:'after_primary_case'});
      step=5;activeText=transfer;cache();render();
    });
    $('complete')?.addEventListener('click',async()=>{
      if(!transferCheck){status('別事例での自己確認を選択してください。',true);return;}
      log('reflection',{text:reflection,phase:'after_transfer',transfer_self_assessment:transferCheck,next_focus:nextFocus,next_focus_label:focusLabel(nextFocus)});
      done=true;cache();render();status('学習記録を送信しています…');await pending;
      status(saveFailed?'送信できなかった記録があります。担当の教員に連絡してください。':mode==='demo'?'デモ記録をブラウザに保存しました。':'学習記録を送信しました。',saveFailed);
    });
    $('restart')?.addEventListener('click',()=>{if(confirm('新しい取り組みを始めますか？'))newSession(current);});
    if(localFailed)status('このブラウザ内への一時保存に失敗しています。',true);
    else if(saveFailed)status('学習記録の送信に失敗した履歴があります。担当の教員に連絡してください。',true);
    else if(!done)status('入力途中はこのブラウザに自動保存され、回答を確定すると学習記録として送信されます。');
  }
  function next(){
    const val=$('answer')?.value.trim();
    if([1,3,4,5].includes(step)&&!val){status('回答を入力してください。',true);return;}
    if(step===1){initial=val;log('draft',{text:val});step=2;activeText='';extraShown=true;log('extra_open',{extra_id:'observation',presentation:'required'});}
    else if(step===2){step=3;activeText=final;}
    else if(step===3){final=val;log('final',{text:val,reconsideration_note:gapNote});step=4;activeText=reflection;}
    else if(step===4){reflection=val;feedbackOpen=true;activeText='';}
    else if(step===5){transfer=val;log('transfer',{text:val,next_focus:nextFocus});step=6;activeText='';}
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
    if(saved&&(saved.schema===9)&&normalizeParticipantCode(saved.participantCode||'')===participantCode&&byId(saved.caseId)?.version===saved.caseVersion&&saved.userId===userId&&typeof saved.sessionId==='string'&&saved.step>=1&&saved.step<=6){
      if(confirm(saved.done?'前回は課題を完了しています。前回の画面を表示しますか？（キャンセルすると新しい取り組みを開始）':'このブラウザに前回の入力途中の記録があります。続きを再開しますか？（キャンセルすると新しい取り組みを開始）')){
        loadSaved(saved);render();status(saved.done?'前回の完了画面を表示しています。':'前回の入力内容を復元しました。');return;
      }
    }
    newSession(current);
  }
  boot();
})();
