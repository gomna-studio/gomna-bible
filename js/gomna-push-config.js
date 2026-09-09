/*! 은혜의말씀 — Web Push public config only. VAPID private key는 여기 두지 않는다. */
(function (root) {
  'use strict';
  var PUBLIC_KEY = 'BMTTUt4oQf4gEh_zc6OgzedTD7ssa-1LtTooYvvrw153a8dav7tHfsgkCjqY9PSWFEz75ot2u25yVyA40eK0xOo';
  var SUPABASE_FN = 'https://noogfnsgvewpbjpafnxc.supabase.co/functions/v1';
  function isLocalHost(host) {
    host = String(host || '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
      || /^192\.168\.\d+\.\d+$/.test(host)
      || /^10\.\d+\.\d+\.\d+$/.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
  }
  function apiBase() {
    try {
      var host = String(location.hostname || '');
      if (host === 'gomnastudio.com' || host === 'www.gomnastudio.com') return SUPABASE_FN;
    } catch (e) {}
    return '';
  }
  root.GomnaPushConfig = {
    vapidPublicKey: PUBLIC_KEY,
    anonKey: 'sb_publishable_XWXOFlU4rLS-oqTB0uOlYw_NB1Qbeiz',
    supabaseFunctionsBase: SUPABASE_FN,
    apiBase: apiBase,
    isLocalHost: isLocalHost,
    subscribePath: '/push-subscribe',
    unsubscribePath: '/push-unsubscribe',
    statusPath: '/push-status',
    sendTestPath: '/push-send-daily'
  };
})(window);
