'use strict';

/* Local stand-in for proof. score.html does not load this file.
   node tests/field-read-mock-server.js
   POST /api/public/field-read and POST /api/public/field-read/:id/unlock
   The copy or email selects an error. Anything else is a 200. */

var http = require('http');

var teaser = {
  id: 'fr_mock_1',
  teaser: {
    gut: "Sounds like every booth at the show. A super stops reading at 'seamless.'",
    score: 2,
    verdict: 'Heard it before',
    eye_roll: 'seamlessly connects every stakeholder'
  }
};

var unlocked = {
  lands: 'The idea of fewer RFIs lands with the PM seat.',
  eye_roll_note: "'Seamlessly' reads as marketing, not jobsite. Say what actually changes on Monday.",
  rewrite: 'Cut RFI turnaround from days to hours, without adding another login for your field team.',
  seats: [
    {
      seat: 'Super',
      reaction: "EXAMPLE: I'd want to know who on my crew has to log in.",
      quote: 'EXAMPLE quote placeholder',
      source: 'Superintendent, mid-size GC'
    },
    {
      seat: 'PM',
      reaction: 'EXAMPLE: Show me which RFI this closes on Monday.',
      quote: 'EXAMPLE quote placeholder',
      source: 'Project Manager, general contractor'
    },
    {
      seat: 'Precon',
      reaction: 'EXAMPLE: Can I put the current set in front of a sub tomorrow?',
      quote: 'EXAMPLE quote placeholder',
      source: null
    }
  ],
  share: {
    verdict: 'Heard it before',
    score: 2,
    rewrite: 'Cut RFI turnaround from days to hours, without adding another login for your field team.'
  }
};

var seen = [];

function send(res, status, body) {
  var json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  });
  res.end(json);
}

function readBody(req) {
  return new Promise(function (resolve) {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      var text = Buffer.concat(chunks).toString();
      var body = {};
      try { body = text ? JSON.parse(text) : {}; } catch (err) { body = {}; }
      resolve({ text: text, body: body });
    });
  });
}

function teaserStatus(copy) {
  var text = copy || '';
  if (text.indexOf('TOO_SHORT') !== -1) return [422, { error: 'too_short' }];
  if (text.indexOf('TOO_LONG') !== -1) return [413, { error: 'too_long' }];
  if (text.indexOf('INVALID_INPUT') !== -1) return [422, { error: 'invalid_input' }];
  if (text.indexOf('RATE') !== -1) return [429, { error: 'rate_limited' }];
  if (text.indexOf('DAILY') !== -1) return [503, { error: 'daily_cap' }];
  if (text.indexOf('UPSTREAM') !== -1) return [502, { error: 'upstream_failed' }];
  if (text.indexOf('BUSY') !== -1) return [503, { error: 'busy' }];
  return [200, teaser];
}

var server = http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }
  var path = (req.url || '').split('?')[0];
  if (req.method === 'GET' && path === '/__requests') {
    send(res, 200, seen);
    return;
  }
  readBody(req).then(function (parsed) {
    seen.push({
      method: req.method,
      path: path,
      contentType: req.headers['content-type'] || '',
      cookie: req.headers.cookie || '',
      body: parsed.body
    });
    if (req.method === 'POST' && path === '/api/public/field-read') {
      if ((parsed.body.copy || '').indexOf('TIMEOUT') !== -1) {
        setTimeout(function () { send(res, 200, teaser); }, 20000);
        return;
      }
      var status = teaserStatus(parsed.body.copy);
      send(res, status[0], status[1]);
      return;
    }
    if (req.method === 'POST' && /^\/api\/public\/field-read\/[^/]+\/unlock$/.test(path)) {
      var email = parsed.body.email || '';
      if (email === 'reject@company.com') return send(res, 422, { error: 'invalid_email' });
      if (email === 'expired@company.com') return send(res, 404, { error: 'not_found_or_expired' });
      if (email === 'busy@company.com') return send(res, 503, { error: 'busy' });
      return send(res, 200, unlocked);
    }
    send(res, 404, { error: 'not_found_or_expired' });
  });
});

var port = Number(process.env.PORT) || 8799;
server.listen(port, '127.0.0.1', function () {
  console.log('field-read mock on http://127.0.0.1:' + port);
});
