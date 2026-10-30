const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('js/gomna-ux-telemetry.js', 'utf8');
function setup(host = 'gomnastudio.com') {
  let consent = false, io;
  const calls = [], events = {}, docEvents = {};
  const element = { isConnected: true, getAttribute: k => k === 'data-gomna-exposure' ? 'people_card' : null };
  const window = { location: { hostname: host }, GomnaGa4: { allowed: () => consent, track: (name, params) => { calls.push({ name, params }); return true; } },
    addEventListener: (name, cb) => events[name] = cb,
    IntersectionObserver: function (cb) { io = cb; this.observe = () => {}; }, MutationObserver: function () { this.observe = () => {}; } };
  const document = { readyState: 'complete', visibilityState: 'visible', body: {}, querySelectorAll: () => [element], addEventListener: (name, cb) => docEvents[name] = cb };
  const context = vm.createContext({ window, document, setTimeout: cb => cb(), WeakSet, Map });
  vm.runInContext(source, context);
  return { calls, window, document, events, docEvents, context, setConsent: c => consent = c, expose: () => io([{ target: element, isIntersecting: true, intersectionRatio: 0.5 }]) };
}
test('no consent, no collection; late consent records current exposure once', () => {
  const t = setup(); t.expose(); t.window.GomnaUxTelemetry.trackAction({ action: 'home_read', placement: 'today_card' }); assert.equal(t.calls.length, 0);
  t.setConsent(true); t.window.GomnaUxTelemetry.refresh(); t.expose(); assert.equal(t.calls.length, 1); assert.equal(t.calls[0].name, 'ux_content_view');
});
test('preview hostname fails closed even if shared gate says allowed', () => {
  const t = setup('preview.example.com'); t.setConsent(true); t.expose(); t.events['gomna:home-action']({ detail: { action: 'home_read', placement: 'today_card' } }); assert.equal(t.calls.length, 0);
});
test('allowlist removes arbitrary values and never includes reference or text', () => {
  const t = setup(); t.setConsent(true);
  t.events['gomna:home-action']({ detail: { action: 'home_read', placement: 'today_card', reference: 'private data' } });
  assert.equal(t.calls.length, 1); assert.equal(t.calls[0].params.reference, undefined);
  t.window.GomnaUxTelemetry.trackAction({ action: 'private data', placement: 'today_card' }); assert.equal(t.calls.length, 1);
});
test('delegated click and repeated script load do not duplicate one event', () => {
  const t = setup(); t.setConsent(true);
  const target = { getAttribute: k => k === 'data-gomna-action' ? 'topic_read' : 'topic_verse' };
  const event = { target: { closest: () => target } };
  t.docEvents.click(event); t.docEvents.click(event); vm.runInContext(source, t.context); assert.equal(t.calls.length, 1);
});
test('revocation stops actions and subsequent exposures', () => {
  const t = setup(); t.setConsent(true); t.window.GomnaUxTelemetry.trackAction({ action: 'resume_read', placement: 'resume_card' });
  t.setConsent(false); t.expose(); t.window.GomnaUxTelemetry.trackAction({ action: 'resume_read', placement: 'resume_card' }); assert.equal(t.calls.length, 1);
});
