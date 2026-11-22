/* ============================================================================
   nukuu.js — NUKUU ZA SOMO (Preview tu)            Toleo 1
   Faili linalojitegemea: HALIBADILISHI msimbo wowote uliopo kwenye index.html.
   Ukiondoa mstari wa <script src="nukuu.js"></script>, app inarudi kama ilivyokuwa.
   Linatumia vitu vilivyopo tayari: showView, titles, callClaude, MTAALA_TIE,
   PH_PROXY_URL, PH_MODELS, firebase, currentNgazi, getGradesForNgazi, getSubjectsFor.
   Njia 1: AI kutoka mtaala (TIE).   Njia 2: picha za kurasa -> maandishi -> AI inapanga.
   ========================================================================== */
(function(){
'use strict';
if(window.__nukuuLoaded) return; window.__nukuuLoaded = true;

var MAX_PHOTOS = 15, MAX_CHUNK = 3000, MAX_CHUNKS = 20, MAX_SRC = 70000;
var LS_DRAFT = 'nukuu_draft_v1';
var st = { mode:'mtaala', ngazi:'msingi', plan:[], out:[], idx:0, running:false, stop:false, meta:null, photoBusy:false };

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function xml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function lsGet(k){ try{ return JSON.parse(localStorage.getItem(k)||'{}')||{}; }catch(e){ return {}; } }
function lsSet(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function who(){ try{ var u=firebase.auth().currentUser; return (u && (u.displayName||u.email)) || ''; }catch(e){ return ''; } }

/* ---------- Lugha ya maudhui ---------- */
function nkLang(ngazi, subject){
  var s = String(subject||'').toLowerCase();
  if(ngazi === 'msingi') return /english|kiingereza/.test(s) ? 'en' : 'sw';
  if(s === 'kiswahili' || s === 'historia ya tanzania na maadili') return 'sw';
  return 'en';
}

/* ---------- Mtaala ---------- */
function nkRec(grade, subject){
  var map = { 'History ya Tanzania na Maadili':'Historia ya Tanzania na Maadili', 'Sayansi na Teknolojia':'Sayansi' };
  var key = map[subject] || subject;
  try{ return (MTAALA_TIE[grade] && MTAALA_TIE[grade][key]) || null; }catch(e){ return null; }
}
function nkTopicOptions(rec){
  var out = [];
  if(!rec || !rec.k) return out;
  rec.k.forEach(function(k, ki){
    var group = { label:(k.n||'')+' '+(k.j||''), items:[] };
    (k.m||[]).forEach(function(m, mi){ group.items.push({ v: ki+'|'+mi, label:(m.n||'')+' '+(m.j||'') }); });
    if(group.items.length) out.push(group);
  });
  return out;
}

/* ---------- Kujenga mpango wa maombi ---------- */
var RULES = 'Kanuni: tumia maarifa sahihi tu; USIBUNI takwimu, tarehe, majina wala nukuu usizozijua kwa uhakika (ukiwa na shaka, andika kwa ujumla). ' +
  'Tumia umbizo rahisi: "## " kwa vichwa, "- " kwa orodha, **neno** kwa msisitizo. Usiandike maneno ya mazungumzo kwa mtumiaji; toa nukuu yenyewe tu.';
var L = {
  sw:{ title:'Nukuu za Somo', draft:'Rasimu iliyotengenezwa na AI — mwalimu ahakiki usahihi kabla ya kutumia darasani.', intro:'Utangulizi', examples:'Mifano na Matumizi', summary:'Muhtasari', keys:'Maneno Muhimu', questions:'Maswali ya Kujipima', answers:'Majibu', main:'Maelezo Makuu', concepts:'Dhana Kuu', detail:'Maelezo ya Kina', uses:'Matumizi na Umuhimu' },
  en:{ title:'Lesson Notes', draft:'AI-generated draft — the teacher should verify accuracy before using it in class.', intro:'Introduction', examples:'Examples and Applications', summary:'Summary', keys:'Key Terms', questions:'Review Questions', answers:'Answers', main:'Main Explanation', concepts:'Key Concepts', detail:'Detailed Explanation', uses:'Applications and Importance' }
};
function langLine(l){ return l==='en' ? 'Write EVERYTHING in English, including every heading and label; do not use any Swahili words.' : 'Andika kila kitu kwa Kiswahili sanifu, ikiwemo vichwa vyote.'; }
function hdr(c){
  return 'Wewe ni mwalimu mzoefu wa ' + c.subject + ' nchini Tanzania. Unaandaa NUKUU ZA SOMO kwa wanafunzi wa ' + c.grade + ', kufuata mtaala wa TIE.\n' +
    'Somo: ' + c.subject + '\nMada kuu: ' + (c.main||'—') + '\nMada ndogo: ' + (c.sub||'—') + '\n' + langLine(c.lang) + '\n' + RULES + '\n' +
    (c.extra ? 'Maelekezo ya ziada ya mwalimu: ' + c.extra + '\n' : '');
}
function planMtaala(c){
  var p = [], T = L[c.lang] || L.sw;
  if(c.ngazi === 'msingi'){
    p.push({ title:'Nukuu', max:2200, prompt: hdr(c) +
      'Andika nukuu fupi na rahisi kwa umri wa ' + c.grade + ' (maneno 350–500, sentensi fupi) zenye sehemu hizi, kwa vichwa hivi hasa: "## ' + T.intro + '" (sentensi 2–3), "## ' + T.main + '" (pointi/aya fupi), "## ' + T.examples + '" (mifano 2–3), "## ' + T.summary + '" (pointi 3–5), "## ' + T.questions + '" (maswali 5, bila majibu).' +
      (c.items.length ? '\nVipengele vya mtaala vya kufunika: ' + c.items.join('; ') : '') });
    return p;
  }
  p.push({ title:T.intro, max:1400, prompt: hdr(c) + 'Andika "## ' + T.intro + '": umuhimu wa mada, malengo ya kujifunza (pointi 4–6) na maneno muhimu (key terms) yenye maana fupi. Maneno 200–300.' });
  var items = c.items.slice(0, 6);
  if(items.length){
    items.forEach(function(it, i){
      p.push({ title:'Kipengele ' + (i+1), max:2600, prompt: hdr(c) +
        'Andika maelezo ya kina ya kipengele hiki cha mtaala: "' + it + '". Anza na kichwa cha "## ". Eleza dhana, hatua au sababu kwa mtiririko, ukitumia vichwa vidogo na orodha pale inapofaa. Maneno 350–500.' });
    });
  }else{
    [T.concepts, T.detail, T.uses].forEach(function(t){
      p.push({ title:t, max:2600, prompt: hdr(c) + 'Andika sehemu ya "## ' + t + '" ya nukuu hii kwa kina (maneno 350–500), kwa vichwa vidogo na orodha pale inapofaa.' });
    });
  }
  p.push({ title:T.examples, max:2000, prompt: hdr(c) + 'Andika "## ' + T.examples + '": mifano 4–6 iliyoelezwa hatua kwa hatua (au mifano halisi ya maisha ya Tanzania pale somo halihusishi hesabu).' });
  p.push({ title:T.summary, max:1200, prompt: hdr(c) + 'Andika "## ' + T.summary + '" wa mada hii (pointi 6–8) na "## ' + T.keys + '" (orodha fupi).' });
  p.push({ title:T.questions, max:1800, prompt: hdr(c) + 'Andika "## ' + T.questions + '": maswali 8 ya aina mbalimbali (chaguo, majibu mafupi, maelezo), kisha "## ' + T.answers + '" yenye majibu mafupi sahihi.' });
  return p;
}
function nkChunks(text){
  var paras = String(text||'').split(/\n{2,}/), out = [], cur = '';
  paras.forEach(function(p){
    p = p.trim(); if(!p) return;
    while(p.length > MAX_CHUNK){ if(cur){ out.push(cur); cur=''; } out.push(p.slice(0, MAX_CHUNK)); p = p.slice(MAX_CHUNK); }
    if((cur + '\n\n' + p).length > MAX_CHUNK && cur){ out.push(cur); cur = p; } else { cur = cur ? cur + '\n\n' + p : p; }
  });
  if(cur) out.push(cur);
  return out;
}
function planPicha(c, text){
  var chunks = nkChunks(text), p = [];
  var cut = chunks.length > MAX_CHUNKS;
  chunks.slice(0, MAX_CHUNKS).forEach(function(ch, i){
    p.push({ title:'Sehemu ' + (i+1), max:3200, prompt:
      'Maandishi haya yametoka kwenye picha za kurasa za kitabu/karatasi ya mwalimu (yanaweza kuwa na makosa madogo ya kusoma). Yapange kuwa nukuu safi za wanafunzi wa ' + c.grade + ' (' + c.subject + '): ' +
      'tumia vichwa ("## "), orodha na aya fupi; sahihisha makosa ya wazi ya herufi pekee; USIONDOE maudhui na USIONGEZE ukweli mpya nje ya maandishi haya. ' +
      'Andika kwa lugha ileile ya maandishi. Toa nukuu tu, bila maelezo yako.' + (c.extra ? '\nMaelekezo ya ziada ya mwalimu: ' + c.extra : '') + '\n\nMaandishi:\n"""\n' + ch + '\n"""' });
  });
  p.push({ title:'Muhtasari na Maswali', max:2200, prompt:
    'Kutokana na maandishi haya ya somo la ' + c.subject + ' (' + c.grade + '), andika muhtasari (pointi 5–8), kisha maswali ya kujipima (maswali 8 ya aina mbalimbali) na majibu mafupi. Kila sehemu iwe na kichwa cha "## ". ' +
    'Vichwa viwe kwa lugha ileile ya maandishi: kama ni Kiingereza tumia "Summary", "Review Questions", "Answers"; kama ni Kiswahili tumia "Muhtasari", "Maswali ya Kujipima", "Majibu". ' +
    'Tumia maudhui ya maandishi haya tu; usibuni ukweli. Andika kwa lugha ileile ya maandishi.\n\nMaandishi:\n"""\n' + text.slice(0, 6000) + '\n"""' });
  return { plan:p, cut:cut };
}

/* ---------- Kuita AI (kupitia callClaude iliyopo) ---------- */
async function nkAI(prompt, max){
  var lastErr;
  for(var t=0; t<2; t++){
    var saved = window.MT_VARIANT_NOTE; window.MT_VARIANT_NOTE = null;   // usiingize maelekezo ya Mitihani
    try{ return await callClaude(prompt, max, { reasoning_effort:'low' }); }
    catch(e){
      lastErr = e;
      var m = String((e && e.message) || e);
      if(/ingia|kikomo|401|403|429/i.test(m)) break;   // makosa haya hayarudiwi
    }
    finally{ window.MT_VARIANT_NOTE = saved; }
  }
  throw lastErr;
}

/* ---------- Kusoma picha ---------- */
function nkLoadImg(blob){
  var url = URL.createObjectURL(blob);
  return new Promise(function(res, rej){
    var i = new Image();
    i.onload = function(){ URL.revokeObjectURL(url); res(i); };
    i.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('img')); };
    i.src = url;
  }).catch(function(){ return createImageBitmap(blob); });
}
async function nkToDataUrl(file){
  var src, W, H;
  try{ src = await nkLoadImg(file); }
  catch(e){
    // HEIC/HEIF (simu nyingi): badilisha kuwa JPG kwa kutumia zana zilezile za 'Soma Matokeo kwa Picha'
    var kind = ''; try{ kind = window.phSniff ? await window.phSniff(file) : ''; }catch(e1){}
    var isHeic = kind === 'heic' || /hei[cf]/i.test(String(file.type||'') + ' ' + String(file.name||''));
    if(!isHeic || !window.phLoadHeic) throw new Error('Picha haisomeki. Tumia picha ya JPG au PNG.');
    try{
      var h = await window.phLoadHeic();
      var out = await Promise.race([
        h({ blob:file, toType:'image/jpeg', quality:0.92 }),
        new Promise(function(_, no){ setTimeout(function(){ no(new Error('muda')); }, 60000); })
      ]);
      var blob = Array.isArray(out) ? out[0] : out;
      if(!blob || !blob.size) throw new Error('tupu');
      src = await nkLoadImg(blob);
    }catch(e2){
      throw new Error('Kubadilisha picha ya HEIC kumeshindwa (inahitaji intaneti mara ya kwanza). Jaribu tena au tumia JPG.');
    }
  }
  W = src.naturalWidth || src.width; H = src.naturalHeight || src.height;
  var sc = Math.min(1, 1800 / Math.max(W, H)), cv = document.createElement('canvas');
  cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.85);
}
var OCR_PROMPT = 'Soma maandishi YOTE kwenye picha ya ukurasa huu wa kitabu/karatasi, kama yalivyo, kwa mpangilio wa kusoma. ' +
  'Rudisha maandishi tu bila maelezo yako. Vichwa vya habari vianze na "## ". Sehemu isiyosomeka andika [haisomeki]. Usiongeze chochote kisichokuwepo kwenye picha.';
async function nkVision(dataUrl){
  if(typeof PH_PROXY_URL === 'undefined' || !PH_PROXY_URL) throw new Error('Anwani ya seva (PH_PROXY_URL) haijawekwa.');
  var auth; try{ auth = await firebase.auth().currentUser.getIdToken(); }catch(e){ throw new Error('Hujaingia. Toka (log out) kisha ingia tena.'); }
  var models = (typeof PH_MODELS !== 'undefined' && PH_MODELS.length) ? PH_MODELS : [];
  var res, detail = '';
  for(var i=0; i<models.length; i++){
    var body = { model:models[i], temperature:0, max_tokens:3000,
      messages:[{ role:'user', content:[{ type:'text', text:OCR_PROMPT }, { type:'image_url', image_url:{ url:dataUrl } }] }] };
    var ctl = new AbortController(), tm = setTimeout(function(){ ctl.abort(); }, 90000);
    try{ res = await fetch(PH_PROXY_URL, { method:'POST', signal:ctl.signal, headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + auth }, body:JSON.stringify(body) }); }
    catch(e){ clearTimeout(tm); throw new Error(e && e.name === 'AbortError' ? 'Kusoma picha kumechelewa sana. Jaribu tena.' : 'Imeshindwa kuunganisha na seva. Angalia mtandao.'); }
    clearTimeout(tm);
    if(res.ok) break;
    try{ detail = (await res.text()).replace(/\s+/g,' ').slice(0,200); }catch(e){}
    if(res.status !== 404 && res.status !== 410 && res.status !== 400) break;
  }
  if(!res || !res.ok){
    var s = res ? res.status : 0;
    if(s === 401 || s === 403) throw new Error('Hujaingia au huna ruhusa. Toka (log out), ingia tena kisha jaribu.');
    if(s === 429) throw new Error('Kikomo cha maombi kimefikiwa. Subiri kidogo kisha jaribu tena.');
    throw new Error('Hitilafu ya seva' + (s ? ' ' + s : '') + (detail ? ' — ' + detail : ''));
  }
  var data = await res.json();
  var txt = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  txt = txt.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if(!txt) throw new Error('Hakuna maandishi yaliyosomwa kwenye picha hii.');
  return txt;
}

/* ---------- Markdown nyepesi -> HTML salama ---------- */
function nkMd(text){
  var lines = esc(text).split('\n'), html = '', list = '';
  function inl(s){ return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
  function close(){ if(list){ html += '</' + list + '>'; list = ''; } }
  lines.forEach(function(l){
    var t = l.trim(), m;
    if(!t){ close(); return; }
    if((m = t.match(/^#{1,4}\s+(.*)$/))){ close(); html += '<h3>' + inl(m[1]) + '</h3>'; return; }
    if((m = t.match(/^[-*•]\s+(.*)$/))){ if(list !== 'ul'){ close(); html += '<ul>'; list = 'ul'; } html += '<li>' + inl(m[1]) + '</li>'; return; }
    if((m = t.match(/^\d+[.)]\s+(.*)$/))){ if(list !== 'ol'){ close(); html += '<ol>'; list = 'ol'; } html += '<li>' + inl(m[1]) + '</li>'; return; }
    close(); html += '<p>' + inl(t) + '</p>';
  });
  close(); return html;
}

/* ---------- Kiolesura ---------- */
var CSS = '#view-nukuu .nk-tabs{display:flex;gap:8px;margin-bottom:14px}' +
'.nk-tab{flex:1;padding:10px 8px;border-radius:8px;border:1px solid rgba(244,239,225,.3);background:transparent;color:var(--chalk);font:600 13px "Helvetica Neue",Arial,sans-serif;cursor:pointer}' +
'.nk-tab.on{border-color:var(--amber);color:var(--amber);background:rgba(217,147,47,.12)}' +
'.nk-btn{padding:11px 16px;border-radius:8px;border:1px solid var(--amber);background:var(--amber);color:var(--board-dark);font:700 13.5px "Helvetica Neue",Arial,sans-serif;cursor:pointer;margin:0 8px 8px 0}' +
'.nk-btn.sec{background:transparent;color:var(--chalk);border-color:rgba(244,239,225,.35)}' +
'.nk-btn:disabled{opacity:.5;cursor:not-allowed}' +
'.nk-status{font:12.5px "Helvetica Neue",Arial,sans-serif;color:var(--sage);margin:10px 0;line-height:1.5}' +
'.nk-status.err{color:#f0b3a6}' +
'.nk-paper{position:relative;background:var(--paper);color:var(--ink);border-radius:8px;padding:22px 20px;min-height:220px;overflow:hidden}' +
'.nk-paper.nk-locked{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}' +
'.nk-tools{display:flex;flex-wrap:wrap;margin-bottom:4px}' +
'.nk-wm{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2}' +
'.nk-body{position:relative;z-index:1;font:15px/1.65 Georgia,serif}' +
'.nk-body h2{margin:0 0 4px;font-size:19px}.nk-body h3{margin:18px 0 6px;font-size:16px;color:var(--amber-dark)}' +
'.nk-body ul,.nk-body ol{margin:6px 0 10px 20px;padding:0}.nk-body p{margin:6px 0}' +
'.nk-meta{font:12px "Helvetica Neue",Arial,sans-serif;color:var(--muted);margin-bottom:10px}' +
'.nk-note{font:11.5px "Helvetica Neue",Arial,sans-serif;color:var(--muted);margin-top:18px;border-top:1px solid var(--paper-line);padding-top:8px}' +
'.nk-empty{font:13px "Helvetica Neue",Arial,sans-serif;color:var(--muted)}' +
'@media print{#view-nukuu:not(.nk-lic) .nk-paper{display:none!important}#view-nukuu:not(.nk-lic)::before{content:"Nukuu ni za Preview tu — kuchapisha kunahitaji leseni.";display:block;padding:20px;font:16px Arial,sans-serif}}';

var HTML = '<div class="layout"><div class="panel">' +
'<div class="nk-tabs"><button type="button" class="nk-tab on" id="nk_ng_msingi">Shule ya Msingi</button><button type="button" class="nk-tab" id="nk_ng_sek">Sekondari</button></div>' +
'<div class="nk-tabs"><button type="button" class="nk-tab on" id="nk_tab_mtaala">📚 Kutoka mtaala</button><button type="button" class="nk-tab" id="nk_tab_picha">📷 Kutoka picha</button></div>' +
'<div class="row2"><div class="field"><label>Darasa/Kidato</label><select id="nk_grade"></select></div><div class="field"><label>Somo</label><select id="nk_subject"></select></div></div>' +
'<div class="field"><label>Mada ndogo (kutoka mtaala wa TIE)</label><select id="nk_topic"></select></div>' +
'<div class="field"><label>…au andika mada mwenyewe (hiari)</label><input id="nk_topic_txt" type="text" placeholder="mfano: Vita vya Maji Maji"></div>' +
'<div id="nk_photo_box" class="hidden"><div class="field"><label>Picha za kurasa (hadi ' + MAX_PHOTOS + ' kwa kila upakiaji)</label><input id="nk_files" type="file" accept="image/*" multiple></div>' +
'<button type="button" class="nk-btn sec" id="nk_read">📷 Soma picha</button><button type="button" class="nk-btn sec" id="nk_clear">🗑️ Futa maandishi</button>' +
'<div class="field"><label>Maandishi yaliyosomwa (yahakiki na urekebishe kabla ya kutengeneza)</label><textarea id="nk_src" rows="8" placeholder="Maandishi ya picha yataonekana hapa. Unaweza kuongeza kurasa zaidi hata siku nyingine; yanahifadhiwa kwenye simu hii."></textarea></div>' +
'<p class="hint" id="nk_srcinfo"></p></div>' +
'<div class="field"><label>Maelekezo ya ziada (hiari)</label><textarea id="nk_extra" placeholder="mfano: eleza kwa mifano ya Tanzania"></textarea></div>' +
'<button type="button" class="nk-btn" id="nk_go">⚡ Tengeneza Nukuu</button><button type="button" class="nk-btn sec hidden" id="nk_stop">⏹ Simamisha</button><button type="button" class="nk-btn sec hidden" id="nk_resume">▶ Endelea</button>' +
'<div class="nk-status" id="nk_status"></div>' +
'<p class="hint">Wenye leseni wanaweza kupakua Word na kunakili; wasio na leseni wanaona <b>Preview</b> tu. Ni rasimu ya AI: mwalimu ahakiki kabla ya kutumia darasani.</p></div>' +
'<div class="output-panel" style="background:transparent;box-shadow:none"><div class="nk-tools"><button type="button" class="nk-btn" id="nk_dl">⬇️ Pakua Word</button><button type="button" class="nk-btn sec" id="nk_copy">📋 Nakili</button></div><div class="nk-paper nk-locked" id="nk_paper"><div class="nk-wm" id="nk_wm"></div><div class="nk-body" id="nk_body"><p class="nk-empty">Chagua somo na mada kisha bonyeza "Tengeneza Nukuu".</p></div></div></div></div>';

function status(msg, isErr){ var s = $('nk_status'); if(!s) return; s.textContent = msg || ''; s.className = 'nk-status' + (isErr ? ' err' : ''); }
function setBusy(b){
  st.running = b;
  $('nk_go').disabled = b; $('nk_read').disabled = b || st.photoBusy;
  $('nk_stop').classList.toggle('hidden', !b);
  if(b) $('nk_resume').classList.add('hidden');
}
function paintWatermark(){
  var w = who(), t = 'PREVIEW — Msaidizi wa Mwalimu' + (w ? ' · ' + w : '');
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="230"><text x="20" y="130" transform="rotate(-24 280 115)" font-family="Arial" font-size="17" font-weight="700" fill="#000" fill-opacity="0.11">' + xml(t) + '</text></svg>';
  $('nk_wm').style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}
function lic(){ try{ var l = window.__msLic && window.__msLic(); return !!(l && l.licensed); }catch(e){ return false; } }
function applyLic(){
  var on = lic(), v = $('view-nukuu'), pp = $('nk_paper'), wm = $('nk_wm');
  if(v) v.classList.toggle('nk-lic', on);
  if(pp) pp.classList.toggle('nk-locked', !on);
  if(wm) wm.style.display = on ? 'none' : 'block';
  var dl = $('nk_dl'); if(dl) dl.textContent = on ? '⬇️ Pakua Word' : '🔒 Pakua Word (leseni)';
}
function render(){
  applyLic();
  var m = st.meta || {}, T = L[m.lang] || L.sw, h = '';
  if(!st.out.length){ $('nk_body').innerHTML = '<p class="nk-empty">Chagua somo na mada kisha bonyeza "Tengeneza Nukuu".</p>'; return; }
  h += '<h2>' + esc(T.title) + ' — ' + esc(m.subject) + '</h2><div class="nk-meta">' + esc(m.grade) + (m.topic ? ' · ' + esc(m.topic) : '') + '</div>';
  st.out.forEach(function(o){ if(o) h += nkMd(o); });
  if(st.idx >= st.plan.length) h += '<div class="nk-note">' + esc(T.draft) + '</div>';
  $('nk_body').innerHTML = h;
}
function download(){
  if(!st.out.length){ status('Tengeneza nukuu kwanza kabla ya kupakua.', true); return; }
  if(!lic()){ alert('Kupakua Nukuu kunahitaji leseni ya malipo ya Msaidizi wa Mwalimu. Preview inapatikana kwa majaribio.'); return; }
  if(typeof domToDocxParagraphs !== 'function' || typeof downloadDocxParagraphs !== 'function'){ alert('Zana ya Word haijapakia. Pakia ukurasa upya (una mtandao?) kisha jaribu tena.'); return; }
  var m = st.meta || {};
  try{ downloadDocxParagraphs(domToDocxParagraphs($('nk_body')), 'Nukuu_' + (m.subject||'') + '_' + (m.topic||m.grade||''), null); }
  catch(e){ alert('Imeshindikana kutengeneza Word: ' + ((e && e.message) || e)); }
}
function copyText(){
  if(!st.out.length){ status('Tengeneza nukuu kwanza kabla ya kunakili.', true); return; }
  if(!lic()){ alert('Kunakili Nukuu kunahitaji leseni ya malipo ya Msaidizi wa Mwalimu.'); return; }
  var t = $('nk_body').innerText;
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){ status('Nukuu imenakiliwa ✔'); }, function(){ status('Imeshindwa kunakili.', true); }); }
  else status('Kivinjari hiki hakiruhusu kunakili.', true);
}

/* ---------- Mada, maandishi ya picha, rasimu ---------- */
function curTopic(){
  var rec = nkRec($('nk_grade').value, $('nk_subject').value), sel = $('nk_topic').value, txt = $('nk_topic_txt').value.trim();
  var r = { main:'', sub:'', items:[], label:'' };
  if(txt){ r.sub = txt; r.label = txt; return r; }
  if(rec && sel){
    var p = sel.split('|'), k = rec.k[+p[0]], m = k && k.m && k.m[+p[1]];
    if(k && m){ r.main = (k.n||'') + ' ' + (k.j||''); r.sub = (m.n||'') + ' ' + (m.j||''); r.items = (m.c||[]).slice(); r.label = r.sub.trim(); }
  }
  return r;
}
function draftKey(){ return [$('nk_grade').value, $('nk_subject').value, curTopic().label].join('|'); }
function loadDraft(){ var d = lsGet(LS_DRAFT)[draftKey()]; $('nk_src').value = (d && d.text) || ''; srcInfo(); }
function saveDraft(pagesAdded){
  var all = lsGet(LS_DRAFT), k = draftKey(), d = all[k] || { pages:0 };
  d.text = $('nk_src').value; d.pages = (d.pages||0) + (pagesAdded||0); all[k] = d; lsSet(LS_DRAFT, all); srcInfo();
}
function srcInfo(){
  var d = lsGet(LS_DRAFT)[draftKey()], n = $('nk_src').value.length;
  $('nk_srcinfo').textContent = n ? ('Maandishi: herufi ' + n + (d && d.pages ? ' · kurasa zilizosomwa: ' + d.pages : '') + '. Yamehifadhiwa kwenye simu hii.') : 'Hakuna maandishi bado.';
}
function fillTopics(){
  var rec = nkRec($('nk_grade').value, $('nk_subject').value), sel = $('nk_topic');
  sel.innerHTML = '';
  var groups = nkTopicOptions(rec);
  if(!groups.length){ sel.appendChild(new Option('— Mtaala wa somo hili bado haujaingizwa; andika mada hapa chini —', '')); return; }
  sel.appendChild(new Option('— Chagua mada ndogo —', ''));
  groups.forEach(function(g){ var og = document.createElement('optgroup'); og.label = g.label; g.items.forEach(function(i){ og.appendChild(new Option(i.label, i.v)); }); sel.appendChild(og); });
}
function nkGrades(){ return st.ngazi === 'msingi' ? primaryGrades : secondaryGrades; }
function nkSubjects(grade){
  if(st.ngazi === 'msingi') return primarySubjectsByGrade[grade] || primarySubjectsByGrade['Darasa la 7'];
  var n = parseInt(String(grade||'').replace(/\D/g,''), 10) || 1;
  if(n >= 5) return secondaryALevelSubjects;
  return n <= 2 ? secondaryOLevelSubjects.concat(typeof SECONDARY_2023_EXTRA_SUBJECTS !== 'undefined' ? SECONDARY_2023_EXTRA_SUBJECTS : []) : secondaryOLevelSubjects;
}
function fillSubjects(){ var s = $('nk_subject'); s.innerHTML = ''; nkSubjects($('nk_grade').value).forEach(function(x){ s.appendChild(new Option(x, x)); }); fillTopics(); loadDraft(); }
function refresh(){
  var g = $('nk_grade'); g.innerHTML = '';
  nkGrades().forEach(function(x){ g.appendChild(new Option(x, x)); });
  fillSubjects();
}
function nkSetNgazi(n){
  st.ngazi = n;
  $('nk_ng_msingi').classList.toggle('on', n === 'msingi'); $('nk_ng_sek').classList.toggle('on', n === 'sekondari');
  refresh();
}
function setMode(m){
  st.mode = m;
  $('nk_tab_mtaala').classList.toggle('on', m === 'mtaala'); $('nk_tab_picha').classList.toggle('on', m === 'picha');
  $('nk_photo_box').classList.toggle('hidden', m !== 'picha');
}

/* ---------- Vitendo ---------- */
async function readPhotos(){
  var files = Array.prototype.slice.call($('nk_files').files || []);
  if(!files.length){ status('Chagua picha kwanza.', true); return; }
  var warn = '';
  if(files.length > MAX_PHOTOS){ files = files.slice(0, MAX_PHOTOS); warn = ' (zimechukuliwa picha ' + MAX_PHOTOS + ' za kwanza; zilizobaki pakia mara nyingine)'; }
  st.photoBusy = true; $('nk_read').disabled = true;
  var ok = 0, bad = 0, lastErr = '';
  for(var i=0; i<files.length; i++){
    status('Inasoma picha ' + (i+1) + ' kati ya ' + files.length + '…' + warn);
    try{
      var txt = await nkVision(await nkToDataUrl(files[i]));
      var cur = $('nk_src').value;
      if((cur + txt).length > MAX_SRC){ status('Maandishi yamefika kikomo (herufi ' + MAX_SRC + '). Tengeneza nukuu kwanza, kisha endelea na kurasa zingine.', true); break; }
      $('nk_src').value = (cur ? cur + '\n\n' : '') + txt; ok++; saveDraft(1);
    }catch(e){ bad++; lastErr = (e && e.message) || String(e); if(/ingia|kikomo/i.test(lastErr)) break; }
  }
  $('nk_files').value = ''; st.photoBusy = false; $('nk_read').disabled = st.running;
  if(bad) status('Picha ' + ok + ' zimesomwa, ' + bad + ' zimeshindikana: ' + lastErr + ' ' + warn, true);
  else status('Picha ' + ok + ' zimesomwa ✔ Hakiki maandishi kisha bonyeza "Tengeneza Nukuu".' + warn);
}
async function run(from){
  st.stop = false; setBusy(true);
  try{
    for(var i=from; i<st.plan.length; i++){
      if(st.stop){ status('Imesimamishwa. Bonyeza "Endelea" kuendelea.'); $('nk_resume').classList.remove('hidden'); return; }
      status('Inatengeneza sehemu ' + (i+1) + ' kati ya ' + st.plan.length + ' (' + st.plan[i].title + ')… usifunge ukurasa');
      st.out[i] = await nkAI(st.plan[i].prompt, st.plan[i].max); st.idx = i + 1; render();
    }
    status('Imekamilika ✔ Hii ni Preview ya rasimu; ihakiki.');
  }catch(e){
    status('⚠️ ' + ((e && e.message) || e) + ' — sehemu zilizokamilika zimebaki; bonyeza "Endelea" kujaribu tena.', true);
    $('nk_resume').classList.remove('hidden');
  }finally{ setBusy(false); }
}
function start(){
  if(st.running) return;
  var grade = $('nk_grade').value, subject = $('nk_subject').value, t = curTopic();
  var c = { grade:grade, subject:subject, ngazi:st.ngazi, lang:nkLang(st.ngazi, subject), main:t.main, sub:t.sub, items:t.items, extra:$('nk_extra').value.trim() };
  if(st.mode === 'mtaala'){
    if(!t.sub){ status('Chagua mada ndogo kutoka mtaala au andika mada.', true); return; }
    st.plan = planMtaala(c);
  }else{
    var text = $('nk_src').value.trim();
    if(text.length < 200){ status('Soma picha kwanza (au andika/bandika maandishi ya kutosha) kabla ya kutengeneza.', true); return; }
    var r = planPicha(c, text); st.plan = r.plan;
    if(r.cut) status('Maandishi ni marefu: sehemu ' + MAX_CHUNKS + ' za kwanza tu ndizo zitatengenezwa.');
  }
  st.out = []; st.idx = 0; st.meta = { grade:grade, subject:subject, topic:t.label, lang:c.lang };
  render(); run(0);
}

function boot(){
  if(typeof showView !== 'function' || typeof callClaude !== 'function' || typeof MTAALA_TIE === 'undefined' ||
     typeof primaryGrades === 'undefined' || typeof secondaryGrades === 'undefined' || typeof primarySubjectsByGrade === 'undefined' ||
     typeof secondaryOLevelSubjects === 'undefined' || typeof secondaryALevelSubjects === 'undefined' || typeof titles !== 'object'){
    console.warn('nukuu.js: vitu vya app havikupatikana; kipengele hakijaanzishwa.'); return;
  }
  var wrap = document.querySelector('.wrap'), grid = document.querySelector('#view-dashboard .card-grid');
  if(!wrap || !grid) return;
  var style = document.createElement('style'); style.id = 'nk-css'; style.textContent = CSS; document.head.appendChild(style);

  titles.nukuu = 'Nukuu za Somo';
  var view = document.createElement('div'); view.id = 'view-nukuu'; view.className = 'hidden'; view.innerHTML = HTML; wrap.appendChild(view);

  var card = document.createElement('div'); card.className = 'task-card';
  card.innerHTML = '<div class="icon">📖</div><h3>Nukuu za Somo</h3><p>Nukuu za mada: AI kutoka mtaala wa TIE, au piga picha kurasa za kitabu/karatasi upate nukuu safi (Preview).</p>';
  card.addEventListener('click', function(){ showView('nukuu'); st.ngazi = (typeof currentNgazi === 'string' && currentNgazi === 'sekondari') ? 'sekondari' : 'msingi'; nkSetNgazi(st.ngazi); setMode(st.mode); paintWatermark(); applyLic(); });
  var anchor = null; grid.querySelectorAll('.task-card').forEach(function(c){ if(/showView\('andalio'\)/.test(c.getAttribute('onclick')||'')) anchor = c; });
  if(anchor && anchor.nextSibling) grid.insertBefore(card, anchor.nextSibling); else grid.appendChild(card);

  $('nk_grade').addEventListener('change', fillSubjects);
  $('nk_subject').addEventListener('change', function(){ fillTopics(); loadDraft(); });
  $('nk_topic').addEventListener('change', loadDraft);
  $('nk_topic_txt').addEventListener('input', loadDraft);
  $('nk_src').addEventListener('input', function(){ saveDraft(0); });
  $('nk_tab_mtaala').addEventListener('click', function(){ setMode('mtaala'); });
  $('nk_tab_picha').addEventListener('click', function(){ setMode('picha'); });
  $('nk_read').addEventListener('click', readPhotos);
  $('nk_clear').addEventListener('click', function(){ if(!$('nk_src').value || confirm('Futa maandishi yote ya mada hii?')){ $('nk_src').value = ''; var a = lsGet(LS_DRAFT); delete a[draftKey()]; lsSet(LS_DRAFT, a); srcInfo(); } });
  $('nk_ng_msingi').addEventListener('click', function(){ nkSetNgazi('msingi'); });
  $('nk_ng_sek').addEventListener('click', function(){ nkSetNgazi('sekondari'); });
  $('nk_dl').addEventListener('click', download);
  $('nk_copy').addEventListener('click', copyText);
  $('nk_go').addEventListener('click', start);
  $('nk_stop').addEventListener('click', function(){ st.stop = true; status('Inasimamisha baada ya sehemu hii…'); });
  $('nk_resume').addEventListener('click', function(){ if(!st.running && st.idx < st.plan.length){ $('nk_resume').classList.add('hidden'); run(st.idx); } });
  var paper = $('nk_paper');
  ['copy','cut','contextmenu','dragstart','selectstart'].forEach(function(ev){ paper.addEventListener(ev, function(e){ if(!lic()) e.preventDefault(); }); });
}

if(window.__NK_TEST__){ window.__nk = { nkMd:nkMd, nkChunks:nkChunks, planMtaala:planMtaala, planPicha:planPicha, nkLang:nkLang, nkTopicOptions:nkTopicOptions }; }
function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
ready(function(){ try{ boot(); }catch(e){ console.warn('nukuu.js haikuanza:', e); } });
})();
