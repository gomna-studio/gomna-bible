/*! 은혜의말씀 — Today-word email public config only. API key는 여기 두지 않는다. */
(function (root) {
  'use strict';
  var SUPABASE_FN = 'https://noogfnsgvewpbjpafnxc.supabase.co/functions/v1';
  function apiBase() {
    try {
      var host = String(location.hostname || '');
      if (host === 'gomnastudio.com' || host === 'www.gomnastudio.com') return SUPABASE_FN;
    } catch (e) {}
    return '';
  }
  root.GomnaMailConfig = {
    anonKey: 'sb_publishable_XWXOFlU4rLS-oqTB0uOlYw_NB1Qbeiz',
    supabaseFunctionsBase: SUPABASE_FN,
    apiBase: apiBase,
    subscribePath: '/mail-subscribe',
    unsubscribePath: '/mail-unsubscribe',
    statusPath: '/mail-status'
  };
})(window);
