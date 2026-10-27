/* ============================================================
   poster.js · Poster Kiraan Loan — Fariz Proton Cacu Calculator
   ------------------------------------------------------------
   TAMBAHAN BEBAS: tidak mengubah sebarang kod kalkulator sedia ada.
   Hanya MEMBACA global sedia ada: state · calc() · getModel() ·
   MODEL_NAME_MAP · _mediaCache · _sb · _sbReady

   v3 — gaya TETAP (rujukan: poster SA Studio):
     latar cerah · tajuk besar · kad ansuran merah · jadual harga ·
     baris 9/7/5 tahun · bar WhatsApp hijau
   Semua maklumat (nama, telefon, gambar Faris) sudah TERBENAM —
   kau tak perlu isi apa-apa. Hanya kiraan berubah mengikut kalkulator.
   ============================================================ */
(function () {
  'use strict';

  var LS_PROFILE = 'pg_profile_v1';
  var LS_PHOTO   = 'pg_photo_';
  var SB_TABLE   = 'poster_profile';

  /* aset lalai dalam repo (public/images/) */
  var ASSET_AVATAR = 'images/faris-avatar.png';   // avatar bulat muka ejen
  var ASSET_BG     = 'images/poster-bg/';         // latar AI: <modelId>.jpg

  /* maklumat tetap */
  var DEFAULTS = {
    name: 'FARIS PROTON',
    phone: '013-446 6179',
    role: 'Proton Sales Advisor',
    cred: 'Harga terbaik · Servis mesra · Loan mudah lulus',
    tagline: 'Lebih mudah dimiliki daripada yang anda sangka'
  };

  /* ---------- helper ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function fmtNum(n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  function rm0(n) { return 'RM' + fmtNum(n); }
  function rm2(n) { return 'RM' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); }

  function coverDraw(ctx, img, x, y, w, h) {
    var ir = img.width / img.height, br = w / h, sx, sy, sw, sh;
    if (ir > br) { sh = img.height; sw = sh * br; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / br; sx = 0; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function loadImage(src) {
    return new Promise(function (res) {
      if (!src) return res(null);
      var img = new Image();
      if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
      img.onload = function () { res(img); };
      img.onerror = function () { res(null); };
      img.src = src;
    });
  }
  function loadImageSafe(src) {
    if (!src) return Promise.resolve(null);
    if (!/^https?:/i.test(src)) return loadImage(src);
    return fetch(src, { mode: 'cors' })
      .then(function (r) { return r.ok ? r.blob() : Promise.reject(r.status); })
      .then(function (b) { return loadImage(URL.createObjectURL(b)); })
      .catch(function () { return loadImage(src); });
  }

  function fitText(ctx, str, maxW, font, startPx) {
    var px = startPx;
    do { ctx.font = font.replace('__PX__', px); px -= 2; } while (ctx.measureText(str).width > maxW && px > 9);
    return px + 2;
  }

  function downscale(file, maxDim) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        var im = new Image();
        im.onload = function () {
          var sc = Math.min(1, maxDim / Math.max(im.width, im.height));
          var c = document.createElement('canvas');
          c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          res(c.toDataURL(/image\/png/i.test(file.type) ? 'image/png' : 'image/jpeg', 0.88));
        };
        im.onerror = rej; im.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }

  /* ---------- profil ---------- */
  var profile = {
    name: '', phone: '', role: '', cred: '', tagline: '',
    logo: '', photo: '', bg: '', size: 'feed'
  };
  var KEYS = ['name', 'phone', 'role', 'cred', 'tagline', 'logo', 'photo', 'bg', 'size'];

  function loadProfile() {
    try { var raw = localStorage.getItem(LS_PROFILE); if (raw) Object.assign(profile, JSON.parse(raw)); } catch (e) {}
  }
  function saveProfile() {
    try { localStorage.setItem(LS_PROFILE, JSON.stringify(profile)); } catch (e) {}
    var sb = window._sb;
    if (sb && window._sbReady) {
      sb.from(SB_TABLE).upsert(Object.assign({ id: 1, updated_at: new Date().toISOString() }, profile))
        .then(function (r) { if (r.error) throw r.error; setStatus('✓ Tetapan disimpan (Supabase)', 'ok'); })
        .catch(function () { setStatus('✓ Disimpan dalam browser', 'ok'); });
    } else { setStatus('✓ Disimpan dalam browser', 'ok'); }
  }
  function syncProfileFromSupabase() {
    var sb = window._sb;
    if (!sb || !window._sbReady) return;
    sb.from(SB_TABLE).select('*').eq('id', 1).maybeSingle().then(function (r) {
      if (r.error || !r.data) return;
      var row = r.data, changed = false;
      KEYS.forEach(function (k) { if (row[k] && row[k] !== profile[k]) { profile[k] = row[k]; changed = true; } });
      if (changed) { try { localStorage.setItem(LS_PROFILE, JSON.stringify(profile)); } catch (e) {} if (ui) fillForm(); }
    }).catch(function () {});
  }
  function v(k) { return profile[k] || DEFAULTS[k] || ''; }

  /* ---------- data kalkulator ---------- */
  function currentData() {
    var m = (typeof window.getModel === 'function') ? window.getModel() : null;
    var r = (typeof window.calc === 'function') ? window.calc() : null;
    if (!m || !r) return null;
    var st = window.state || {};
    var rate = Number(st.interestPct || 0);
    function monthlyAt(years) {
      if (!(years > 0) || !(r.loan > 0)) return 0;
      return (r.loan + r.loan * (rate / 100) * years) / (years * 12);
    }
    return {
      model: m.name, modelId: m.id,
      variant: (m.variants[st.variantIdx] || {}).name || '',
      months: (st.loanYears || 0) * 12, years: st.loanYears || 0,
      monthly: r.monthly, otr: r.otr, selling: r.selling, insurance: r.insurance,
      dp: r.dp, loan: r.loan, rate: rate, ncd: st.ncdPct,
      otrModeLabel: st.otrMode === 'tanpa' ? 'Tanpa Insurans' : 'Dengan Insurans',
      depositLabel: (function () {
        var el = document.getElementById('select-deposit');
        if (st.depositSel === 'custom') return 'Custom (' + rm0(st.customDeposit || 0) + ')';
        if (el && el.selectedOptions && el.selectedOptions[0]) return el.selectedOptions[0].textContent.trim();
        var n = Number(st.depositSel || 0);
        return n === 0 ? 'Full Loan' : (n < 100 ? n + '%' : rm0(n));
      })(),
      rebate: (typeof window._getRebate === 'function') ? window._getRebate() : 0,
      m5: monthlyAt(5), m7: monthlyAt(7), m9: monthlyAt(9),
      carUrl: carImageUrl(m),
      agentUrl: profile.photo || ASSET_AVATAR,
      bgUrl: profile.bg || (ASSET_BG + m.id + '.jpg')
    };
  }
  function carImageUrl(m) {
    var c = [];
    try {
      var mc = window._mediaCache || {};
      if (mc[m.id] && mc[m.id].media_url) c.push(mc[m.id].media_url);
      var k2 = m.id + '_' + (window.state || {}).variantIdx;
      if (mc[k2] && mc[k2].media_url) c.push(mc[k2].media_url);
    } catch (e) {}
    if (m.image) c.push(m.image);
    return c.filter(Boolean)[0] || null;
  }
  function photoOverride(id) { try { return localStorage.getItem(LS_PHOTO + id) || ''; } catch (e) { return ''; } }

  /* ---------- palet tetap (gaya poster cerah) ---------- */
  var C = {
    bg: '#FFFFFF', soft: '#F2F5F9', line: '#E4E8EE', alt: '#F8FAFC',
    navy: '#10243C', navy2: '#1B3A5C', grey: '#667085', grey2: '#98A2B3',
    red: '#D0212B', gold: '#F5B301', wa: '#25D366'
  };

  var SIZES = { feed: [1080, 1350], story: [1080, 1920], square: [1080, 1080] };
  var currentSize = 'feed';
  var renderToken = 0;

  /* teks berbilang baris */
  function wrapText(ctx, text, maxW, font) {
    ctx.font = font;
    var words = String(text).split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = words[i]; }
      else { cur = t; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function renderPoster(canvas,d,sizeKey){
    var wh=SIZES[sizeKey]||SIZES.feed,W=wh[0],H=wh[1];
    canvas.width=W;canvas.height=H;
    var ctx=canvas.getContext('2d'),small=H<=1100,tall=H>=1700;
    var P=52,I=W-P*2,gap=small?12:(tall?22:14);
    var top=small?32:(tall?60:44);
    var headerH=small?128:(tall?175:150),carH=small?190:(tall?525:278);
    var settingH=small?215:(tall?340:260),resultH=small?190:(tall?285:233);
    var monthlyH=small?116:(tall?210:145),agentH=small?76:(tall?118:88);
    var used=top+headerH+carH+settingH+resultH+monthlyH+agentH+24+gap*6;
    top+=Math.max(0,(H-used)*.36);
    function rect(x,y,w,h,r,color,stroke){
      ctx.fillStyle=color;roundRect(ctx,x,y,w,h,r);ctx.fill();
      if(stroke){ctx.lineWidth=2;ctx.strokeStyle=stroke;roundRect(ctx,x,y,w,h,r);ctx.stroke();}
    }
    function txt(text,x,y,px,color,align,maxW){
      var s=String(text==null?'':text);
      var f='900 __PX__px Montserrat, Arial, sans-serif';
      px=maxW?fitText(ctx,s,maxW,f,px):px;
      ctx.font='900 '+px+'px Montserrat, Arial, sans-serif';
      ctx.textBaseline='alphabetic';ctx.textAlign=align||'left';
      ctx.fillStyle=color;ctx.fillText(s,x,y);ctx.textAlign='left';
    }
    function section(title,y){
      rect(P,y,I,41,11,'#182E48');
      ctx.fillStyle='#E42337';ctx.fillRect(P,y,6,41);
      txt(title,P+19,y+28,24,'#FFF','left',I-38);
    }
    function tile(x,y,w,h,k,v,yellow){
      rect(x,y,w,h,10,yellow?'#FFE17A':'#F4F7FA','#DDE5EC');
      var fs=h<54?13:(tall?19:16), vs=h<54?21:(tall?32:26);
      txt(k,x+17,y+(h<54?14:21),fs,'#4B6076','left',w-34);
      txt(v,x+17,y+h-(h<54?7:14),vs,'#10243C','left',w-34);
    }
    ctx.fillStyle='#F0F3F8';ctx.fillRect(0,0,W,H);
    var paper=ctx.createLinearGradient(0,0,W,H);
    paper.addColorStop(0,'#FFF');paper.addColorStop(1,'#E9EEF5');
    ctx.fillStyle=paper;ctx.fillRect(0,0,W,H);
    txt('KIRAAN LOAN KENDERAAN',P,top+22,23,'#D0212B');
    rect(P,top+30,115,5,2,'#E51E34');
    txt(d.model,P,top+(small?83:92),small?58:65,'#10243C','left',I);
    txt(d.variant,P,top+(small?119:132),small?27:31,'#566B80','left',I);
    var y=top+headerH+gap;
    rect(P,y,I,carH,18,'#DFE6ED','#CFD9E5');
    ctx.save();roundRect(ctx,P,y,I,carH,18);ctx.clip();
    if(d.agentBg)coverDraw(ctx,d.agentBg,P,y,I,carH);
    if(d.photo)coverDraw(ctx,d.photo,P,y,I,carH);
    else if(!d.agentBg)txt('GAMBAR KERETA',W/2,y+carH/2,30,'#9BA8B8','center');
    var fade=ctx.createLinearGradient(0,y+carH*.68,0,y+carH);
    fade.addColorStop(0,'rgba(255,255,255,0)');fade.addColorStop(1,'rgba(255,255,255,.58)');
    ctx.fillStyle=fade;ctx.fillRect(P,y+carH*.68,I,carH*.32);ctx.restore();
    y+=carH+gap;
    /* Values come from the selected calculator variant, input state and calc(). */
    rect(P,y,I,settingH,15,'#FFF','#DAE2EA');section('TETAPAN KIRAAN',y);
    var inputs=[
      ['VARIAN',d.variant],
      ['OTR MODE',d.otrModeLabel],
      ['REBATE',rm0(d.rebate)],
      ['JENIS DEPOSIT',d.depositLabel],
      ['TAHUN LOAN',d.years+' tahun'],
      ['INTEREST %',Number(d.rate||0).toLocaleString('en-US',{maximumFractionDigits:2})+'%'],
      ['NCD %',Number(d.ncd||0).toLocaleString('en-US',{maximumFractionDigits:2})+'%']
    ];
    var pad=12,g=9,cw=(I-2*pad-g)/2;
    var th=(settingH-53-3*g)/4;
    inputs.forEach(function(v,i){
      tile(P+pad+(i%2)*(cw+g),y+47+Math.floor(i/2)*(th+g),cw,th,v[0],v[1],false);
    });
    y+=settingH+gap;
    rect(P,y,I,resultH,15,'#FFF','#DAE2EA');section('HASIL KIRAAN',y);
    var outputs=[
      ['SELLING PRICE',rm0(d.selling)],
      ['INSURANCE EST.',rm0(d.insurance)],
      ['OTR PRICE',rm0(d.otr)],
      ['DOWNPAYMENT',rm0(d.dp)],
      ['LOAN AMOUNT',rm0(d.loan)]
    ];
    var rh=(resultH-53-2*g)/3;
    outputs.forEach(function(v,i){
      tile(P+pad+(i%2)*(cw+g),y+47+Math.floor(i/2)*(rh+g),cw,rh,v[0],v[1],i===2);
    });
    y+=resultH+gap;
    var red=ctx.createLinearGradient(P,y,W-P,y+monthlyH);
    red.addColorStop(0,'#930018');red.addColorStop(.55,'#CE112C');red.addColorStop(1,'#F62E48');
    rect(P,y,I,monthlyH,18,red);
    txt('MONTHLY',P+28,y+monthlyH*.42,small?34:(tall?50:40),'#FFF');
    txt(d.months+' BULAN',P+28,y+monthlyH*.75,small?23:(tall?31:26),'#FFE0E6');
    txt(rm2(d.monthly),W-P-27,y+monthlyH*.67,small?76:(tall?105:91),'#FFF','right',I*.63);
    y+=monthlyH+gap;
    var dark=ctx.createLinearGradient(P,y,W-P,y+agentH);
    dark.addColorStop(0,'#10243C');dark.addColorStop(1,'#1C4065');
    rect(P,y,I,agentH,15,dark);
    var av=small?25:(tall?42:32),ax=P+20+av,ay=y+agentH/2;
    ctx.save();circle(ctx,ax,ay,av);ctx.clip();
    ctx.fillStyle='#EAEFF6';ctx.fillRect(ax-av,ay-av,av*2,av*2);
    if(d.agentPhoto)coverDraw(ctx,d.agentPhoto,ax-av,ay-av,av*2,av*2);
    ctx.restore();
    ctx.strokeStyle='#FFF';ctx.lineWidth=2;circle(ctx,ax,ay,av);ctx.stroke();
    var nx=ax+av+16;
    txt(v('name'),nx,y+agentH*.43,small?24:(tall?34:28),'#FFF','left',I*.46);
    txt(v('role'),nx,y+agentH*.72,small?17:(tall?24:20),'#D1DEE9','left',I*.46);
    txt(v('phone'),W-P-20,y+agentH*.56,small?29:(tall?43:36),'#FFF','right',I*.4);
    txt('WHATSAPP',W-P-20,y+agentH*.83,small?13:(tall?19:16),'#43EC83','right',I*.4);
    y+=agentH+gap;
    txt('Anggaran sahaja · Harga & kelulusan tertakluk kepada terma dan syarat.',
      P,Math.min(H-13,y+16),18,'#637387','left',I);
  }

  /* ---------- caption WhatsApp ---------- */
  function buildCaption(d){
    return [
      '🚗 '+d.model+' — '+d.variant,
      '📋 OTR Mode: '+d.otrModeLabel+' | Rebate: '+rm0(d.rebate),
      '💳 Deposit: '+d.depositLabel+' ('+rm0(d.dp)+')',
      '📅 Loan: '+d.years+' tahun ('+d.months+' bulan) | Interest: '+d.rate+'% | NCD: '+d.ncd+'%',
      '💰 Selling Price: '+rm0(d.selling)+' | Insurance: '+rm0(d.insurance),
      '🚘 OTR Price: '+rm0(d.otr)+' | Loan Amount: '+rm0(d.loan),
      '✅ MONTHLY: '+rm2(d.monthly)+'/bulan',
      '📞 '+v('name')+' · '+v('phone'),
      'Kiraan anggaran tertakluk kepada terma dan kelulusan bank.'
    ].join('\n');
  }

  /* ---------- UI ---------- */
  var ui = null, canvas = null, statusEl = null, lastBlob = null, lastData = null;

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'pg-status' + (kind ? ' pg-' + kind : '');
  }

  function injectCss() {
    if ($('#pg-style')) return;
    var s = document.createElement('style');
    s.id = 'pg-style';
    s.textContent = [
      '#pg-bar{padding:12px 12px 4px}',
      '#pg-open{width:100%;padding:16px;border:0;border-radius:14px;',
      'background:linear-gradient(135deg,#D0021B,#8A0011);color:#fff;',
      'font:800 15px Montserrat,Arial,sans-serif;letter-spacing:.06em;cursor:pointer;',
      'box-shadow:0 10px 24px -10px rgba(208,2,27,.9)}',
      '#pg-open:active{transform:scale(.99)}',
      '#pg-sheet{position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,.72);backdrop-filter:blur(4px);overflow:auto}',
      '#pg-sheet.on{display:block}',
      '.pg-box{max-width:520px;margin:0 auto;background:#0f0f11;min-height:100%;padding:16px 16px 40px;font-family:Montserrat,Arial,sans-serif;color:#fff}',
      '.pg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}',
      '.pg-head h3{margin:0;font:800 16px Montserrat,Arial,sans-serif;letter-spacing:.05em}',
      '.pg-x{background:#222;border:0;color:#fff;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer}',
      '.pg-lbl{font:700 11px Montserrat,Arial,sans-serif;letter-spacing:.08em;color:rgba(255,255,255,.55);margin:14px 0 8px}',
      '.pg-chips{display:flex;flex-wrap:wrap;gap:8px}',
      '.pg-chip{border:1px solid rgba(255,255,255,.16);background:#17171a;color:#fff;padding:9px 14px;border-radius:999px;font:600 12px Montserrat,Arial,sans-serif;cursor:pointer}',
      '.pg-chip.on{background:#D0021B;border-color:#D0021B}',
      '.pg-in{width:100%;box-sizing:border-box;background:#17171a;border:1px solid rgba(255,255,255,.14);border-radius:12px;color:#fff;padding:12px 14px;font:600 14px Montserrat,Arial,sans-serif;margin-bottom:8px}',
      '.pg-row{display:flex;gap:8px;margin-top:8px}.pg-row>*{flex:1}',
      '#pg-canvas{width:100%;height:auto;border-radius:14px;display:block;margin-top:10px;background:#fff}',
      '.pg-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}',
      '.pg-btn{border:0;border-radius:12px;padding:15px 10px;font:800 13px Montserrat,Arial,sans-serif;cursor:pointer;letter-spacing:.03em}',
      '.pg-btn.p{background:linear-gradient(135deg,#D0021B,#8A0011);color:#fff}',
      '.pg-btn.g{background:#25D366;color:#04310f}',
      '.pg-btn.s{background:#222;color:#fff;font-size:11px;padding:13px 6px}',
      '.pg-status{font:600 12px Montserrat,Arial,sans-serif;color:rgba(255,255,255,.6);margin-top:10px;min-height:16px}',
      '.pg-status.pg-ok{color:#7EE787}.pg-status.pg-err{color:#ff6b6b}',
      '.pg-hint{font:500 11px Montserrat,Arial,sans-serif;color:rgba(255,255,255,.42);margin:6px 0 0}',
      '#pg-adv{display:none;margin-top:6px}#pg-adv.on{display:block}'
    ].join('');
    document.head.appendChild(s);
  }

  function pickBtn(label, maxDim, onDone) {
    var w = mk('div');
    var b = mk('button', 'pg-btn s', label);
    var inp = mk('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    b.onclick = function () { inp.click(); };
    inp.onchange = function () {
      if (!this.files[0]) return;
      downscale(this.files[0], maxDim).then(function (durl) { onDone(durl); setStatus('✓ ' + label + ' ditetapkan', 'ok'); })
        .catch(function () { setStatus('✗ Gagal membaca gambar', 'err'); });
    };
    w.appendChild(b); w.appendChild(inp);
    return w;
  }

  function buildSheet() {
    var sheet = mk('div'); sheet.id = 'pg-sheet';
    var box = mk('div', 'pg-box'); sheet.appendChild(box);

    var head = mk('div', 'pg-head');
    head.appendChild(mk('h3', null, '📸 POSTER KIRAAN LOAN'));
    var x = mk('button', 'pg-x', '✕'); x.onclick = close; head.appendChild(x);
    box.appendChild(head);

    box.appendChild(mk('div', 'pg-lbl', 'SAIZ'));
    var sizeChips = mk('div', 'pg-chips');
    [['feed', 'FEED 1080×1350'], ['story', 'STATUS 1080×1920'], ['square', 'POST 1080×1080']].forEach(function (t) {
      var b = mk('button', 'pg-chip', t[1]);
      b.dataset.size = t[0];
      b.onclick = function () { currentSize = t[0]; profile.size = t[0]; paintChips(); renderNow(); };
      sizeChips.appendChild(b);
    });
    box.appendChild(sizeChips);

    canvas = mk('canvas'); canvas.id = 'pg-canvas';
    box.appendChild(canvas);

    var act = mk('div', 'pg-actions');
    var bDl = mk('button', 'pg-btn p', '⬇ MUAT TURUN PNG');
    var bWa = mk('button', 'pg-btn g', '📤 SHARE WHATSAPP');
    act.appendChild(bDl); act.appendChild(bWa);
    var bCap = mk('button', 'pg-btn s', '📋 COPY CAPTION');
    var bSet = mk('button', 'pg-btn s', '⚙ TETAPAN');
    act.appendChild(bCap); act.appendChild(bSet);
    box.appendChild(act);

    /* TETAPAN — tersembunyi; semua sudah terbenam */
    var adv = mk('div'); adv.id = 'pg-adv';
    bSet.onclick = function () { adv.classList.toggle('on'); };
    adv.appendChild(mk('div', 'pg-lbl', 'MAKLUMAT (sudah terbenam — ubah jika perlu)'));
    var f = {};
    [['name', 'Nama'], ['phone', 'No. WhatsApp'], ['role', 'Jawatan'], ['cred', 'Kredential']].forEach(function (p) {
      var i = mk('input', 'pg-in'); i.placeholder = DEFAULTS[p[0]] || p[1]; i.dataset.k = p[0];
      i.oninput = function () { profile[p[0]] = i.value; renderNow(); };
      f[p[0]] = i; adv.appendChild(i);
    });
    var g1 = mk('div', 'pg-row');
    g1.appendChild(pickBtn('🧑 GAMBAR ANDA', 900, function (d) { profile.photo = d; renderNow(); }));
    g1.appendChild(pickBtn('🌄 LATAR AI', 1600, function (d) { profile.bg = d; renderNow(); }));
    adv.appendChild(g1);
    var g2 = mk('div', 'pg-row');
    g2.appendChild(pickBtn('🚗 GAMBAR KERETA', 1400, function (d) {
      try { localStorage.setItem(LS_PHOTO + (window.state || {}).modelId, d); } catch (e) {}
      renderNow();
    }));
    var reset = mk('div');
    var rb = mk('button', 'pg-btn s', '↺ ASET ASAL');
    rb.onclick = function () {
      profile.photo = ''; profile.bg = '';
      try { localStorage.removeItem(LS_PHOTO + (window.state || {}).modelId); } catch (e) {}
      setStatus('✓ Kembali ke aset asal', 'ok'); renderNow();
    };
    reset.appendChild(rb); g2.appendChild(reset);
    adv.appendChild(g2);
    var sb = mk('div', 'pg-row');
    var sbb = mk('button', 'pg-btn s', '💾 SIMPAN TETAPAN');
    sbb.onclick = saveProfile;
    sb.appendChild(sbb); adv.appendChild(sb);
    box.appendChild(adv);
    box.appendChild(mk('p', 'pg-hint', 'Poster ikut semua input dan hasil kiraan semasa.'));
    statusEl = mk('div', 'pg-status'); box.appendChild(statusEl);

    bDl.onclick = download; bWa.onclick = shareWa; bCap.onclick = copyCaption;

    document.body.appendChild(sheet);
    ui = { sheet: sheet, inputs: f, sizeChips: sizeChips };
    fillForm(); paintChips();
  }

  function fillForm() {
    if (!ui) return;
    ['name', 'phone', 'role', 'cred'].forEach(function (k) { if (ui.inputs[k]) ui.inputs[k].value = profile[k] || ''; });
  }
  function paintChips() {
    if (!ui) return;
    ui.sizeChips.querySelectorAll('.pg-chip').forEach(function (b) { b.classList.toggle('on', b.dataset.size === currentSize); });
  }

  /* ---------- render + aksi ---------- */
  function renderNow() {
    if (!canvas) return;
    var d = currentData();
    if (!d) { setStatus('Kalkulator belum sedia.', 'err'); return; }
    var token = ++renderToken;
    lastBlob = null;
    var override = photoOverride(d.modelId);
    Promise.all([
      loadImageSafe(override || d.carUrl),
      loadImageSafe(d.agentUrl),
      loadImageSafe(d.bgUrl)
    ]).then(function (imgs) {
      if (token !== renderToken) return;
      d.photo = imgs[0] || null;
      d.agentPhoto = imgs[1] || null;
      d.agentBg = imgs[2] || null;
      lastData = d;
      renderPoster(canvas, d, currentSize);
      canvas.toBlob(function (b) { if (token === renderToken) lastBlob = b; }, 'image/png');
    });
  }

  function fileName(d) { return 'POSTER-' + (d.model || 'PROTON').replace(/\s+/g, '-') + '-RM' + Number(d.monthly || 0).toFixed(2) + '.png'; }

  function download() {
    if (!lastBlob || !lastData) { setStatus('Poster belum sedia.', 'err'); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(lastBlob); a.download = fileName(lastData);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    setStatus('✓ PNG dimuat turun', 'ok');
  }
  function shareWa() {
    if (!lastBlob || !lastData) { setStatus('Poster belum sedia.', 'err'); return; }
    var d = lastData, cap = buildCaption(d);
    var file = new File([lastBlob], fileName(d), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: cap }).then(function () { setStatus('✓ Dihantar ke WhatsApp', 'ok'); })
        .catch(function () { setStatus('Share dibatalkan.', ''); });
    } else {
      download();
      setStatus('PNG dimuat turun — lampirkan dalam WhatsApp.', '');
      window.open('https://wa.me/?text=' + encodeURIComponent(cap), '_blank');
    }
  }
  function copyCaption() {
    if (!lastData) { setStatus('Poster belum sedia.', 'err'); return; }
    var cap = buildCaption(lastData);
    (navigator.clipboard ? navigator.clipboard.writeText(cap) : Promise.reject())
      .then(function () { setStatus('✓ Caption disalin', 'ok'); })
      .catch(function () { setStatus('Caption: ' + cap, ''); });
  }
  function open() { if (!ui) return; ui.sheet.classList.add('on'); document.body.style.overflow = 'hidden'; renderNow(); }
  function close() { if (!ui) return; ui.sheet.classList.remove('on'); document.body.style.overflow = ''; }

  /* ---------- pasang ---------- */
  function mount() {
    var bar = $('#pg-bar');
    if (!bar) return;
    if (!window.calc || !window.getModel) return;
    injectCss(); buildSheet();
    $('#pg-open').addEventListener('click', open);
    var sp = $('#settings-panel');
    if (sp) {
      var sync = function () { bar.style.display = sp.classList.contains('active') ? 'none' : ''; };
      new MutationObserver(sync).observe(sp, { attributes: true, attributeFilter: ['class'] });
      sync();
    }
    var tries = 0;
    (function trySync() {
      if (window._sbReady) { syncProfileFromSupabase(); return; }
      if (++tries > 8) return;
      setTimeout(trySync, 800);
    })();
    window.pgPoster = { open: open, close: close, render: renderNow, profile: profile, DEFAULTS: DEFAULTS };
  }

  loadProfile();
  currentSize = profile.size || 'feed';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
