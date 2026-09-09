'use strict';
const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DAILY = require(path.join(ROOT, 'js/gomna-daily-verses.js'));

const date = process.argv[2] || DAILY.kstDateKey();
const port = process.env.PORT || '8000';
const secret = process.env.MAIL_CRON_SECRET || process.env.PUSH_CRON_SECRET || '';
const body = JSON.stringify({ date: date, mode: 'daily' });
const req = http.request({
  hostname: '127.0.0.1',
  port: port,
  path: '/api/mail/send-daily',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'x-gomna-mail-cron': secret
  }
}, function (res) {
  let raw = '';
  res.on('data', function (c) { raw += c; });
  res.on('end', function () {
    console.log(raw || res.statusCode);
    if (res.statusCode >= 400) process.exit(1);
  });
});
req.on('error', function (err) {
  console.error(err.message);
  process.exit(1);
});
req.write(body);
req.end();
