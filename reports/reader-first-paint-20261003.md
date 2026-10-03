# Reader first-paint fix — local verification

Baseline: origin/main ed8ac3d12f486f0930d340e7a4baf1dd8a5b8f66.
Branch: fix/reader-find-first-paint-20261003. No push, merge or deployment.

## Proven mechanism

The home bottom Find link enters reader.html?easy=1. Reader HTML contains the default Bible heading and toolbar. activateEasyViewEarly runs at DOMContentLoaded, but does not initialize the heading/chrome. initializeApp waits for both Bible data files; runDeferredUrlNavigation then defers applyNavigationFromQuery by requestAnimationFrame and setTimeout. Thus default chrome can paint before switchTab('easy') synchronizes the requested screen. The existing departure-only transition guard cannot prevent this destination first paint.

## Change

Only reader.html app code changed. A synchronous head bootstrap classifies Find, Favorites and Search routes following explicit-book precedence. It keeps the destination covered until the requested panel is active and has content, after navigation/chrome synchronization. A 15-second failure message replaces indefinite unexplained loading; successful late initialization removes the failure state. Charset remains within the first 1024 bytes. Audio, login, data and service-worker code unchanged.

This avoids showing incorrect interim UI. It does not remove the underlying data-loading wait or promise instant navigation.

## Verification

Local Chromium, widths 390 and 1280, external network blocked, service workers disabled. Both data requests deliberately delayed 1200ms. Real home bottom Find link clicked.

| Case | Existing main incorrect heading frames | Fixed incorrect heading frames |
|---|---:|---:|
| 390px | 82 | 0 |
| 1280px | 81 | 0 |

No pageerror events in these four comparisons. Frames are requestAnimationFrame DOM/computed-style samples, not iPhone video frames.

- Find query variants, Favorites, Search focus and search term: passed.
- Home → Find → browser back, repeated five times: passed.
- Not-ready panel stays covered, ready panel removes pending/failure states: passed.
- Bootstrap unit checks: 12 route classifications and failure/readiness cases.
- Existing transition regression test: passed.
- 22 inline JavaScript blocks parse successfully; git diff --check passed.

## Not verified / acceptance still pending

Actual Mac Safari, iPhone Safari, installed iPhone PWA, Android, production service-worker upgrade and existing-client cache behavior were not tested. Audio/login runtime regression was not exercised, although their code was not changed. This is not proof that every app transition or every old-image flash is fixed.

CEO device preview and explicit approval required before any deployment. No working Mac/iPhone local preview URL has been established from this remote workspace.

## Run tests

node tests/reader-panel-entry.test.mjs
node tests/transition-stale-frame.test.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_EXECUTABLE=/path/to/chromium node tests/reader-panel-first-paint.browser.mjs

Browser test serves the repository on a temporary loopback port and requires current working directory to be the repository root. It reads origin/main as the comparison baseline.
