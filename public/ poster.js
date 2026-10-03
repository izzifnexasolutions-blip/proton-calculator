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

  function renderPoster(canvas, d, sizeKey) {
    var wh = SIZES[sizeKey] || SIZES.feed, W = wh[0], H = wh[1];
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var F = Math.min(W / 1080, H / 1250);
    var P = Math.round(58 * F);
    var innerW = W - P * 2;
    var r = function (n) { return Math.round(n * F); };
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    /* ---------- LAYOUT PASS ---------- */
    var y = Math.round(H * 0.038);
    var eyebrowY = y + r(23), underlineY = y + r(32);
    y += r(56);
    var titlePx = fitText(ctx, d.model, innerW, '800 __PX__px Montserrat, Arial, sans-serif', r(64));
    var titleY = y + titlePx; y += titlePx + r(12);
    var varPx = fitText(ctx, d.variant, innerW, '600 __PX__px Montserrat, Arial, sans-serif', r(29));
    var varY = y + varPx; y += varPx + r(14);

    var gap1 = Math.round(H * 0.012), gap2 = Math.round(H * 0.012);
    var gap3 = Math.round(H * 0.014), gap4 = Math.round(H * 0.008);
    var cardH = Math.round(H * 0.135);
    var tGap = Math.round(H * 0.007);
    var tenureH = Math.round(H * 0.130);
    var ctaH = Math.round(H * 0.026);
    var barH = Math.round(H * 0.075);
    var bottomPad = Math.round(H * 0.022);
    var ROWS = 5, rowMin = r(36);

    var carY = y, carH = Math.round(H * 0.300), carMin = Math.round(H * 0.150);
    var yTable, tblH;
    for (var g = 0; g < 60; g++) {
      yTable = carY + carH + gap1 + cardH + gap2;
      var tail = gap2 + tenureH + gap3 + ctaH + gap4 + barH + bottomPad;
      tblH = H - yTable - tail;
      if (tblH >= ROWS * rowMin || carH <= carMin) break;
      carH = Math.max(carMin, carH - (ROWS * rowMin - tblH));
    }
    if (tblH < ROWS * rowMin) tblH = ROWS * rowMin;
    var rowH = tblH / ROWS;
    var yCard = carY + carH + gap1;
    var yTen = yTable + tblH + gap2;
    var yCta = yTen + tenureH + gap3;
    var yBar = H - bottomPad - barH;

    /* ---------- LATAR ---------- */
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    var topG = ctx.createLinearGradient(0, 0, 0, carY + carH);
    topG.addColorStop(0, '#EEF2F7'); topG.addColorStop(1, '#FFFFFF');
    ctx.fillStyle = topG; ctx.fillRect(0, 0, W, carY + carH);

    /* ---------- TAJUK ---------- */
    ctx.fillStyle = C.red;
    ctx.font = '800 ' + r(24) + 'px Montserrat, Arial, sans-serif';
    ctx.fillText('KIRAAN LOAN KENDERAAN', P, eyebrowY);
    ctx.fillRect(P, underlineY, r(108), r(6));
    ctx.fillStyle = C.navy;
    ctx.font = '800 ' + titlePx + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(d.model, P, titleY);
    ctx.fillStyle = C.grey;
    ctx.font = '600 ' + varPx + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(d.variant, P, varY);

    /* ---------- GAMBAR KERETA (cover penuh, kereta tak terpotong) ---------- */
    ctx.save();
    ctx.beginPath(); ctx.rect(0, carY, W, carH); ctx.clip();
    if (d.agentBg) {
      coverDraw(ctx, d.agentBg, 0, carY, W, carH);
      ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(0, carY, W, carH);
    } else if (d.photo) {
      coverDraw(ctx, d.photo, 0, carY, W, carH);
    } else {
      ctx.fillStyle = C.soft; ctx.fillRect(0, carY, W, carH);
      ctx.fillStyle = C.grey2; ctx.textAlign = 'center';
      ctx.font = '800 ' + r(40) + 'px Montserrat, Arial, sans-serif';
      ctx.fillText(d.model, W / 2, carY + carH / 2 + r(12));
      ctx.textAlign = 'left';
    }
    ctx.restore();
    var fH = carH * 0.16;
    var fg = ctx.createLinearGradient(0, carY + carH - fH, 0, carY + carH);
    fg.addColorStop(0, 'rgba(255,255,255,0)'); fg.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = fg; ctx.fillRect(0, carY + carH - fH, W, fH);
    var fT = carH * 0.14;
    var ftg = ctx.createLinearGradient(0, carY, 0, carY + fT);
    ftg.addColorStop(0, 'rgba(238,242,247,1)'); ftg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = ftg; ctx.fillRect(0, carY, W, fT);

    /* ---------- KAD ANSURAN + EJEN ---------- */
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, P, yCard, innerW, cardH, r(22)); ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(2, r(2));
    roundRect(ctx, P, yCard, innerW, cardH, r(22)); ctx.stroke();

    var pad = r(24);
    var avR = r(cardH * 0.33);
    var leftX = P + pad;
    var leftW = Math.round(innerW * 0.42);

    ctx.fillStyle = C.grey;
    ctx.font = '600 ' + r(24) + 'px Montserrat, Arial, sans-serif';
    ctx.fillText('Bulanan Serendah', leftX, yCard + cardH * 0.22);

    var lowest = Math.min(d.m5 || Infinity, d.m7 || Infinity, d.m9 || Infinity);
    if (!isFinite(lowest) || lowest <= 0) lowest = d.monthly;
    var amtStr = fmtNum(Math.round(lowest));
    var amtPx = fitText(ctx, 'RM' + amtStr, leftW - r(60), '800 __PX__px Montserrat, Arial, sans-serif', r(cardH * 0.40));
    var amtBase = yCard + cardH * 0.22 + amtPx;
    ctx.fillStyle = C.red;
    ctx.font = '800 ' + r(amtPx * 0.42) + 'px Montserrat, Arial, sans-serif';
    ctx.fillText('RM', leftX, amtBase);
    var rmw = ctx.measureText('RM').width;
    ctx.font = '800 ' + amtPx + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(amtStr, leftX + rmw + r(5), amtBase);
    var amtW = rmw + ctx.measureText(amtStr).width;
    ctx.fillStyle = C.grey;
    ctx.font = '600 ' + r(22) + 'px Montserrat, Arial, sans-serif';
    ctx.fillText('sebulan', leftX + amtW + r(12), amtBase);

    var tagPx = fitText(ctx, DEFAULTS.tagline, leftW, 'italic 600 __PX__px Montserrat, Arial, sans-serif', r(20));
    ctx.fillStyle = C.grey;
    ctx.font = 'italic 600 ' + tagPx + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(DEFAULTS.tagline, leftX, yCard + cardH - r(18));

    var agentX = P + leftW + r(18);
    var avCx = agentX + avR, avCy = yCard + cardH / 2;
    ctx.save();
    circle(ctx, avCx, avCy, avR); ctx.clip();
    ctx.fillStyle = C.soft; ctx.fillRect(avCx - avR, avCy - avR, avR * 2, avR * 2);
    if (d.agentPhoto) coverDraw(ctx, d.agentPhoto, avCx - avR, avCy - avR, avR * 2, avR * 2);
    ctx.restore();
    ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(2, r(3));
    circle(ctx, avCx, avCy, avR); ctx.stroke();

    var atx = avCx + avR + r(16);
    var atw = (W - P - pad) - atx;
    var nameY = yCard + cardH * 0.40;
    var nPx = fitText(ctx, v('name'), atw, '800 __PX__px Montserrat, Arial, sans-serif', r(30));
    ctx.fillStyle = C.navy;
    ctx.font = '800 ' + nPx + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(v('name'), atx, nameY);
    ctx.fillStyle = C.red;
    var rolePx = fitText(ctx, v('role'), atw, '700 __PX__px Montserrat, Arial, sans-serif', r(21));
    ctx.font = '700 ' + rolePx + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(v('role'), atx, nameY + r(24));
    var credFont = '600 ' + r(18) + 'px Montserrat, Arial, sans-serif';
    var maxLines = Math.max(1, Math.floor((yCard + cardH - r(10) - (nameY + r(44))) / r(21)) + 1);
    var credLines = wrapText(ctx, v('cred'), atw, credFont).slice(0, maxLines);
    ctx.fillStyle = C.grey;
    ctx.font = credFont;
    credLines.forEach(function (ln, i) { ctx.fillText(ln, atx, nameY + r(44) + i * r(21)); });

    /* ---------- JADUAL HARGA ---------- */
    var rows = [
      ['Harga Kereta', rm0(d.otr)],
      ['Rebate', d.rebate ? '- ' + rm0(d.rebate) : rm0(0)],
      ['Downpayment', rm0(d.dp)],
      ['Insuran (anggaran)', rm0(d.insurance)],
      ['Jumlah Loan (anggaran)', rm0(d.loan)]
    ];
    ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, r(1.4));
    roundRect(ctx, P, yTable, innerW, tblH, r(16)); ctx.stroke();
    rows.forEach(function (row, i) {
      var ry = yTable + i * rowH;
      if (i % 2 === 1) {
        ctx.save();
        roundRect(ctx, P, yTable, innerW, tblH, r(16)); ctx.clip();
        ctx.fillStyle = C.alt; ctx.fillRect(P, ry, innerW, rowH);
        ctx.restore();
      }
      if (i > 0) {
        ctx.strokeStyle = C.line; ctx.lineWidth = Math.max(1, r(1.2));
        ctx.beginPath(); ctx.moveTo(P + r(18), ry); ctx.lineTo(P + innerW - r(18), ry); ctx.stroke();
      }
      var baseY = ry + rowH * 0.63;
      ctx.fillStyle = C.navy2;
      ctx.font = '600 ' + r(23) + 'px Montserrat, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(row[0], P + r(24), baseY);
      ctx.fillStyle = C.navy;
      ctx.font = '800 ' + r(26) + 'px Montserrat, Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(row[1], W - P - r(24), baseY);
      ctx.textAlign = 'left';
    });

    /* ---------- BARIS TEMPOH ---------- */
    var items = [{ yr: 9, m: d.m9 }, { yr: 7, m: d.m7 }, { yr: 5, m: d.m5 }]
      .filter(function (it) { return it.m > 0; });
    if (items.length) {
      var bestIdx = 0;
      items.forEach(function (it, i) { if (it.m < items[bestIdx].m) bestIdx = i; });
      var tH = (tenureH - tGap * (items.length - 1)) / items.length;
      items.forEach(function (it, i) {
        var ty = yTen + i * (tH + tGap);
        var isSel = it.yr === d.years;
        ctx.fillStyle = isSel ? '#FFFDF3' : '#FFFFFF';
        roundRect(ctx, P, ty, innerW, tH, r(13)); ctx.fill();
        ctx.strokeStyle = isSel ? C.gold : C.line;
        ctx.lineWidth = Math.max(2, r(isSel ? 3 : 2));
        roundRect(ctx, P, ty, innerW, tH, r(13)); ctx.stroke();

        var pillW = r(190), pillH = tH - r(12), pillY = ty + r(6);
        ctx.fillStyle = C.navy;
        roundRect(ctx, P + r(8), pillY, pillW, pillH, r(9)); ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '800 ' + r(25) + 'px Montserrat, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(it.yr + ' Tahun', P + r(8) + pillW / 2, pillY + pillH * 0.68);
        ctx.textAlign = 'left';

        var mx = P + r(8) + pillW + r(30);
        var mPx = fitText(ctx, rm0(it.m), innerW - (mx - P) - r(240), '800 __PX__px Montserrat, Arial, sans-serif', r(tH * 0.48));
        ctx.fillStyle = C.red;
        ctx.font = '800 ' + mPx + 'px Montserrat, Arial, sans-serif';
        ctx.fillText(rm0(it.m), mx, ty + tH * 0.66);
        var mw = ctx.measureText(rm0(it.m)).width;
        ctx.fillStyle = C.grey;
        ctx.font = '600 ' + r(22) + 'px Montserrat, Arial, sans-serif';
        ctx.fillText('/bulan', mx + mw + r(10), ty + tH * 0.66);

        if (i === bestIdx) {
          var bw = r(212), bh = Math.min(r(36), tH - r(14));
          var bx = W - P - r(16) - bw, by = ty + (tH - bh) / 2;
          ctx.fillStyle = '#FFF4D6';
          roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.fill();
          ctx.strokeStyle = C.gold; ctx.lineWidth = Math.max(1, r(1.5));
          roundRect(ctx, bx, by, bw, bh, bh / 2); ctx.stroke();
          ctx.fillStyle = '#8A6100';
          ctx.font = '800 ' + r(17) + 'px Montserrat, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Bayaran paling rendah', bx + bw / 2, by + bh * 0.68);
          ctx.textAlign = 'left';
        }
      });
    }

    /* ---------- CTA ---------- */
    ctx.fillStyle = C.grey;
    ctx.font = 'italic 600 ' + r(20) + 'px Montserrat, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Jom semak kelayakan sekarang — sebelum promosi tamat.', W / 2, yCta + ctaH * 0.55);
    ctx.textAlign = 'left';

    /* ---------- BAR WHATSAPP ---------- */
    var bg2 = ctx.createLinearGradient(P, yBar, W - P, yBar + barH);
    bg2.addColorStop(0, C.navy); bg2.addColorStop(1, C.navy2);
    ctx.fillStyle = bg2;
    roundRect(ctx, P, yBar, innerW, barH, r(16)); ctx.fill();

    var iconR = r(barH * 0.30), icx = P + r(20) + iconR;
    circle(ctx, icx, yBar + barH / 2, iconR);
    ctx.fillStyle = C.wa; ctx.fill();
    /* ikon telefon (vektor) */
    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(3, iconR * 0.30);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(icx, yBar + barH / 2 - iconR * 0.12, iconR * 0.56, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(icx - iconR * 0.52, yBar + barH / 2 + iconR * 0.30, iconR * 0.19, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(icx + iconR * 0.52, yBar + barH / 2 + iconR * 0.30, iconR * 0.19, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    var waPx = fitText(ctx, 'WhatsApp Saya Sekarang', innerW * 0.44, '800 __PX__px Montserrat, Arial, sans-serif', r(25));
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 ' + waPx + 'px Montserrat, Arial, sans-serif';
    ctx.fillText('WhatsApp Saya Sekarang', icx + iconR + r(14), yBar + barH * 0.60);

    ctx.textAlign = 'right';
    var phPx = fitText(ctx, v('phone'), innerW * 0.42, '800 __PX__px Montserrat, Arial, sans-serif', r(barH * 0.44));
    ctx.font = '800 ' + phPx + 'px Montserrat, Arial, sans-serif';
    ctx.fillText(v('phone'), W - P - r(22), yBar + barH * 0.63);
    ctx.textAlign = 'left';

    ctx.fillStyle = C.grey2;
    ctx.font = '500 ' + r(17) + 'px Montserrat, Arial, sans-serif';
    ctx.fillText('Anggaran sahaja \u00b7 Harga tertakluk kepada terma & syarat', P, H - r(6));
  }

  /* ---------- caption WhatsApp ---------- */
  function buildCaption(d) {
    var L = [];
    L.push('🚗 ' + d.model + ' — ' + d.variant);
    var lowest = Math.min(d.m5 || Infinity, d.m7 || Infinity, d.m9 || Infinity);
    if (!isFinite(lowest)) lowest = d.monthly;
    L.push('💰 Bulanan serendah ' + rm2(lowest) + ' sebulan (9 tahun)');
    L.push('📊 Harga ' + rm0(d.otr) + ' · Rebate ' + rm0(d.rebate) + ' · Deposit ' + rm0(d.dp));
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
    box.appendChild(mk('p', 'pg-hint', 'Nama, telefon & gambar sudah terbenam. Hanya kiraan berubah ikut kalkulator.'));
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
      canvas.toBlob(function (b) { lastBlob = b; }, 'image/png');
    });
  }

  function fileName(d) { return 'POSTER-' + (d.model || 'PROTON').replace(/\s+/g, '-') + '-RM' + Math.round(d.monthly) + '.png'; }

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
