/* ============================================================
   poster.js · Poster Kiraan Loan — Fariz Proton Cacu Calculator
   ------------------------------------------------------------
   TAMBAHAN BEBAS. Tidak mengubah sebarang kod kalkulator sedia ada.
   Ia hanya MEMBACA global yang sudah ada dalam calculator.html:
     state · calc() · getModel() · MODEL_NAME_MAP · _mediaCache · _sb · _sbReady
   Semua id/class di sini bermula dengan "pg-" supaya tiada konflik.

   v2: gambar ejen (Faris) + slot latar AI (Higgsfield) + default nama/telefon
   ============================================================ */
(function () {
  'use strict';

  var LS_PROFILE = 'pg_profile_v1';       // profil ejen (nama, telefon, gambar...)
  var LS_PHOTO   = 'pg_photo_';           // gambar kereta per model
  var SB_TABLE   = 'poster_profile';      // pilihan: sinkron ke Supabase

  /* aset lalai — ada dalam repo (public/images/) */
  var ASSET_AGENT = 'images/faris-bust.png';   // potongan gambar ejen
  var ASSET_BG    = 'images/poster-bg/';       // latar AI Higgsfield: <modelId>.jpg

  var DEFAULTS = { name: 'FARIS PROTON', phone: '013-446 6179', agency: '', tagline: 'Proton Sales Advisor' };

  /* ---------- helper ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

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

  /* elak canvas "tainted": imej jauh diambil sebagai blob dahulu */
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
    do { ctx.font = font.replace('__PX__', px); px -= 2; } while (ctx.measureText(str).width > maxW && px > 10);
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

  /* ---------- profil ejen ---------- */
  var profile = {
    name: '', phone: '', agency: '', tagline: '',
    logo: '', photo: '', bg: '',
    template: 'classic', theme: 'red', size: 'feed'
  };
  var KEYS = ['name', 'phone', 'agency', 'tagline', 'logo', 'photo', 'bg', 'template', 'theme', 'size'];

  function loadProfile() {
    try { var raw = localStorage.getItem(LS_PROFILE); if (raw) Object.assign(profile, JSON.parse(raw)); } catch (e) {}
  }
  function saveProfile() {
    try { localStorage.setItem(LS_PROFILE, JSON.stringify(profile)); } catch (e) {}
    var sb = window._sb;
    if (sb && window._sbReady) {
      sb.from(SB_TABLE).upsert(Object.assign({ id: 1, updated_at: new Date().toISOString() }, profile))
        .then(function (r) { if (r.error) throw r.error; setStatus('✓ Profil disimpan (Supabase)', 'ok'); })
        .catch(function () { setStatus('✓ Disimpan dalam browser (Supabase tak tersedia)', 'ok'); });
    } else {
      setStatus('✓ Profil disimpan dalam browser', 'ok');
    }
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

  function v(field) { return profile[field] || DEFAULTS[field] || ''; }

  /* ---------- data semasa kalkulator ---------- */
  function currentData() {
    var m = (typeof window.getModel === 'function') ? window.getModel() : null;
    var r = (typeof window.calc === 'function') ? window.calc() : null;
    if (!m || !r) return null;
    var st = window.state || {};
    return {
      model: m.name,
      modelId: m.id,
      variant: (m.variants[st.variantIdx] || {}).name || '',
      months: (st.loanYears || 0) * 12,
      years: st.loanYears || 0,
      monthly: r.monthly, otr: r.otr, selling: r.selling, insurance: r.insurance,
      dp: r.dp, loan: r.loan, rate: st.interestPct, ncd: st.ncdPct,
      rebate: (typeof window._getRebate === 'function') ? window._getRebate() : 0,
      carUrl: carImageUrl(m),
      agentUrl: profile.photo || ASSET_AGENT,
      bgUrl: profile.bg || (ASSET_BG + m.id + '.jpg')
    };
  }

  function carImageUrl(m) {
    var cands = [];
    try {
      var mc = window._mediaCache || {};
      if (mc[m.id] && mc[m.id].media_url) cands.push(mc[m.id].media_url);
      var k2 = m.id + '_' + (window.state || {}).variantIdx;
      if (mc[k2] && mc[k2].media_url) cands.push(mc[k2].media_url);
    } catch (e) {}
    if (m.image) cands.push(m.image);
    return cands.filter(Boolean)[0] || null;
  }

  function photoOverride(modelId) {
    try { return localStorage.getItem(LS_PHOTO + modelId) || ''; } catch (e) { return ''; }
  }

  function rm(n) { return 'RM' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function rmi(n) { return 'RM' + Math.round(Number(n || 0)).toLocaleString('en-US'); }

  /* ---------- tema ---------- */
  var THEMES = {
    red:  { accent: '#D0021B', accent2: '#8A0011', bg: '#0B0B0C', card: '#161618', gold: '#FFD200' },
    dark: { accent: '#1F6FEB', accent2: '#0B3D91', bg: '#0B0B0C', card: '#161618', gold: '#7EE787' },
    gold: { accent: '#C8A200', accent2: '#7A6200', bg: '#101010', card: '#1A1A16', gold: '#FFF3B0' }
  };
  function theme() { return THEMES[profile.theme] || THEMES.red; }

  /* ---------- render ---------- */
  var SIZES = { feed: [1080, 1350], story: [1080, 1920], square: [1080, 1080] };
  var currentSize = 'feed';
  var currentTpl = 'classic';
  var renderToken = 0;

  function renderPoster(canvas, d, tpl, sizeKey) {
    var wh = SIZES[sizeKey] || SIZES.feed, W = wh[0], H = wh[1];
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var t = theme();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H);

    /* latar AI (Higgsfield) — jika ada dalam data */
    if (d.agentBg) {
      coverDraw(ctx, d.agentBg, 0, 0, W, H);
      ctx.fillStyle = 'rgba(6,6,8,.64)'; ctx.fillRect(0, 0, W, H);
    }
    var g = ctx.createRadialGradient(W * 0.5, H * 0.18, 40, W * 0.5, H * 0.18, W * 1.1);
    g.addColorStop(0, 'rgba(208,2,27,.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = t.accent; ctx.fillRect(0, 0, W, 10);

    var P = 64;
    var y = 96;

    /* tajuk model */
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFFFF';
    var s1 = fitText(ctx, d.model, W - P * 2 - (d.logo ? 150 : 0), '800 __PX__px Montserrat, Arial, sans-serif', 66);
    ctx.font = '800 ' + s1 + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(d.model, P, y);
    y += 46;
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = '500 30px Montserrat, Arial, sans-serif';
    ctx.fillText(d.variant + '  ·  ' + d.years + ' TAHUN  ·  ' + Number(d.rate || 0).toFixed(2) + '%', P, y);
    y += 40;

    /* logo kecil di penjuru kanan atas (jika ada) */
    if (d.logo) {
      var ls = 118, lx = W - P - ls, ly = 44;
      ctx.save();
      roundRect(ctx, lx, ly, ls, ls, 18); ctx.clip();
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(lx, ly, ls, ls);
      coverDraw(ctx, d.logo, lx, ly, ls, ls);
      ctx.restore();
    }

    /* gambar kereta */
    var photoH = tpl === 'ringkas' ? 0 : Math.round(H * (sizeKey === 'story' ? 0.30 : 0.34));
    if (photoH) {
      var pw = W - P * 2;
      ctx.save();
      roundRect(ctx, P, y, pw, photoH, 28); ctx.clip();
      if (d.photo) coverDraw(ctx, d.photo, P, y, pw, photoH);
      else {
        ctx.fillStyle = t.card; ctx.fillRect(P, y, pw, photoH);
        ctx.fillStyle = 'rgba(255,255,255,.30)';
        ctx.font = '600 34px Montserrat, Arial, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('GAMBAR KERETA', W / 2, y + photoH / 2 + 12);
        ctx.textAlign = 'left';
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 2;
      roundRect(ctx, P, y, pw, photoH, 28); ctx.stroke();
      y += photoH + 44;
    }

    /* blok MONTHLY */
    var mh = Math.round(H * (sizeKey === 'story' ? 0.15 : 0.17));
    var mg = ctx.createLinearGradient(P, y, W - P, y + mh);
    mg.addColorStop(0, t.accent); mg.addColorStop(1, t.accent2);
    ctx.fillStyle = mg;
    roundRect(ctx, P, y, W - P * 2, mh, 26); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = '700 28px Montserrat, Arial, sans-serif';
    ctx.fillText('MONTHLY', P + 36, y + 52);
    ctx.font = '600 26px Montserrat, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.80)';
    ctx.fillText(d.months + ' BULAN', P + 36, y + mh - 40);

    ctx.textAlign = 'right';
    var numW = W - P * 2 - 72;
    var px2 = fitText(ctx, rm(d.monthly), numW, '800 __PX__px Montserrat, Arial, sans-serif', Math.round(mh * 0.52));
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 ' + px2 + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(rm(d.monthly), W - P - 36, y + mh / 2 + px2 * 0.34);
    ctx.textAlign = 'left';
    y += mh + 40;

    /* baris butiran */
    var rows = [
      ['OTR PRICE', rmi(d.otr)],
      ['DEPOSIT', rmi(d.dp)],
      ['LOAN', rmi(d.loan)],
      ['INSURAN', rmi(d.insurance)],
      ['REBAT', d.rebate ? rmi(d.rebate) : '—'],
      ['HARGA (SELLING)', rmi(d.selling)]
    ];
    if (tpl === 'bold') rows = rows.slice(0, 4);
    var colW = (W - P * 2 - 24) / 2, rowH = Math.round(H * 0.072);
    rows.forEach(function (r, i) {
      var cx = P + (i % 2) * (colW + 24);
      var cy = y + Math.floor(i / 2) * (rowH + 18);
      ctx.fillStyle = t.card;
      roundRect(ctx, cx, cy, colW, rowH, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 2;
      roundRect(ctx, cx, cy, colW, rowH, 18); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '600 22px Montserrat, Arial, sans-serif';
      ctx.fillText(r[0], cx + 26, cy + 38);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 40px Montserrat, Arial, sans-serif';
      ctx.fillText(r[1], cx + 26, cy + rowH - 26);
    });
    y += Math.ceil(rows.length / 2) * (rowH + 18) + 30;

    /* blok ejen */
    var bh = Math.max(H - y - 96, 210);
    ctx.fillStyle = t.card;
    roundRect(ctx, P, y, W - P * 2, bh, 26); ctx.fill();
    ctx.fillStyle = t.accent;
    roundRect(ctx, P, y, 12, bh, 6); ctx.fill();

    var pad = 30, resW = 0, resH = 0, resX = 0, resY = 0;
    if (d.agentPhoto) { resH = bh - pad * 2; resW = Math.round(resH * 0.8); }
    else if (d.logo) { resH = Math.min(bh - pad * 2, Math.round(bh * 0.48)); resW = resH; }
    if (resW) {
      resX = W - P - 34 - resW;
      resY = y + (bh - resH) / 2;
      ctx.save();
      roundRect(ctx, resX, resY, resW, resH, 22); ctx.clip();
      ctx.fillStyle = d.agentPhoto ? '#141416' : '#FFFFFF';
      ctx.fillRect(resX, resY, resW, resH);
      coverDraw(ctx, d.agentPhoto || d.logo, resX, resY, resW, resH);
      ctx.restore();
      ctx.strokeStyle = d.agentPhoto ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.22)';
      ctx.lineWidth = 2;
      roundRect(ctx, resX, resY, resW, resH, 22); ctx.stroke();
    }

    var tx = P + 36, txMax = resW ? resX - 30 : W - P - 40;
    var tw = Math.max(txMax - tx, 120);

    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '700 22px Montserrat, Arial, sans-serif';
    ctx.fillText('UNTUK PERTANYAAN', tx, y + 46);

    ctx.fillStyle = '#FFFFFF';
    var name = v('name');
    var ns = fitText(ctx, name, tw, '800 __PX__px Montserrat, Arial, sans-serif', Math.round(bh * 0.19));
    ctx.font = '800 ' + ns + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(name, tx, y + 46 + ns + 14);

    ctx.fillStyle = t.gold;
    var phone = v('phone');
    var ps = fitText(ctx, phone, tw, '800 __PX__px Montserrat, Arial, sans-serif', Math.round(bh * 0.22));
    ctx.font = '800 ' + ps + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(phone, tx, y + 46 + ns + 14 + ps + 18);

    var sub = [v('agency'), v('tagline')].filter(Boolean).join(' · ');
    if (sub) {
      ctx.fillStyle = 'rgba(255,255,255,.62)';
      var ssz = fitText(ctx, sub, tw, '600 __PX__px Montserrat, Arial, sans-serif', 24);
      ctx.font = '600 ' + ssz + 'px Montserrat, Arial, sans-serif';
      ctx.fillText(sub, tx, y + bh - 30);
    }
    y += bh + 34;

    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.font = '500 20px Montserrat, Arial, sans-serif';
    ctx.fillText('Anggaran sahaja · Harga tertakluk kepada terma & syarat', P, Math.min(y, H - 34));
  }

  /* ---------- caption WhatsApp ---------- */
  function buildCaption(d) {
    var L = [];
    L.push('🚗 ' + d.model + ' — ' + d.variant);
    L.push('💰 Ansuran ' + rm(d.monthly) + ' / bulan (' + d.months + ' bulan)');
    L.push('📊 OTR ' + rmi(d.otr) + ' · Deposit ' + rmi(d.dp) + ' · Loan ' + rmi(d.loan));
    if (v('tagline')) L.push('✅ ' + v('tagline'));
    L.push('📞 ' + v('name') + ' ' + v('phone'));
    L.push('Nak kiraan penuh untuk model lain? WhatsApp saya 👇');
    return L.join('\n');
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
      '#pg-sheet{position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,.72);',
      'backdrop-filter:blur(4px);overflow:auto}',
      '#pg-sheet.on{display:block}',
      '.pg-box{max-width:520px;margin:0 auto;background:#0f0f11;min-height:100%;padding:16px 16px 40px;',
      'font-family:Montserrat,Arial,sans-serif;color:#fff}',
      '.pg-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}',
      '.pg-head h3{margin:0;font:800 16px Montserrat,Arial,sans-serif;letter-spacing:.05em}',
      '.pg-x{background:#222;border:0;color:#fff;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer}',
      '.pg-lbl{font:700 11px Montserrat,Arial,sans-serif;letter-spacing:.08em;color:rgba(255,255,255,.55);margin:16px 0 8px}',
      '.pg-chips{display:flex;flex-wrap:wrap;gap:8px}',
      '.pg-chip{border:1px solid rgba(255,255,255,.16);background:#17171a;color:#fff;padding:9px 14px;',
      'border-radius:999px;font:600 12px Montserrat,Arial,sans-serif;cursor:pointer}',
      '.pg-chip.on{background:#D0021B;border-color:#D0021B}',
      '.pg-in{width:100%;box-sizing:border-box;background:#17171a;border:1px solid rgba(255,255,255,.14);',
      'border-radius:12px;color:#fff;padding:13px 14px;font:600 14px Montserrat,Arial,sans-serif;margin-bottom:8px}',
      '.pg-row{display:flex;gap:8px;margin-top:8px}',
      '.pg-row>*{flex:1}',
      '#pg-canvas{width:100%;height:auto;border-radius:14px;display:block;margin-top:10px;background:#000}',
      '.pg-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}',
      '.pg-btn{border:0;border-radius:12px;padding:15px 10px;font:800 13px Montserrat,Arial,sans-serif;',
      'cursor:pointer;letter-spacing:.03em}',
      '.pg-btn.p{background:linear-gradient(135deg,#D0021B,#8A0011);color:#fff}',
      '.pg-btn.g{background:#25D366;color:#04310f}',
      '.pg-btn.s{background:#222;color:#fff;font-size:11px;padding:13px 6px}',
      '.pg-status{font:600 12px Montserrat,Arial,sans-serif;color:rgba(255,255,255,.6);margin-top:10px;min-height:16px}',
      '.pg-status.pg-ok{color:#7EE787}.pg-status.pg-err{color:#ff6b6b}',
      '.pg-hint{font:500 11px Montserrat,Arial,sans-serif;color:rgba(255,255,255,.42);margin:6px 0 0}'
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
      downscale(this.files[0], maxDim).then(function (durl) {
        onDone(durl); setStatus('✓ ' + label + ' ditetapkan', 'ok');
      }).catch(function () { setStatus('✗ Gagal membaca gambar', 'err'); });
    };
    w.appendChild(b); w.appendChild(inp);
    return w;
  }

  function buildSheet() {
    var sheet = mk('div'); sheet.id = 'pg-sheet';
    var box = mk('div', 'pg-box');
    sheet.appendChild(box);

    var head = mk('div', 'pg-head');
    head.appendChild(mk('h3', null, '📸 JANA POSTER KIRAAN'));
    var x = mk('button', 'pg-x', '✕'); x.onclick = close; head.appendChild(x);
    box.appendChild(head);

    box.appendChild(mk('div', 'pg-lbl', 'TEMPLATE'));
    var tplChips = mk('div', 'pg-chips');
    [['classic', 'CLASSIC'], ['bold', 'BOLD'], ['ringkas', 'RINGKAS']].forEach(function (t) {
      var b = mk('button', 'pg-chip', t[1]);
      b.dataset.tpl = t[0];
      b.onclick = function () { currentTpl = t[0]; profile.template = t[0]; paintChips(); renderNow(); };
      tplChips.appendChild(b);
    });
    box.appendChild(tplChips);

    box.appendChild(mk('div', 'pg-lbl', 'SAIZ'));
    var sizeChips = mk('div', 'pg-chips');
    [['feed', 'FEED 1080×1350'], ['story', 'STATUS 1080×1920'], ['square', 'POST 1080×1080']].forEach(function (t) {
      var b = mk('button', 'pg-chip', t[1]);
      b.dataset.size = t[0];
      b.onclick = function () { currentSize = t[0]; profile.size = t[0]; paintChips(); renderNow(); };
      sizeChips.appendChild(b);
    });
    box.appendChild(sizeChips);

    box.appendChild(mk('div', 'pg-lbl', 'TEMA'));
    var thChips = mk('div', 'pg-chips');
    [['red', 'MERAH'], ['dark', 'BIRU'], ['gold', 'EMAS']].forEach(function (t) {
      var b = mk('button', 'pg-chip', t[1]);
      b.dataset.theme = t[0];
      b.onclick = function () { profile.theme = t[0]; paintChips(); renderNow(); };
      thChips.appendChild(b);
    });
    box.appendChild(thChips);

    box.appendChild(mk('div', 'pg-lbl', 'MAKLUMAT ANDA'));
    var f = {};
    [['name', 'Nama (cth: FARIS PROTON)'], ['phone', 'No. WhatsApp (cth: 013-446 6179)'], ['agency', 'Agency / cawangan'], ['tagline', 'Tagline']].forEach(function (p) {
      var i = mk('input', 'pg-in'); i.placeholder = p[1]; i.dataset.k = p[0];
      i.oninput = function () { profile[p[0]] = i.value; renderNow(); };
      f[p[0]] = i; box.appendChild(i);
    });

    var g1 = mk('div', 'pg-row');
    g1.appendChild(pickBtn('🧑 GAMBAR ANDA', 900, function (d) { profile.photo = d; renderNow(); }));
    g1.appendChild(pickBtn('🖼 LOGO', 600, function (d) { profile.logo = d; renderNow(); }));
    box.appendChild(g1);

    var g2 = mk('div', 'pg-row');
    g2.appendChild(pickBtn('🚗 GAMBAR KERETA', 1400, function (d) {
      try { localStorage.setItem(LS_PHOTO + (window.state || {}).modelId, d); } catch (e) {}
      renderNow();
    }));
    g2.appendChild(pickBtn('🌄 LATAR AI', 1600, function (d) { profile.bg = d; renderNow(); }));
    box.appendChild(g2);

    var g3 = mk('div', 'pg-row');
    var reset = mk('button', 'pg-btn s', '↺ GUNA ASET ASAL');
    reset.onclick = function () {
      profile.photo = ''; profile.bg = ''; profile.logo = '';
      try { localStorage.removeItem(LS_PHOTO + (window.state || {}).modelId); } catch (e) {}
      setStatus('✓ Kembali ke aset asal', 'ok'); renderNow();
    };
    g3.appendChild(reset);
    box.appendChild(g3);
    box.appendChild(mk('p', 'pg-hint', 'Gambar disimpan dalam browser peranti ini. Gambar kereta diambil terus dari data kalkulator.'));

    canvas = mk('canvas'); canvas.id = 'pg-canvas';
    box.appendChild(canvas);

    var act = mk('div', 'pg-actions');
    var bDl = mk('button', 'pg-btn p', '⬇ MUAT TURUN PNG');
    var bWa = mk('button', 'pg-btn g', '📤 SHARE WHATSAPP');
    var bCap = mk('button', 'pg-btn s', '📋 COPY CAPTION');
    var bSave = mk('button', 'pg-btn s', '💾 SIMPAN PROFIL');
    bDl.onclick = download; bWa.onclick = shareWa; bCap.onclick = copyCaption; bSave.onclick = saveProfile;
    act.appendChild(bDl); act.appendChild(bWa); act.appendChild(bCap); act.appendChild(bSave);
    box.appendChild(act);

    statusEl = mk('div', 'pg-status');
    box.appendChild(statusEl);

    document.body.appendChild(sheet);
    ui = { sheet: sheet, inputs: f, chips: { tpl: tplChips, size: sizeChips, theme: thChips } };
    fillForm();
    paintChips();
  }

  function fillForm() {
    if (!ui) return;
    ['name', 'phone', 'agency', 'tagline'].forEach(function (k) { ui.inputs[k].value = profile[k] || ''; });
  }

  function paintChips() {
    if (!ui) return;
    ui.chips.tpl.querySelectorAll('.pg-chip').forEach(function (b) { b.classList.toggle('on', b.dataset.tpl === currentTpl); });
    ui.chips.size.querySelectorAll('.pg-chip').forEach(function (b) { b.classList.toggle('on', b.dataset.size === currentSize); });
    ui.chips.theme.querySelectorAll('.pg-chip').forEach(function (b) { b.classList.toggle('on', b.dataset.theme === profile.theme); });
  }

  /* ---------- render + aksi ---------- */
  function renderNow() {
    if (!canvas) return;
    var d = currentData();
    if (!d) { setStatus('Kalkulator belum sedia.', 'err'); return; }
    var token = ++renderToken;
    var override = photoOverride(d.modelId);
    Promise.all([
      loadImageSafe(override || d.carUrl),
      loadImageSafe(profile.logo || ''),
      loadImageSafe(d.agentUrl),
      loadImageSafe(d.bgUrl)
    ]).then(function (imgs) {
      if (token !== renderToken) return;
      d.photo = imgs[0] || null;
      d.logo = imgs[1] || null;
      d.agentPhoto = imgs[2] || null;
      d.agentBg = imgs[3] || null;
      d.agent = { name: v('name'), phone: v('phone'), agency: v('agency'), tagline: v('tagline') };
      lastData = d;
      renderPoster(canvas, d, currentTpl, currentSize);
      canvas.toBlob(function (b) { lastBlob = b; }, 'image/png');
    });
  }

  function fileName(d) {
    return 'POSTER-' + (d.model || 'PROTON').replace(/\s+/g, '-') + '-RM' + Math.round(d.monthly) + '.png';
  }

  function download() {
    if (!lastBlob || !lastData) { setStatus('Poster belum sedia.', 'err'); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(lastBlob);
    a.download = fileName(lastData);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    setStatus('✓ PNG dimuat turun: ' + fileName(lastData), 'ok');
  }

  function shareWa() {
    if (!lastBlob || !lastData) { setStatus('Poster belum sedia.', 'err'); return; }
    var d = lastData, cap = buildCaption(d);
    var file = new File([lastBlob], fileName(d), { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: cap })
        .then(function () { setStatus('✓ Dihantar ke WhatsApp', 'ok'); })
        .catch(function () { setStatus('Share dibatalkan.', ''); });
    } else {
      download();
      setStatus('PNG dimuat turun — lampirkan dalam WhatsApp (share gambar tidak disokong pelayar ini).', '');
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

  function open() {
    if (!ui) return;
    ui.sheet.classList.add('on');
    document.body.style.overflow = 'hidden';
    renderNow();
  }
  function close() {
    if (!ui) return;
    ui.sheet.classList.remove('on');
    document.body.style.overflow = '';
  }

  /* ---------- pasang ke halaman ---------- */
  function mount() {
    var bar = $('#pg-bar');
    if (!bar) return;                       // butang tiada -> keluar senyap
    if (!window.calc || !window.getModel) return;
    injectCss(); buildSheet();
    $('#pg-open').addEventListener('click', open);

    /* sembunyikan bar semasa panel tetapan dibuka (tidak sentuh logik sedia ada) */
    var sp = $('#settings-panel');
    if (sp) {
      var sync = function () { bar.style.display = sp.classList.contains('active') ? 'none' : ''; };
      new MutationObserver(sync).observe(sp, { attributes: true, attributeFilter: ['class'] });
      sync();
    }
    /* profil Supabase mungkin belum sedia (klien Supabase dimuatkan kemudian) */
    var tries = 0;
    (function trySync() {
      if (window._sbReady) { syncProfileFromSupabase(); return; }
      if (++tries > 8) return;
      setTimeout(trySync, 800);
    })();
    window.pgPoster = { open: open, close: close, render: renderNow, profile: profile, DEFAULTS: DEFAULTS };
  }

  loadProfile();
  currentTpl = profile.template || 'classic';
  currentSize = profile.size || 'feed';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
