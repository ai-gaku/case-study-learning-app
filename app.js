(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const config = window.APP_CONFIG || {};
  const configured = Boolean(config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY);
  const db = configured && window.supabase ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY) : null;
  const id = () => crypto.randomUUID();
  let current = window.CASES[0];
  let sessionId = id();
  let step = 1, initial = '', final = '', transfer = '', reflection = '', viewed = new Set(), extraShown = false;
  let pending = Promise.resolve();
  let saveFailed = false;
  let mode = 'demo';
  const demoKey = 'case-study-trial-v1';
  function status(message, error=false){ const el=$('status'); if(el){el.textContent=message;el.className='status'+(error?' error':'');} }
  const eventTypes = new Set(['start','draft','hint_open','extra_open','final','transfer','reflection']);
  function log(type, payload={}){
    if(!eventTypes.has(type)) return;
    const record = {session_id:sessionId,case_id:current.id,case_version:current.version,event_type:type,payload};
    if(mode === 'demo') {
      const items=JSON.parse(localStorage.getItem(demoKey)||'[]'); items.push({...record,created_at:new Date().toISOString()});
      localStorage.setItem(demoKey,JSON.stringify(items));return;
    }
    // 非同期保存は順番を保持し、失敗時に「保存できた」と表示しない。
    pending=pending.then(async()=>{
      const {error}=await db.from('learning_events').insert(record);
      if(error) throw error;
    }).catch(e=>{
      saveFailed=true;
      console.error('データ保存エラー',e);
      status('保存に失敗しました。通信・Supabase設定を確認し、教員へ知らせてください。',true);
    });
  }
  function newSession(caseObject){
    current=caseObject;sessionId=id();step=1;saveFailed=false;initial='';final='';transfer='';reflection='';viewed=new Set();extraShown=false;
    log('start',{});render();
  }
  function render(){
    $('caseText').textContent = `${current.age}\n${current.description}`;
    $('caseSelect').value=current.id;
    for(let i=1;i<=5;i++)$('s'+i).classList.toggle('on',i===step);
    let html='';
    if(step===1)html=`<h2>1. まず自分の考えを残す</h2><p>${esc(current.prompts.initial)}</p><label for="answer">最初の回答</label><textarea id="answer" placeholder="今わかっている範囲で書いてください。ここで正解を出す必要はありません。">${esc(initial)}</textarea><p class="tip">最初の考えは後の回答と比較するために保存します。<strong>回答を入力してから</strong>次に進んでください。</p><div class="btns"><button id="next" class="primary">最初の回答を保存して進む →</button></div>`;
    if(step===2){
      html=`<h2>2. 必要な学習支援を選ぶ</h2><p>ヒントは必要なものだけ開いてください。使わずに進むこともできます。<strong>ヒントの利用自体は減点しません。</strong></p>`;
      html+=`<div class="tip"><strong>最初の回答</strong><div class="saved">${esc(initial)}</div></div>`;
      html+=`<div class="hint"><button id="extra">${extraShown?'追加の観察情報を再表示':'追加の観察情報を確認'}</button><div id="extraText">${extraShown?esc(current.extra):''}</div></div>`;
      current.hints.forEach((h,i)=>html+=`<div class="hint"><strong>${esc(h.title)}</strong><span class="tag">${esc(h.type)}</span><div class="btns"><button data-hint="${esc(h.id)}">${viewed.has(h.id)?'ヒントを再表示':'必要ならヒントを見る'}</button></div>${viewed.has(h.id)?`<p>${esc(h.text)}</p>`:''}</div>`);
      html+=`<div class="btns"><button id="back">← 戻る</button><button id="next" class="primary">最終回答へ →</button></div>`;
    }
    if(step===3)html=`<h2>3. 自分で最終回答をまとめる</h2><p>${esc(current.prompts.final)}</p><p class="tip">初回の回答を参考にしてもかまいません。考えを変更しない場合も、根拠を書いてください。</p><label for="answer">最終回答</label><textarea id="answer" placeholder="事実・推測・確認したいこと・検討する対応を整理しましょう。">${esc(final)}</textarea><div class="btns"><button id="back">← ヒントに戻る</button><button id="next" class="primary">最終回答を保存して進む →</button></div>`;
    if(step===4)html=`<h2>4. 別の事例で考える</h2><p>ここでは、学習用の思考ヒントは表示しません。無理なく書ける範囲で回答してください。</p><div class="story">${esc(current.transfer)}</div><label for="answer">別事例への回答</label><textarea id="answer">${esc(transfer)}</textarea><div class="btns"><button id="back">← 戻る</button><button id="next" class="primary">別事例の回答を保存して進む →</button></div>`;
    if(step===5)html=`<h2>5. 振り返り</h2><p>最初と最後で、考え方はどう変わりましたか。変わらなかった場合は、その理由を書いてください。また、次の課題で意識したいことを一つ書いてください。</p><div class="tip"><strong>最初の回答</strong><div class="saved">${esc(initial)}</div><strong>最終回答</strong><div class="saved">${esc(final)}</div></div><label for="answer">振り返り</label><textarea id="answer">${esc(reflection)}</textarea><div class="btns"><button id="back">← 戻る</button><button id="next" class="primary">振り返りを保存して完了</button></div>`;
    $('stage').innerHTML=html+'<p id="status" class="status" role="status"></p>';
    $('next')?.addEventListener('click',next);
    $('back')?.addEventListener('click',()=>{step--;render();});
    $('extra')?.addEventListener('click',()=>{
      if(!extraShown){extraShown=true;log('extra_open',{extra_id:'observation'});}
      render();
    });
    document.querySelectorAll('[data-hint]').forEach(btn=>btn.addEventListener('click',()=>{
      const hintId=btn.dataset.hint;
      if(!viewed.has(hintId)){viewed.add(hintId);log('hint_open',{hint_id:hintId});}
      render();
    }));
  }
  async function next(){
    const value=$('answer')?.value.trim();
    if(step!==2 && !value){status('回答を入力してください。',true);return;}
    if(step===1){initial=value;log('draft',{text:value});step=2;}
    else if(step===2)step=3;
    else if(step===3){final=value;log('final',{text:value});step=4;}
    else if(step===4){transfer=value;log('transfer',{text:value});step=5;}
    else if(step===5){reflection=value;log('reflection',{text:value});$('stage').innerHTML='<h2>完了しました</h2><p>ご協力ありがとうございました。今回の記録を次の課題の学習につなげます。</p><p id="status" class="status" role="status">保存状態を確認しています…</p>';await pending;if(saveFailed){status('一部の保存に失敗しました。教員にお知らせください。',true);}else{status(mode==='demo'?'この端末のブラウザにデモ記録を仮保存しました。':'データベースへの保存を確認しました。');}return;}
    render();
  }
  async function boot(){
    window.CASES.forEach(c=>{const opt=document.createElement('option');opt.value=c.id;opt.textContent=c.title;$('caseSelect').appendChild(opt);});
    $('caseSelect').addEventListener('change',e=>{
      if(!confirm('別の事例に切り替えると、この画面で入力途中の内容は引き継がれません。切り替えますか？')){e.target.value=current.id;return;}
      newSession(window.CASES.find(c=>c.id===e.target.value));
    });
    if(db){
      try{
        let {data:{session},error:e}=await db.auth.getSession(); if(e)throw e;
        if(!session){const r=await db.auth.signInAnonymously();if(r.error)throw r.error;}
        mode='database';$('mode').textContent='データベース接続';
      }catch(e){console.error(e);$('mode').textContent='接続エラー';$('stage').innerHTML='<h2>データベースに接続できません</h2><p>設定を確認してください。回答を始めることはできません。</p>';return;}
    }else{$('mode').textContent='デモ（ブラウザ内保存）';}
    newSession(current);
  }
  boot();
})();
