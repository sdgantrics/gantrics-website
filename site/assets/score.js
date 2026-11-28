'use strict';

const API_BASE = 'https://votf.constructionconversations.com';
// Temporary fallback until that domain's certificate is issued: https://voice-of-the-field-production.up.railway.app

var PASTE_HINT = 'A headline or short paragraph is plenty.';
var MIN_COPY = 40;
var MAX_COPY = 1500;
var LINKEDIN_URL = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent('https://gantrics.com/score');

var HAT_SVG = '<svg class="hat-icon" viewBox="0 0 40 36" aria-hidden="true" focusable="false"><path class="shell" d="M8.5 19.5c0-8 5.2-14 11.5-14s11.5 6 11.5 14H8.5z"/><path class="ridge" d="M17.2 3.2h5.6c.6 0 1 .4 1 1v3.8h-7.6V4.2c0-.6.4-1 1-1z"/><path class="brim" d="M2.2 19.2h35.6c1 0 1.8.8 1.8 1.8v3.2c0 1.3-1 2.3-2.3 2.3H2.7C1.4 26.5.4 25.5.4 24.2v-3.2c0-1 .8-1.8 1.8-1.8z"/></svg>';

var SHELL = 'M8.5 19.5c0-8 5.2-14 11.5-14s11.5 6 11.5 14H8.5z';
var RIDGE = 'M17.2 3.2h5.6c.6 0 1 .4 1 1v3.8h-7.6V4.2c0-.6.4-1 1-1z';
var BRIM = 'M2.2 19.2h35.6c1 0 1.8.8 1.8 1.8v3.2c0 1.3-1 2.3-2.3 2.3H2.7C1.4 26.5.4 25.5.4 24.2v-3.2c0-1 .8-1.8 1.8-1.8z';

var STORE_KEY = 'gantrics.fieldRead';
var readId = null;
var teaser = null;
var full = null;
var sharePayload = null;
var busy = false;
var lastCopy = '';
var lastFields = null;
var lastAction = 'teaser';

function postJson(path, body, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  return fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(body),
    signal: controller.signal
  }).then(function (res) {
    return res.text().then(function (text) {
      var data = {};
      if (text) {
        try { data = JSON.parse(text); } catch (e) { data = {}; }
      }
      if (!res.ok) {
        var err = new Error(data.error || 'request_failed');
        err.error = data.error || 'request_failed';
        err.status = res.status;
        throw err;
      }
      return data;
    });
  }).then(function (data) {
    clearTimeout(timer);
    return data;
  }, function (err) {
    clearTimeout(timer);
    if (err && err.error) throw err;
    var code = err && err.name === 'AbortError' ? 'timeout' : 'network';
    var wrapped = new Error(code);
    wrapped.error = code;
    throw wrapped;
  });
}

function getTeaser(copy) {
  return postJson('/api/public/field-read', { copy: copy }, 8000);
}

function unlock(id, fields) {
  return postJson('/api/public/field-read/' + encodeURIComponent(id) + '/unlock', {
    email: fields.email,
    role: fields.role,
    company: fields.company
  }, 15000);
}

function track(name, props) {
  if (typeof window.plausible !== 'function') return;
  if (props) window.plausible(name, { props: props });
  else window.plausible(name);
}

function persist(view) {
  try {
    if (!readId || !teaser) {
      sessionStorage.removeItem(STORE_KEY);
      return;
    }
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ id: readId, teaser: teaser, view: view }));
  } catch (err) {}
}

function clearStoredRead() {
  readId = null;
  teaser = null;
  try { sessionStorage.removeItem(STORE_KEY); } catch (err) {}
}

function clampScore(score) {
  var n = Math.round(Number(score));
  if (!isFinite(n) || n < 0) return 0;
  if (n > 5) return 5;
  return n;
}

function scoreLine(score, extra) {
  var line = clampScore(score) + ' of 5 hard hats';
  return extra ? line + ' · ' + extra : line;
}

function byId(id) {
  return document.getElementById(id);
}

function show(name) {
  ['paste', 'teaser', 'gate', 'result', 'busy'].forEach(function (key) {
    byId('state-' + key).hidden = key !== name;
  });
  window.scrollTo(0, 0);
  var heading = document.querySelector('#state-' + name + ' h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

function fillHats(node, score) {
  var n = clampScore(score);
  var html = '';
  var i;
  for (i = 0; i < 5; i++) {
    html += i < n ? HAT_SVG.replace('hat-icon', 'hat-icon on') : HAT_SVG;
  }
  node.innerHTML = html;
  node.setAttribute('aria-label', n + ' of 5 hard hats');
}

function fillEye(block, phrase, note) {
  var p = block.querySelector('p');
  p.textContent = '';
  if (!phrase) {
    block.hidden = true;
    return;
  }
  block.hidden = false;
  var quote = document.createElement('span');
  quote.className = 'quote';
  quote.textContent = '\u201C' + phrase + '\u201D';
  p.appendChild(quote);
  if (note) p.appendChild(document.createTextNode(' ' + note));
}

function renderScoreHead(prefix, data) {
  fillHats(byId(prefix + '-hats'), data.score);
  byId(prefix + '-verdict').textContent = data.verdict;
  byId(prefix + '-meta').textContent = scoreLine(data.score);
}

function renderTeaser() {
  renderScoreHead('teaser', teaser);
  byId('teaser-gut').textContent = teaser.gut;
  fillEye(byId('teaser-eye'), teaser.eye_roll, null);
}

function renderGate() {
  fillHats(byId('gate-hats'), teaser.score);
  byId('gate-verdict').textContent = teaser.verdict;
  byId('gate-meta').textContent = scoreLine(teaser.score, 'free teaser already shown');
}

function renderSeats(seats) {
  var wrap = byId('result-seats');
  wrap.textContent = '';
  seats.forEach(function (item) {
    var card = document.createElement('article');
    card.className = 'seat';
    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = item.seat;
    card.appendChild(tag);
    if (item.reaction) {
      var reaction = document.createElement('p');
      reaction.className = 'reaction';
      reaction.textContent = item.reaction;
      card.appendChild(reaction);
    }
    if (item.quote) {
      var quote = document.createElement('p');
      quote.className = 'evidence';
      quote.textContent = '\u201C' + item.quote + '\u201D';
      card.appendChild(quote);
    }
    if (item.source) {
      var source = document.createElement('p');
      source.className = 'source';
      source.textContent = item.source;
      card.appendChild(source);
    }
    wrap.appendChild(card);
  });
}

function renderShare(share) {
  var n = clampScore(share.score);
  sharePayload = { verdict: share.verdict, score: n, rewrite: share.rewrite };
  fillHats(byId('share-hats'), n);
  byId('share-verdict').textContent = share.verdict;
  byId('share-meta').textContent = scoreLine(n);
  byId('share-line').textContent = share.rewrite;
  byId('share-card').setAttribute('aria-label',
    'Share card. Verdict: ' + share.verdict + '. ' + scoreLine(n) + '. ' +
    share.rewrite + ' The pasted copy is not shown.');
}

function renderResult() {
  renderScoreHead('result', teaser);
  byId('result-gut').textContent = teaser.gut;
  byId('result-lands').textContent = full.lands;
  fillEye(byId('result-eye'), teaser.eye_roll, full.eye_roll_note);
  byId('result-rewrite').textContent = full.rewrite;
  renderSeats(full.seats);
  renderShare(full.share);
}

function setPasteHint(message, isError) {
  var hint = byId('paste-hint');
  hint.textContent = message;
  hint.classList.toggle('is-error', !!isError);
  byId('copy').setAttribute('aria-invalid', isError ? 'true' : 'false');
}

function clearFieldError(name) {
  var err = byId(name + '-error');
  err.hidden = true;
  err.textContent = '';
  byId(name).removeAttribute('aria-invalid');
}

function setFieldError(name, message) {
  var err = byId(name + '-error');
  err.hidden = false;
  err.textContent = message;
  byId(name).setAttribute('aria-invalid', 'true');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sharePlain(share) {
  return share.verdict + '\n' + scoreLine(share.score) + '\n\n' + share.rewrite + '\n\ngantrics.com/score';
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () {
      return fallbackCopy(text);
    });
  }
  return fallbackCopy(text);
}

function fallbackCopy(text) {
  return new Promise(function (resolve, reject) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    area.remove();
    if (ok) resolve();
    else reject(new Error('copy failed'));
  });
}

function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([
    document.fonts.load('700 64px "Space Grotesk"'),
    document.fonts.load('600 44px "Space Grotesk"'),
    document.fonts.load('500 22px "JetBrains Mono"'),
    document.fonts.ready
  ]).catch(function () { return null; });
}

function loadLogo() {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = 'assets/logo-white.svg';
  });
}

function wrapText(ctx, text, maxWidth) {
  var words = String(text).split(/\s+/);
  var lines = [];
  var line = '';
  var i, test;
  for (i = 0; i < words.length; i++) {
    test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawHat(ctx, x, y, w, h, on) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 40, h / 36);
  ctx.fillStyle = on ? '#EEE40A' : '#4A557A';
  ctx.fill(new Path2D(SHELL));
  ctx.fillStyle = on ? '#212C4A' : '#2C3858';
  ctx.fill(new Path2D(RIDGE));
  ctx.fillStyle = on ? '#D6CC08' : '#3A4668';
  ctx.fill(new Path2D(BRIM));
  ctx.restore();
}

function paintShare(share, logo) {
  var scale = 2;
  var width = 560 * scale;
  var padX = 28 * scale;
  var padTop = 28 * scale;
  var padBottom = 24 * scale;
  var bar = 8 * scale;
  var maxText = width - padX * 2;
  var measure = document.createElement('canvas').getContext('2d');
  measure.font = '600 ' + (22 * scale) + 'px "Space Grotesk", sans-serif';
  var lines = wrapText(measure, share.rewrite, maxText);
  var fieldLineH = Math.round(22 * scale * 1.35);
  var logoH = 22 * scale;
  var hatW = 38 * scale;
  var hatH = 34 * scale;
  var hatGap = 6 * scale;
  var height = padTop + logoH + (22 * scale) + hatH + (10 * scale) +
    Math.round(32 * scale * 1.1) + (6 * scale) + Math.round(12 * scale * 1.4) +
    (20 * scale) + (lines.length * fieldLineH) + ((22 * scale) - (fieldLineH - (22 * scale))) +
    Math.round(11 * scale * 1.4) + padBottom + bar;

  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#212C4A';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#EEE40A';
  ctx.fillRect(0, height - bar, width, bar);

  var y = padTop;
  if (logo && logo.naturalWidth) {
    var ratio = logo.naturalWidth / logo.naturalHeight;
    ctx.drawImage(logo, padX, y, logoH * ratio, logoH);
  }
  ctx.fillStyle = '#EEE40A';
  ctx.font = '500 ' + (11 * scale) + 'px "JetBrains Mono", ui-monospace, monospace';
  ctx.letterSpacing = '0.14em';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText('FIELD READ', width - padX, y + logoH / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '0px';

  y += logoH + (22 * scale);
  var i;
  for (i = 0; i < 5; i++) {
    drawHat(ctx, padX + i * (hatW + hatGap), y, hatW, hatH, i < share.score);
  }

  y += hatH + (10 * scale);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 ' + (32 * scale) + 'px "Space Grotesk", sans-serif';
  ctx.letterSpacing = '-0.02em';
  ctx.fillText(share.verdict, padX, y);

  y += Math.round(32 * scale * 1.1) + (6 * scale);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '500 ' + (12 * scale) + 'px "JetBrains Mono", ui-monospace, monospace';
  ctx.letterSpacing = '0.12em';
  ctx.fillText(scoreLine(share.score).toUpperCase(), padX, y);

  y += Math.round(12 * scale * 1.4) + (20 * scale);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 ' + (22 * scale) + 'px "Space Grotesk", sans-serif';
  ctx.letterSpacing = '0px';
  lines.forEach(function (line) {
    ctx.fillText(line, padX, y);
    y += fieldLineH;
  });

  /* fieldLineH already advanced past the last line; pull back to a 22px gap. */
  y += (22 * scale) - (fieldLineH - (22 * scale));
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '500 ' + (11 * scale) + 'px "JetBrains Mono", ui-monospace, monospace';
  ctx.letterSpacing = '0.12em';
  ctx.fillText('GANTRICS.COM/SCORE', padX, y);
  return canvas;
}

function drawShareCard(share) {
  return fontsReady().then(loadLogo).then(function (logo) {
    return paintShare(share, logo);
  });
}

function downloadCanvas(canvas) {
  var name = 'gantrics-field-read.png';
  canvas.toBlob(function (blob) {
    if (!blob) return;
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }, 'image/png');
}

function finishRequest() {
  busy = false;
  byId('paste-submit').disabled = false;
  byId('gate-submit').disabled = false;
}

function handleFailure(err) {
  var code = (err && err.error) || 'network';
  track('Score Error', { error: code });
  if (code === 'too_short') {
    byId('paste-expired').hidden = true;
    setPasteHint('Paste at least 40 characters.', true);
    show('paste');
    return;
  }
  if (code === 'invalid_email') {
    setFieldError('email', 'Enter a work email like you@company.com.');
    show('gate');
    return;
  }
  if (code === 'not_found_or_expired') {
    clearStoredRead();
    setPasteHint(PASTE_HINT, false);
    byId('paste-expired').hidden = false;
    show('paste');
    return;
  }
  show('busy');
}

function runTeaser(copy) {
  lastCopy = copy;
  lastAction = 'teaser';
  busy = true;
  byId('paste-submit').disabled = true;
  getTeaser(copy).then(function (data) {
    readId = data.id;
    teaser = data.teaser;
    byId('paste-expired').hidden = true;
    setPasteHint(PASTE_HINT, false);
    renderTeaser();
    track('Score Teaser');
    show('teaser');
    persist('teaser');
    finishRequest();
  }, function (err) {
    finishRequest();
    handleFailure(err);
  });
}

function runUnlock(fields) {
  lastFields = fields;
  lastAction = 'unlock';
  busy = true;
  byId('gate-submit').disabled = true;
  unlock(readId, fields).then(function (data) {
    full = data;
    renderResult();
    track('Score Unlock');
    show('result');
    finishRequest();
  }, function (err) {
    finishRequest();
    handleFailure(err);
  });
}

byId('paste-form').addEventListener('submit', function (event) {
  event.preventDefault();
  if (busy) return;
  var copy = byId('copy').value.trim();
  if (copy.length < MIN_COPY) {
    setPasteHint('Paste at least 40 characters.', true);
    return;
  }
  if (copy.length > MAX_COPY) {
    setPasteHint('Keep it to 1,500 characters.', true);
    return;
  }
  track('Score Paste');
  runTeaser(copy);
});

byId('copy').addEventListener('input', function () {
  byId('paste-expired').hidden = true;
  if (byId('paste-hint').classList.contains('is-error')) setPasteHint(PASTE_HINT, false);
});

byId('open-gate').addEventListener('click', function () {
  renderGate();
  show('gate');
  persist('gate');
});

['email', 'role', 'company'].forEach(function (name) {
  byId(name).addEventListener('input', function () { clearFieldError(name); });
});

byId('gate-form').addEventListener('submit', function (event) {
  event.preventDefault();
  if (busy) return;
  var email = byId('email').value.trim();
  var role = byId('role').value.trim();
  var company = byId('company').value.trim();
  var ok = true;
  clearFieldError('email');
  clearFieldError('role');
  clearFieldError('company');
  if (!email || !validEmail(email)) {
    setFieldError('email', 'Enter a work email like you@company.com.');
    ok = false;
  }
  if (!role) {
    setFieldError('role', 'Add your role.');
    ok = false;
  }
  if (!company) {
    setFieldError('company', 'Add your company.');
    ok = false;
  }
  if (!ok) return;
  runUnlock({ email: email, role: role, company: company });
});

byId('busy-retry').addEventListener('click', function () {
  if (busy) return;
  if (lastAction === 'unlock') runUnlock(lastFields);
  else runTeaser(lastCopy);
});

(function restoreRead() {
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); } catch (err) { saved = null; }
  if (!saved || !saved.id || !saved.teaser) return;
  readId = saved.id;
  teaser = saved.teaser;
  if (saved.view === 'gate') {
    renderGate();
    show('gate');
  } else {
    renderTeaser();
    show('teaser');
  }
})();

byId('share-download').addEventListener('click', function () {
  var button = this;
  if (!sharePayload) return;
  button.disabled = true;
  drawShareCard(sharePayload).then(function (canvas) {
    downloadCanvas(canvas);
    track('Score Share: Download');
  }).catch(function () {
    button.textContent = 'Try again';
  }).then(function () {
    button.disabled = false;
  });
});

byId('share-copy').addEventListener('click', function () {
  var button = this;
  if (!sharePayload) return;
  copyText(sharePlain(sharePayload)).then(function () {
    track('Score Share: Copy');
    button.textContent = 'Copied';
  }).catch(function () {
    button.textContent = 'Try again';
  }).then(function () {
    setTimeout(function () { button.textContent = 'Copy'; }, 2000);
  });
});

byId('share-linkedin').addEventListener('click', function () {
  track('Score Share: LinkedIn');
});
byId('share-linkedin').href = LINKEDIN_URL;

byId('book').addEventListener('click', function () {
  track('Score Book');
});
