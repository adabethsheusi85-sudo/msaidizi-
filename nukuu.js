/* ============================================================================
   nukuu.js — NUKUU ZA SOMO (Preview tu)            Toleo 1
   Faili linalojitegemea: HALIBADILISHI msimbo wowote uliopo kwenye index.html.
   Ukiondoa mstari wa <script src="nukuu.js"></script>, app inarudi kama ilivyokuwa.
   Linatumia vitu vilivyopo tayari: showView, titles, callClaude, MTAALA_TIE,
   PH_PROXY_URL, PH_MODELS, firebase, currentNgazi, primaryGrades, secondaryGrades, __msLic, getSecLang.
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
'.nk-saved{margin-top:16px;border-top:1px solid rgba(244,239,225,.15);padding-top:12px}' +
'.nk-saved h3{margin:0 0 4px;font:700 14px "Helvetica Neue",Arial,sans-serif;color:var(--amber)}' +
'.nk-saved .nk-sub{font:12px "Helvetica Neue",Arial,sans-serif;color:var(--sage);margin:0 0 8px}' +
'.nk-saved .nk-empty{color:var(--sage)}' +
'.nk-saved-item{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid rgba(244,239,225,.1);font:13px "Helvetica Neue",Arial,sans-serif;color:var(--chalk)}' +
'.nk-saved-t span{color:var(--sage);font-size:12px}' +
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
'<div class="output-panel" style="background:transparent;box-shadow:none"><div class="nk-tools"><button type="button" class="nk-btn" id="nk_dl">⬇️ Pakua Word</button><button type="button" class="nk-btn sec" id="nk_copy">📋 Nakili</button></div><div class="nk-paper nk-locked" id="nk_paper"><div class="nk-wm" id="nk_wm"></div><div class="nk-body" id="nk_body"><p class="nk-empty">Chagua somo na mada kisha bonyeza "Tengeneza Nukuu".</p></div></div>' +
'<div class="nk-saved"><h3>Nukuu Zilizohifadhiwa</h3><p class="nk-sub">Nukuu huhifadhiwa kiotomatiki kwenye simu/kivinjari hiki tu. Ukifuta data ya kivinjari zitapotea.</p><div id="nk_saved_list"></div></div></div></div>';

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
  if(!lic()){ alert(T('Kupakua Nukuu kunahitaji leseni ya malipo ya Msaidizi wa Mwalimu. Preview inapatikana kwa majaribio.')); return; }
  if(typeof domToDocxParagraphs !== 'function' || typeof downloadDocxParagraphs !== 'function'){ alert(T('Zana ya Word haijapakia. Pakia ukurasa upya (una mtandao?) kisha jaribu tena.')); return; }
  var m = st.meta || {};
  try{ downloadDocxParagraphs(domToDocxParagraphs($('nk_body')), 'Nukuu_' + (m.subject||'') + '_' + (m.topic||m.grade||''), null); }
  catch(e){ alert(T('Imeshindikana kutengeneza Word: ' + ((e && e.message) || e))); }
}
function copyText(){
  if(!st.out.length){ status('Tengeneza nukuu kwanza kabla ya kunakili.', true); return; }
  if(!lic()){ alert(T('Kunakili Nukuu kunahitaji leseni ya malipo ya Msaidizi wa Mwalimu.')); return; }
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
  refresh(); updateTitle();
  if(window.__nkI18nRefresh) window.__nkI18nRefresh();
}
function setMode(m){
  st.mode = m;
  $('nk_tab_mtaala').classList.toggle('on', m === 'mtaala'); $('nk_tab_picha').classList.toggle('on', m === 'picha');
  $('nk_photo_box').classList.toggle('hidden', m !== 'picha');
}

/* ---------- Kuhifadhi nukuu (kiotomatiki, kwenye kivinjari hiki) ---------- */
var LS_SAVED = 'nukuu_saved_v1', SAVED_MAX = 30;
function savedGet(){ try{ var a = JSON.parse(localStorage.getItem(LS_SAVED) || '[]'); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
function savedPut(a){ try{ localStorage.setItem(LS_SAVED, JSON.stringify(a)); return true; }catch(e){ return false; } }
function autosave(){
  if(!st.meta || !st.meta.id || !st.out.length) return;
  var rec = { id:st.meta.id, grade:st.meta.grade, subject:st.meta.subject, topic:st.meta.topic, lang:st.meta.lang,
    out:st.out.slice(), done:st.idx >= st.plan.length, savedAt:new Date().toISOString() };
  var list = savedGet(), i = list.findIndex(function(x){ return x.id === rec.id; });
  if(i >= 0) list[i] = rec; else list.unshift(rec);
  if(list.length > SAVED_MAX) list.length = SAVED_MAX;
  var dropped = 0;
  while(!savedPut(list)){
    if(list.length <= 1){ status('Nafasi ya kuhifadhi imejaa; nukuu hii haikuhifadhiwa. Futa nukuu za zamani.', true); return; }
    list.pop(); dropped++;
  }
  if(dropped) status('Nafasi ya kuhifadhi imejaa — nukuu za zamani zaidi zimeondolewa.', true);
  renderSaved();
}
function renderSaved(){
  var box = $('nk_saved_list'); if(!box) return;
  var list = savedGet(), en = isEn(st.ngazi), h = '';
  if(!list.length){ box.innerHTML = '<p class="nk-empty">Hakuna nukuu zilizohifadhiwa bado.</p>'; return; }
  list.forEach(function(r){
    var d = ''; try{ d = new Date(r.savedAt).toLocaleDateString(en ? 'en-GB' : 'sw-TZ'); }catch(e){}
    h += '<div class="nk-saved-item"><div class="nk-saved-t"><b>' + esc(r.subject) + '</b> — ' + esc(r.grade) + '<br><span>' + esc(r.topic || '') + ' · ' + esc(d) + (r.done ? '' : ' · <i>Haijakamilika</i>') + '</span></div>' +
      '<div><button type="button" class="nk-btn sec" data-act="open" data-id="' + esc(r.id) + '">📂 Fungua</button><button type="button" class="nk-btn sec" data-act="del" data-id="' + esc(r.id) + '">🗑️ Futa</button></div></div>';
  });
  box.innerHTML = h;
}
function savedClick(e){
  var b = e.target && e.target.closest ? e.target.closest('button[data-act]') : null; if(!b) return;
  var id = b.getAttribute('data-id'), list = savedGet();
  if(b.getAttribute('data-act') === 'del'){
    if(!confirm(T('Futa nukuu hii iliyohifadhiwa?'))) return;
    savedPut(list.filter(function(x){ return x.id !== id; })); renderSaved(); return;
  }
  var r = list.filter(function(x){ return x.id === id; })[0]; if(!r) return;
  if(st.running){ status('Subiri nukuu inayotengenezwa imalize kwanza.', true); return; }
  st.meta = { id:r.id, grade:r.grade, subject:r.subject, topic:r.topic, lang:r.lang };
  st.out = r.out.slice(); st.plan = r.out.map(function(){ return null; }); if(!r.done) st.plan.push(null); st.idx = r.out.length;
  $('nk_resume').classList.add('hidden'); render(); status('');
  try{ $('nk_paper').scrollIntoView({ behavior:'smooth', block:'start' }); }catch(x){}
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
    }catch(e){ bad++; var raw = (e && e.message) || String(e); lastErr = T(raw); if(/ingia|kikomo/i.test(raw)) break; }
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
      st.out[i] = await nkAI(st.plan[i].prompt, st.plan[i].max); st.idx = i + 1; render(); autosave();
    }
    status('Imekamilika ✔ Hii ni Preview ya rasimu; ihakiki.');
  }catch(e){
    status('⚠️ ' + T((e && e.message) || e) + ' — sehemu zilizokamilika zimebaki; bonyeza "Endelea" kujaribu tena.', true);
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
  st.out = []; st.idx = 0; st.meta = { id:String(Date.now()), grade:grade, subject:subject, topic:t.label, lang:c.lang };
  render(); run(0);
}

/* Uchunguzi: fungua tovuti kwa anwani ikiishia ?nkdiag=1 kuona hali ya nukuu.js kwenye skrini (wateja hawaoni). */
var NKDIAG = false; try{ NKDIAG = location.search.indexOf('nkdiag') >= 0; }catch(e){}
function nkDiag(txt, ok){
  if(!NKDIAG || !document.body) return;
  var el = document.getElementById('nk-diag');
  if(!el){ el = document.createElement('div'); el.id = 'nk-diag'; el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:6px 10px;font:12px/1.4 Arial,sans-serif;color:#fff;'; document.body.appendChild(el); }
  el.style.background = ok ? '#1b7f3b' : '#b00020'; el.textContent = txt;
}
var NK = { card:null, view:null, style:null, booted:false, tries:0 };
function missingGlobals(){
  var m = [];
  function chk(n, ok){ try{ if(!ok()) m.push(n); }catch(e){ m.push(n); } }
  chk('showView', function(){ return typeof showView === 'function'; });
  chk('callClaude', function(){ return typeof callClaude === 'function'; });
  chk('MTAALA_TIE', function(){ return typeof MTAALA_TIE !== 'undefined'; });
  chk('primaryGrades', function(){ return typeof primaryGrades !== 'undefined'; });
  chk('secondaryGrades', function(){ return typeof secondaryGrades !== 'undefined'; });
  chk('primarySubjectsByGrade', function(){ return typeof primarySubjectsByGrade !== 'undefined'; });
  chk('secondaryOLevelSubjects', function(){ return typeof secondaryOLevelSubjects !== 'undefined'; });
  chk('secondaryALevelSubjects', function(){ return typeof secondaryALevelSubjects !== 'undefined'; });
  chk('titles', function(){ return typeof titles === 'object'; });
  return m;
}
function placeCard(grid){
  var anchor = null;
  grid.querySelectorAll('.task-card').forEach(function(c){ if(/showView\('andalio'\)/.test(c.getAttribute('onclick') || '')) anchor = c; });
  if(anchor && anchor.nextSibling) grid.insertBefore(NK.card, anchor.nextSibling); else grid.appendChild(NK.card);
}
/* Kinga: app ikijenga upya Dashibodi na kuondoa kadi/skrini, zinarudishwa zenyewe. */
function ensure(){
  try{
    if(!NK.booted) return;
    var wrap = document.querySelector('.wrap'), grid = document.querySelector('#view-dashboard .card-grid');
    if(!wrap || !grid) return;
    if(!document.getElementById('view-nukuu')) wrap.appendChild(NK.view);
    if(!document.getElementById('nk_card')) placeCard(grid);
    if(!document.getElementById('nk-css')) document.head.appendChild(NK.style);
  }catch(e){}
}
function boot(){
  var miss = missingGlobals();
  if(miss.length){ window.__nukuuDiag = { booted:false, missing:miss }; return false; }
  var wrap = document.querySelector('.wrap'), grid = document.querySelector('#view-dashboard .card-grid');
  if(!wrap || !grid){ window.__nukuuDiag = { booted:false, missing:['.wrap / #view-dashboard .card-grid'] }; return false; }
  var style = document.createElement('style'); style.id = 'nk-css'; style.textContent = CSS; document.head.appendChild(style); NK.style = style;

  titles.nukuu = 'Nukuu za Somo';
  var view = document.createElement('div'); view.id = 'view-nukuu'; view.className = 'hidden'; view.innerHTML = HTML; wrap.appendChild(view); NK.view = view;

  var card = document.createElement('div'); card.className = 'task-card'; card.id = 'nk_card'; NK.card = card;
  card.innerHTML = '<div class="icon">📖</div><h3>Nukuu za Somo</h3><p>Nukuu za mada: AI kutoka mtaala wa TIE, au piga picha kurasa za kitabu/karatasi upate nukuu safi (Preview).</p>';
  card.addEventListener('click', function(){ st.ngazi = (typeof currentNgazi === 'string' && currentNgazi === 'sekondari') ? 'sekondari' : 'msingi'; updateTitle(); showView('nukuu'); nkSetNgazi(st.ngazi); renderSaved(); setMode(st.mode); paintWatermark(); applyLic(); });
  placeCard(grid);

  $('nk_grade').addEventListener('change', fillSubjects);
  $('nk_subject').addEventListener('change', function(){ fillTopics(); loadDraft(); });
  $('nk_topic').addEventListener('change', loadDraft);
  $('nk_topic_txt').addEventListener('input', loadDraft);
  $('nk_src').addEventListener('input', function(){ saveDraft(0); });
  $('nk_tab_mtaala').addEventListener('click', function(){ setMode('mtaala'); });
  $('nk_tab_picha').addEventListener('click', function(){ setMode('picha'); });
  $('nk_read').addEventListener('click', readPhotos);
  $('nk_clear').addEventListener('click', function(){ if(!$('nk_src').value || confirm(T('Futa maandishi yote ya mada hii?'))){ $('nk_src').value = ''; var a = lsGet(LS_DRAFT); delete a[draftKey()]; lsSet(LS_DRAFT, a); srcInfo(); } });
  $('nk_ng_msingi').addEventListener('click', function(){ nkSetNgazi('msingi'); });
  $('nk_ng_sek').addEventListener('click', function(){ nkSetNgazi('sekondari'); });
  $('nk_dl').addEventListener('click', download);
  $('nk_copy').addEventListener('click', copyText);
  $('nk_go').addEventListener('click', start);
  $('nk_stop').addEventListener('click', function(){ st.stop = true; status('Inasimamisha baada ya sehemu hii…'); });
  $('nk_resume').addEventListener('click', function(){ if(!st.running && st.idx < st.plan.length){ $('nk_resume').classList.add('hidden'); run(st.idx); } });
  $('nk_saved_list').addEventListener('click', savedClick); renderSaved();
  var paper = $('nk_paper');
  ['copy','cut','contextmenu','dragstart','selectstart'].forEach(function(ev){ paper.addEventListener(ev, function(e){ if(!lic()) e.preventDefault(); }); });
  NK.booted = true; window.__nukuuDiag = { booted:true, missing:[] };
  return true;
}

/* ---------- Tafsiri ya Kiingereza (Sekondari + English): Nukuu na Zana za Kuchora ---------- */
var MC_DICT = {"✨ Chora Kiotomatiki": "✨ Draw Automatically", "Uwanja": "Canvas", "⤢ Panua Uwanja": "⤢ Expand Canvas", "✋ Sogeza": "✋ Pan", "☝ Chagua": "☝ Select", "Punguza mwonekano": "Zoom out", "Kuza mwonekano": "Zoom in", "Rudi kwenye mwonekano wa kawaida": "Reset to normal view", "Ongeza nafasi chini": "Add space below", "⬍ Ongeza urefu": "⬍ Increase height", "Ongeza nafasi kulia": "Add space to the right", "⬌ Ongeza upana": "⬌ Increase width", "💾 Hifadhi": "💾 Save", "▲ Ficha zana": "▲ Hide tools", "Umbo": "Shapes", "☝️ Chagua": "☝️ Select", "▭ Mstatili": "▭ Rectangle", "◻ Mraba": "◻ Square", "◯ Mduara": "◯ Circle", "⬭ Duaradufu": "⬭ Ellipse", "△ Pembetatu": "△ Triangle", "⬠ Poligoni": "⬠ Polygon", "✎ Poligoni huru": "✎ Freehand polygon", "✔ Maliza": "✔ Finish", "Mistari": "Lines", "╱ Mstari": "╱ Line", "➝ Mshale": "➝ Arrow", "∠ Pembe": "∠ Angle", "✏️ Kalamu": "✏️ Pen", "〰 Mto": "〰 River", "🛣 Barabara": "🛣 Road", "↔ Kipimo": "↔ Dimension", "Maandishi": "Text", "🔤 Maandishi": "🔤 Text", "🏷 Lebo + mstari": "🏷 Label + line", "▭ Kisanduku": "▭ Box", "◇ Uamuzi": "◇ Decision", "⬬ Mwanzo/Mwisho": "⬬ Start/End", "Alama": "Symbols", "Ramani / Jiografia": "Maps / Geography", "Dira (K, KS, M, MG)": "Compass (N, S, E, W)", "Mshale wa Kaskazini": "North arrow", "Gridi ya latitudo/longitudo": "Latitude/longitude grid", "Gridi ya koordinati (x,y)": "Coordinate grid (x,y)", "Mlima": "Mountain", "Mji": "Town", "Kijiji": "Village", "Shule": "School", "Hospitali": "Hospital", "Alama ya mahali": "Location marker", "Ziwa": "Lake", "Sayansi": "Science", "Bika (beaker)": "Beaker", "Chupa ya koniko": "Conical flask", "Mrija wa majaribio": "Test tube", "Kipimajoto": "Thermometer", "📍 Weka alama": "📍 Place symbol", "Picha": "Images", "🖼️ Ingiza Picha kutoka Gallery": "🖼️ Insert Image from Gallery", "✂ Kata": "✂ Crop", "↺ Rudisha ukataji": "↺ Undo crop", "Rangi/Unene": "Colour/Thickness", "Mstari": "Line", "Jaza": "Fill", "Unene": "Thickness", "Kitone": "Dashed", "Herufi": "Font size", "Pande": "Sides", "Hariri": "Edit", "↶ Tendua": "↶ Undo", "↷ Rudia": "↷ Redo", "＋ Kubwa": "＋ Larger", "－ Ndogo": "－ Smaller", "✎ Hariri maandishi": "✎ Edit text", "⧉ Nakili": "⧉ Duplicate", "⬆ Mbele": "⬆ Bring forward", "⬇ Nyuma": "⬇ Send backward", "🗑 Futa": "🗑 Delete", "🧹 Futa Yote": "🧹 Clear All", "Karatasi": "Paper", "Mlalo 800×600": "Landscape 800×600", "Mlalo mpana 800×400": "Wide landscape 800×400", "Mraba 600×600": "Square 600×600", "Wima 600×800": "Portrait 600×800", "Wima mrefu 800×1200": "Tall portrait 800×1200", "Mlalo mkubwa 1200×800": "Large landscape 1200×800", "Wima kubwa 1000×1400": "Large portrait 1000×1400", "Mraba mkubwa 1200×1200": "Large square 1200×1200", "Mrefu sana 800×1800": "Extra tall 800×1800", "Gridi": "Grid", "Namba": "Numbers", "Nata kwenye gridi": "Snap to grid", "Hatua": "Step", "Pikseli ngapi ni sentimita 1 kwa mistari ya kipimo": "How many pixels equal 1 centimetre for dimension lines", "px kwa cm": "px per cm", "Faili": "File", "Jina la mchoro": "Drawing name", "Aina ya mchoro": "Drawing type", "Aina: —": "Type: —", "Jiometria": "Geometry", "Hisabati": "Mathematics", "Sayansi na viumbe": "Science and living things", "Vifaa na mashine": "Equipment and machines", "Picha zangu (Gallery)": "My images (Gallery)", "Nyingine": "Other", "💾 Hifadhi kama Mpya": "💾 Save as New", "📄 Mpya": "📄 New", "🖨️ Chapisha": "🖨️ Print", "✔ Tumia kwenye mtihani": "✔ Use in exam", "Ramani za kufundishia ni michoro rahisi unayochora mwenyewe; mfumo huu hauna data ya ramani sahihi za maeneo yote.": "Teaching maps are simple drawings that you draw yourself; this system has no accurate map data for all areas.", "Maktaba ya Michoro na Picha Zangu": "My Drawings and Images Library", "🔍 Tafuta kwa jina": "🔍 Search by name", "Zote": "All", "🖼️ Zenye picha": "🖼️ With images", "✏️ Zilizochorwa tu": "✏️ Drawn only", "⬇️ Nakala rudufu (.json)": "⬇️ Backup (.json)", "⬆️ Rejesha (.json)": "⬆️ Restore (.json)", "📌 Michoro na picha huhifadhiwa": "📌 Drawings and images are saved", "ndani ya kivinjari cha kifaa hiki tu": "only inside this device's browser", "(hakuna seva). Ukifuta data ya kivinjari, ukibadili simu au kivinjari, vitapotea. Bonyeza \"Nakala rudufu\" mara kwa mara na uhifadhi faili hilo mahali salama (mf. WhatsApp, Drive au kompyuta).": "(no server). If you clear the browser data, or change phone or browser, they will be lost. Press \"Backup\" regularly and keep that file somewhere safe (e.g. WhatsApp, Drive or a computer).", "Mfumo huu hauthibitishi usahihi wa kisayansi au wa kijiografia wa ramani na michoro — mwalimu athibitishe kabla ya kuitumia kwenye mtihani.": "This system does not verify the scientific or geographic accuracy of maps and drawings — the teacher should verify before using them in an exam.", "Maelekezo ya mchoro, mf: Chora mraba wenye kila upande wa sentimita 5. / Chora duara lenye kipenyo cha sentimita 8. / Chora pembetatu yenye msingi sentimita 6 na kimo sentimita 4.": "Drawing instructions, e.g.: Draw a square with each side 5 centimetres. / Draw a circle with a diameter of 8 centimetres. / Draw a triangle with a base of 6 centimetres and a height of 4 centimetres.", "⤡ Rudi Ukubwa wa Kawaida": "⤡ Back to Normal Size", "▼ Onyesha zana": "▼ Show tools", "✔ Weka mabadiliko kwenye mtihani": "✔ Apply changes to the exam", "✔ Tumia kwenye swali/mtihani": "✔ Use in question/exam", "Zana za Kuchora (Offline)": "Drawing Tools (Offline)", "Chora maumbo, ramani rahisi, michoro ya sayansi na chati, au ingiza picha kutoka Gallery — bila intaneti. Hifadhi na utumie kwenye maswali na mitihani.": "Draw shapes, simple maps, science diagrams and charts, or insert images from the Gallery — without internet. Save and use them in questions and exams.", "Alama imewekwa. Kwa gridi ya latitudo/longitudo, bonyeza \"Hariri maandishi\" kubadilisha namba. Ni kiolezo cha kufundishia, si ramani sahihi ya eneo.": "Symbol placed. For the latitude/longitude grid, press \"Edit text\" to change the numbers. It is a teaching template, not an accurate map of the area.", "Chagua picha kwanza kwa \"☝ Chagua\", kisha bonyeza \"✂ Kata\".": "First select the image with \"☝ Select\", then press \"✂ Crop\".", "Inasoma picha…": "Reading image…", "Kisanduku kiko nje ya picha au ni kidogo mno — jaribu tena ndani ya picha.": "The box is outside the image or too small — try again inside the image.", "Pembe imewekwa. \"Hariri maandishi\" hukuwezesha kuiita (mf. x) badala ya digrii.": "Angle placed. \"Edit text\" lets you name it (e.g. x) instead of degrees.", "Picha hii haijakatwa.": "This image has not been cropped.", "Picha ni ya aina ya HEIC/HEIF. Inabadilishwa kuwa JPG… (sekunde 5–30; usifunge ukurasa)": "The image is HEIC/HEIF. Converting to JPG… (5–30 seconds; do not close the page)", "Sasa gusa mahali pa kuweka lebo.": "Now tap where to place the label.", "⏳ AI inatengeneza mchoro, subiri sekunde chache…": "⏳ AI is creating the drawing, wait a few seconds…", "⚠️ AI haikuweza kutengeneza mchoro unaotumika. Jaribu tena au tumia maelekezo mafupi zaidi.": "⚠️ AI could not create a usable drawing. Try again or use shorter instructions.", "⚠️ Andika kwanza maelekezo ya mchoro, mf. \"Chora mraba wenye kila upande wa sentimita 5.\"": "⚠️ First type the drawing instructions, e.g. \"Draw a square with each side 5 centimetres.\"", "✓ Picha imeingizwa. Iburute kuisogeza; duara jeupe kubadilisha ukubwa (uwiano unabaki); \"✂ Kata\" kukata; kisha tumia Maandishi, Mshale au Lebo juu yake. Hifadhi ukimaliza.": "✓ Image inserted. Drag it to move it; use the white circle to resize (proportions are kept); \"✂ Crop\" to crop; then use Text, Arrow or Label on top of it. Save when you finish.", "✓ Picha imekatwa. Bonyeza \"↺ Rudisha ukataji\" kurudisha sehemu zilizokatwa.": "✓ Image cropped. Press \"↺ Undo crop\" to restore the cropped parts.", "✓ Ukataji umerudishwa.": "✓ Crop restored."};
var NK_DICT = {"Nukuu za Somo": "Lesson Notes", "Nukuu za mada: AI kutoka mtaala wa TIE, au piga picha kurasa za kitabu/karatasi upate nukuu safi (Preview).": "Notes by topic: AI from the TIE curriculum, or photograph pages of a book/paper to get clean notes (Preview).", "Shule ya Msingi": "Primary School", "Sekondari": "Secondary", "📚 Kutoka mtaala": "📚 From curriculum", "📷 Kutoka picha": "📷 From photos", "Darasa/Kidato": "Class/Form", "Somo": "Subject", "Hisabati": "Mathematics", "Historia ya Tanzania na Maadili": "Tanzanian History and Ethics", "Mada ndogo (kutoka mtaala wa TIE)": "Sub-topic (from the TIE curriculum)", "…au andika mada mwenyewe (hiari)": "…or type your own topic (optional)", "mfano: Vita vya Maji Maji": "e.g. The Maji Maji War", "Picha za kurasa (hadi 15 kwa kila upakiaji)": "Page photos (up to 15 per upload)", "📷 Soma picha": "📷 Read photos", "🗑️ Futa maandishi": "🗑️ Clear text", "Maandishi yaliyosomwa (yahakiki na urekebishe kabla ya kutengeneza)": "Text read from photos (check and correct before generating)", "Maandishi ya picha yataonekana hapa. Unaweza kuongeza kurasa zaidi hata siku nyingine; yanahifadhiwa kwenye simu hii.": "Text from the photos will appear here. You can add more pages even on another day; it is saved on this phone.", "Maelekezo ya ziada (hiari)": "Extra instructions (optional)", "mfano: eleza kwa mifano ya Tanzania": "e.g. explain with examples from Tanzania", "⚡ Tengeneza Nukuu": "⚡ Generate Notes", "⏹ Simamisha": "⏹ Stop", "▶ Endelea": "▶ Continue", "Wenye leseni wanaweza kupakua Word na kunakili; wasio na leseni wanaona": "Licensed users can download Word and copy; unlicensed users see", "tu. Ni rasimu ya AI: mwalimu ahakiki kabla ya kutumia darasani.": "only. This is an AI draft: the teacher should verify it before using it in class.", "⬇️ Pakua Word": "⬇️ Download Word", "🔒 Pakua Word (leseni)": "🔒 Download Word (licence)", "📋 Nakili": "📋 Copy", "Chagua somo na mada kisha bonyeza \"Tengeneza Nukuu\".": "Choose a subject and topic, then press \"Generate Notes\".", "— Chagua mada ndogo —": "— Choose a sub-topic —", "— Mtaala wa somo hili bado haujaingizwa; andika mada hapa chini —": "— The curriculum for this subject is not added yet; type a topic below —", "Chagua picha kwanza.": "Choose photos first.", "Imesimamishwa. Bonyeza \"Endelea\" kuendelea.": "Stopped. Press \"Continue\" to carry on.", "Imekamilika ✔ Hii ni Preview ya rasimu; ihakiki.": "Completed ✔ This is a draft Preview; please verify it.", "Chagua mada ndogo kutoka mtaala au andika mada.": "Choose a sub-topic from the curriculum or type a topic.", "Soma picha kwanza (au andika/bandika maandishi ya kutosha) kabla ya kutengeneza.": "Read photos first (or type/paste enough text) before generating.", "Inasimamisha baada ya sehemu hii…": "Stopping after this section…", "Hakuna maandishi bado.": "No text yet.", "Nukuu imenakiliwa ✔": "Notes copied ✔", "Imeshindwa kunakili.": "Copy failed.", "Kivinjari hiki hakiruhusu kunakili.": "This browser does not allow copying.", "Tengeneza nukuu kwanza kabla ya kupakua.": "Generate notes first before downloading.", "Tengeneza nukuu kwanza kabla ya kunakili.": "Generate notes first before copying.", "Picha haisomeki. Tumia picha ya JPG au PNG.": "The image cannot be read. Use a JPG or PNG image.", "Kubadilisha picha ya HEIC kumeshindwa (inahitaji intaneti mara ya kwanza). Jaribu tena au tumia JPG.": "Converting the HEIC image failed (needs internet the first time). Try again or use a JPG.", "Hakuna maandishi yaliyosomwa kwenye picha hii.": "No text was read from this image.", "Kikomo cha maombi kimefikiwa. Subiri kidogo kisha jaribu tena.": "The request limit has been reached. Wait a bit and try again.", "Hujaingia au huna ruhusa. Toka (log out), ingia tena kisha jaribu.": "You are not signed in or lack permission. Log out, sign in again, then try.", "Hujaingia. Toka (log out) kisha ingia tena.": "You are not signed in. Log out, then sign in again.", "Kusoma picha kumechelewa sana. Jaribu tena.": "Reading the image took too long. Try again.", "Imeshindwa kuunganisha na seva. Angalia mtandao.": "Could not connect to the server. Check your network.", "Kupakua Nukuu kunahitaji leseni ya malipo ya Msaidizi wa Mwalimu. Preview inapatikana kwa majaribio.": "Downloading notes requires a paid licence of Msaidizi wa Mwalimu. Preview is available for trial.", "Kunakili Nukuu kunahitaji leseni ya malipo ya Msaidizi wa Mwalimu.": "Copying notes requires a paid licence of Msaidizi wa Mwalimu.", "Zana ya Word haijapakia. Pakia ukurasa upya (una mtandao?) kisha jaribu tena.": "The Word tool has not loaded. Reload the page (are you online?) and try again.", "Futa maandishi yote ya mada hii?": "Delete all the text for this topic?", "Kidato 1": "Form I", "Kidato 2": "Form II", "Kidato 3": "Form III", "Kidato 4": "Form IV", "Kidato 5": "Form V", "Kidato 6": "Form VI", "Darasa la 1": "Standard 1", "Darasa la 2": "Standard 2", "Darasa la 3": "Standard 3", "Darasa la 4": "Standard 4", "Darasa la 5": "Standard 5", "Darasa la 6": "Standard 6", "Darasa la 7": "Standard 7", "Darasa la Awali": "Pre-Primary"};

NK_DICT['Nukuu Zilizohifadhiwa'] = 'Saved Notes';
NK_DICT['Nukuu huhifadhiwa kiotomatiki kwenye simu/kivinjari hiki tu. Ukifuta data ya kivinjari zitapotea.'] = 'Notes are saved automatically on this phone/browser only. If you clear the browser data they will be lost.';
NK_DICT['Hakuna nukuu zilizohifadhiwa bado.'] = 'No saved notes yet.';
NK_DICT['📂 Fungua'] = '📂 Open'; NK_DICT['🗑️ Futa'] = '🗑️ Delete'; NK_DICT['Haijakamilika'] = 'Incomplete';
NK_DICT['Futa nukuu hii iliyohifadhiwa?'] = 'Delete this saved note?';
NK_DICT['Subiri nukuu inayotengenezwa imalize kwanza.'] = 'Wait for the notes being generated to finish first.';
NK_DICT['Nafasi ya kuhifadhi imejaa; nukuu hii haikuhifadhiwa. Futa nukuu za zamani.'] = 'Storage is full; these notes were not saved. Delete old notes.';
NK_DICT['Nafasi ya kuhifadhi imejaa — nukuu za zamani zaidi zimeondolewa.'] = 'Storage is full — the oldest saved notes were removed.';
var MC_PATS = [
  [/^Nukta (\d+) kati ya 3 imewekwa\.$/, 'Point $1 of 3 placed.'],
  [/^Uwanja sasa ni (.+)\. Mchoro wako haujaguswa\.$/, 'The canvas is now $1. Your drawing was not touched.'],
  [/^✓ Mchoro umetengenezwa kwa AI \((\d+) vipengele\)\. Angalia usahihi wa sayansi\/majina, uhariri kwa zana za mkono, kisha bonyeza "Hifadhi"\.$/, '✓ Drawing created with AI ($1 elements). Check the scientific accuracy and names, edit with the manual tools, then press "Save".'],
  [/^✓ Mchoro umetengenezwa \((\d+) (?:maumbo|umbo), (.+) px kwa cm, bila AI\)\. Unaweza kuuhariri kwa zana za mkono, kisha bonyeza "Hifadhi"\.(.*)$/, '✓ Drawing created ($1 shape(s), $2 px per cm, no AI). You can edit it with the manual tools, then press "Save".$3']
];
var NK_PATS = [
  [/^Inasoma picha (\d+) kati ya (\d+)… \(zimechukuliwa picha (\d+) za kwanza; zilizobaki pakia mara nyingine\)$/, 'Reading photo $1 of $2… (the first $3 photos were taken; upload the rest another time)'],
  [/^Inasoma picha (\d+) kati ya (\d+)…$/, 'Reading photo $1 of $2…'],
  [/^Picha (\d+) zimesomwa ✔ Hakiki maandishi kisha bonyeza "Tengeneza Nukuu"\.(.*)$/, '$1 photos read ✔ Check the text, then press "Generate Notes".$2'],
  [/^Picha (\d+) zimesomwa, (\d+) zimeshindikana: (.*)$/, '$1 photos read, $2 failed: $3'],
  [/^Maandishi yamefika kikomo \(herufi (\d+)\)\. Tengeneza nukuu kwanza, kisha endelea na kurasa zingine\.$/, 'The text has reached the limit ($1 characters). Generate the notes first, then continue with other pages.'],
  [/^Inatengeneza sehemu (\d+) kati ya (\d+) \((.*)\)… usifunge ukurasa$/, 'Generating section $1 of $2 ($3)… do not close the page'],
  [/^⚠️ (.*) — sehemu zilizokamilika zimebaki; bonyeza "Endelea" kujaribu tena\.$/, '⚠️ $1 — the completed sections are kept; press "Continue" to try again.'],
  [/^Maandishi ni marefu: sehemu (\d+) za kwanza tu ndizo zitatengenezwa\.$/, 'The text is long: only the first $1 sections will be generated.'],
  [/^Maandishi: herufi (\d+) · kurasa zilizosomwa: (\d+)\. Yamehifadhiwa kwenye simu hii\.$/, 'Text: $1 characters · pages read: $2. Saved on this phone.'],
  [/^Maandishi: herufi (\d+)\. Yamehifadhiwa kwenye simu hii\.$/, 'Text: $1 characters. Saved on this phone.'],
  [/^Imeshindikana kutengeneza Word: (.*)$/, 'Failed to create the Word file: $1']
];

/* Lugha ya sasa kama mfumo wa app: English inatumika kwa Sekondari tu. */
function curLang(){ try{ return (typeof window.getSecLang === 'function' && window.getSecLang()) || localStorage.getItem('mw_sec_lang') || 'sw'; }catch(e){ return 'sw'; } }
function isEn(ngazi){ return ngazi === 'sekondari' && curLang() === 'en'; }
function dashNgazi(){ try{ return typeof currentNgazi === 'string' ? currentNgazi : 'msingi'; }catch(e){ return 'msingi'; } }
function trLookup(raw, D, P){
  var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(String(raw)), core = m[2].replace(/\s+/g, ' ');
  if(!core) return null;
  if(Object.prototype.hasOwnProperty.call(D, core)) return m[1] + D[core] + m[3];
  for(var i = 0; i < P.length; i++){ if(P[i][0].test(core)) return m[1] + core.replace(P[i][0], P[i][1]) + m[3]; }
  return null;
}
function T(sw){ try{ if(!isEn(st.ngazi)) return sw; var r = trLookup(sw, NK_DICT, NK_PATS); return r === null ? sw : r; }catch(e){ return sw; } }
var TRN = window.WeakMap ? new WeakMap() : null, TRA = window.WeakMap ? new WeakMap() : null;
function trApply(root, D, P, on){
  if(!root || !TRN) return;
  var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, nodes = [];
  while((n = w.nextNode())) nodes.push(n);
  nodes.forEach(function(t){
    var par = t.parentNode; if(!par) return;
    var tag = par.tagName;
    if(tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
    if(tag === 'OPTION' && !par.hasAttribute('value')) return;   // thamani ya option isibadilike
    var rec = TRN.get(t);
    if(on){
      var base = (rec && t.nodeValue === rec.t) ? rec.o : t.nodeValue, tr = trLookup(base, D, P);
      if(tr !== null && tr !== t.nodeValue){ TRN.set(t, { o:base, t:tr }); t.nodeValue = tr; }
    }else if(rec){
      if(t.nodeValue === rec.t) t.nodeValue = rec.o;
      TRN.delete(t);
    }
  });
  Array.prototype.forEach.call(root.querySelectorAll('[title],[placeholder],optgroup[label]'), function(el){
    ['title', 'placeholder', 'label'].forEach(function(a){
      if(a === 'label' && el.tagName !== 'OPTGROUP') return;
      if(!el.hasAttribute(a)) return;
      var rc = TRA.get(el) || {}, r = rc[a], cur = el.getAttribute(a);
      if(on){
        var b = (r && cur === r.t) ? r.o : cur, x = trLookup(b, D, P);
        if(x !== null && x !== cur){ rc[a] = { o:b, t:x }; TRA.set(el, rc); el.setAttribute(a, x); }
      }else if(r){ if(cur === r.t) el.setAttribute(a, r.o); delete rc[a]; }
    });
  });
}
function updateTitle(){
  try{
    titles.nukuu = isEn(st.ngazi) ? 'Lesson Notes' : 'Nukuu za Somo';
    if(typeof currentView !== 'undefined' && currentView === 'nukuu'){ var pt = $('pageTitle'); if(pt) pt.textContent = titles.nukuu; }
  }catch(e){}
}
function i18nInit(){
  var roots = [
    { sel:'#view-michoro', D:MC_DICT, P:MC_PATS, on:function(){ return isEn(dashNgazi()); } },
    { sel:'#view-dashboard .task-card[onclick*="mcOpenFresh"]', D:MC_DICT, P:MC_PATS, on:function(){ return isEn(dashNgazi()); } },
    { sel:'#nk_card', D:NK_DICT, P:NK_PATS, on:function(){ return isEn(dashNgazi()); } },
    { sel:'#view-nukuu', D:NK_DICT, P:NK_PATS, on:function(){ return isEn(st.ngazi); } }
  ];
  function run(r){ var el = document.querySelector(r.sel); if(el){ try{ trApply(el, r.D, r.P, r.on()); }catch(e){} } }
  window.__nkI18nRefresh = function(){ roots.forEach(run); };
  roots.forEach(function(r){
    var el = document.querySelector(r.sel);
    if(el && window.MutationObserver){
      var tm = null;
      new MutationObserver(function(){ if(tm || !r.on()) return; tm = setTimeout(function(){ tm = null; run(r); }, 0); }).observe(el, { childList:true, subtree:true });
    }
  });
  ['ngaziMsingi', 'ngaziSekondari', 'secLangSw', 'secLangEn'].forEach(function(id){
    var b = document.getElementById(id);
    if(b) b.addEventListener('click', function(){ setTimeout(window.__nkI18nRefresh, 60); });
  });
  window.__nkI18nRefresh();
}

/* ---------- Marekebisho ya onyesho: Azimio la Sekondari — "Hisabati" -> "Mathematics" ----------
   Hubadilisha MANENO YA KUONYESHA tu kwenye jibu la Azimio (kichwa, Somo, kitabu rejea, nakala ya maandishi).
   Haigusi msimbo wa Azimio, Worker, wala data inayotumwa kwa seva. Linatumika tu: Kidato + Hisabati + maudhui ya Kiingereza. */
function azMathFix(){
  var out = document.getElementById('az_output');
  if(!out || !window.MutationObserver) return;
  var busy = false;
  function applies(){
    try{
      if(typeof azLastMeta === 'undefined' || !azLastMeta) return false;
      if(!/^\s*hisabati\s*$/i.test(azLastMeta.subject || '')) return false;
      if(!/^\s*kidato/i.test(azLastMeta.grade || '')) return false;
      return typeof azLangFor === 'function' ? azLangFor(azLastMeta.subject, azLastMeta.grade, null) === 'en' : true;
    }catch(e){ return false; }
  }
  function toEn(t){ return String(t).replace(/HISABATI/g, 'MATHEMATICS').replace(/\bHisabati\b/g, 'Mathematics'); }
  function fix(){
    if(busy || !applies()) return;
    busy = true;
    try{
      var w = document.createTreeWalker(out, NodeFilter.SHOW_TEXT, null), n, list = [];
      while((n = w.nextNode())){ if(/hisabati/i.test(n.nodeValue)) list.push(n); }
      list.forEach(function(t){ t.nodeValue = toEn(t.nodeValue); });
      var h = document.getElementById('az_headLabel'); if(h) h.textContent = toEn(h.textContent);
      if(typeof lastTextByOutput === 'object' && lastTextByOutput && lastTextByOutput['az_output']) lastTextByOutput['az_output'] = toEn(lastTextByOutput['az_output']);
      azLastMeta.subject = 'Mathematics'; azLastMeta.title = toEn(azLastMeta.title || '');
    }catch(e){}
    busy = false;
  }
  new MutationObserver(fix).observe(out, { childList:true, subtree:true });
}

if(window.__NK_TEST__){ window.__nk = { autosave:autosave, savedGet:savedGet, renderSaved:renderSaved, _st:st, trApply:trApply, trLookup:trLookup, NK_DICT:NK_DICT, NK_PATS:NK_PATS, MC_DICT:MC_DICT, MC_PATS:MC_PATS, azMathFix:azMathFix, nkMd:nkMd, nkChunks:nkChunks, planMtaala:planMtaala, planPicha:planPicha, nkLang:nkLang, nkTopicOptions:nkTopicOptions }; }
function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
function bootRetry(){
  var ok = false, err = '';
  if(NK.tries === 0) nkDiag('nukuu.js imepakia ✔ (toleo 8) — inaanzisha kadi…', true);
  try{ ok = boot() === true; }catch(e){ err = String((e && e.message) || e); console.warn('nukuu.js haikuanza:', e); }
  if(ok){ nkDiag('✔ Nukuu imeanza: kadi (nk_card) imeundwa kwenye Dashibodi.', true); }
  else{
    var ms = (window.__nukuuDiag && window.__nukuuDiag.missing) || [];
    nkDiag('✖ Nukuu bado haijaanza (jaribio ' + (NK.tries + 1) + '/15). ' + (err ? 'Kosa: ' + err + '. ' : '') + (ms.length ? 'Vinavyokosekana kwenye app: ' + ms.join(', ') : ''), false);
  }
  if(!ok && ++NK.tries < 15){ setTimeout(bootRetry, 1000); return; }   // app inaweza kuchelewa kupakia vitu vyake
  try{ i18nInit(); }catch(e){ console.warn('i18n:', e); }
  if(!ok) console.warn('nukuu.js: kipengele hakijaanzishwa. Vinavyokosekana:', (window.__nukuuDiag && window.__nukuuDiag.missing) || []);
  setInterval(ensure, 2000);
}
ready(function(){ try{ azMathFix(); }catch(e){ console.warn('azMathFix:', e); } bootRetry(); });
})();
