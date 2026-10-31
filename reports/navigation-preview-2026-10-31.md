# Navigation and touch-scroll preview QA — 2026-10-31 KST

Preview only; no production deployment or remote push.

## Changes
- Direct home/return actions select a card synchronously; only gesture navigation slides. Non-selected cards stay hidden during direct navigation.
- Cancel stale image opens and queued deck movements on close/reset/route departure; modal-open checks prevent delayed opens behind dialogs.
- Library deep-link startup masks the home deck until destination render. Light/dark theme supported; load fallback avoids a stuck mask.
- Keep outgoing document visible instead of hiding the entire body; ignore cancelled/local controls. Home departure stops Reader and commentary audio without exposing the underlying Reader panel.
- Bible-picker parent remains transparent so the intended current-home backdrop remains visible; the iframe owns the dimming scrim. Only the loading state uses a matching translucent scrim. The initial opaque-background fix was reverted after user-reported gray-screen regression.
- Settings/account/legacy dialogs retain native scroll; home gesture handling no longer captures their touch movement.
- Reader Find/archive positioning is immediate. Chapter arrows are hidden synchronously when leaving actual verse view; delayed callbacks cannot resurrect them.
- Existing approved changes retained: smaller login illustration (.74), original library image/title/content order, bottom-only passage action.
- Service-worker precache home asset URLs aligned with existing preview HTML references. Cache version unchanged; deployment must independently version changed assets and app cache. No user data/audio cache changes.

## Automated validation passed
- home-guide-return-card.test.mjs: 12 cases (direct selection, gesture preservation, delayed image cancellation/races, modal state).
- home-life-read-native-touch.test.mjs: 21 cases (Touch-only/Pointer+Touch, native read clicks, modal scroll isolation).
- reader-chapter-arrows-navigation.test.cjs: 8 cases.
- library-entry-first-frame.test.cjs: 8 scenarios.
- library-detail-shortcuts.test.cjs: 3 tests including all 39 passage ranges/return URLs and bottom-only action.
- reader-panel-entry.test.mjs: 12 route classification/readiness scenarios.
- guide-navigation-minimal.test.mjs: 18 route/dock/account/width checks.
- library-viewport.test.cjs: 4 viewport checks.
- navigation-departure.test.mjs and transition-stale-frame.test.mjs: outgoing paint/anchor classification/return reset and cache-reference checks.
- reader-touch-pan.test.cjs with temporary jsdom 26: up/down, cancellation, native pinch handoff, exit/reentry; 22 Reader inline scripts parsed.
- Changed standalone JS syntax and git diff --check passed.

## Live cloud Chromium checks
- Home → Bible picker → close; home deck cards 0 → 1 → 2 via scroll; card 2 → Home.
- After Home action: card 0 visible, cards 1/2 hidden, transition duration 0s.
- Home → story list → creation detail → passage → original creation detail.
- Detail scroll moved to scrollTop 1602 (content 2386 / viewport 784).
- Find scroll moved to scrollTop 823 (content 2151 / viewport 823).
- Resume read → passage scroll (document scrollY 2025) → Find → archive.
- Reproduced chapter arrows lingering in Find before patch; after patch both hidden=true and display=none.

## Limits
No physical Android or iPhone test. Touch behavior validated with real production handlers in DOM/VM simulations, not an Android device. Cloud UI state inspection is not frame-by-frame video proof; read-only browser runtime does not expose requestAnimationFrame sampling. Cold images/network loading still take time. No promise of zero-frame flicker on every device or production readiness without device review.

## Follow-up: Bible picker gray-screen regression
The ready parent background was rgb(255,255,255), combined with the child translucent drawer scrim, hiding Home entirely. Restored transparent parent and removed dark opaque override; loading uses original rgba(15,23,42,.28). Live screenshots confirmed Home visible behind book drawer and book expansion to Genesis chapters works. Existing 21 touch/native-scroll tests passed. Preview only.


## Follow-up: Home → Find / Archive and return delay

### Confirmed causes and fixes
- Reader hid the entire body until its requested panel initialized. Find waited for DOMContentLoaded (including unrelated deferred auth/audio scripts); Archive additionally waited for both full Bible text files. Both local panels now initialize and reveal synchronously after their own DOM and functions are available. Passage layout guards are retained.
- Late DOMContentLoaded handlers could reselect Find after the user switched tabs. Late data initialization could erase the current query or scroll position. Local panel bootstrap is idempotent, data loading starts once after the first paint, and later initialization does not replay the original navigation.
- Live QA found the Archive title briefly changed back to “성경”: the static translation key remained home.tab.bible. Dock labels now retain the matching translation key for the active panel; dynamic book labels remove it.
- The home card was entirely hidden while its photo decoded, with an 8-second fallback. Text and controls now remain visible over the existing solid background. Direct detail returns select their requested card before paint. The image no longer controls navigation readiness.
- Outgoing Home navigation cancels pending image callbacks and freezes existing card positions. A canceled navigation or browser back settles a partially moved card completely.
- Find, Archive and the hidden home Bible picker used to eagerly download/parse the 50,752,250-byte audio manifest. They now defer it until a real passage or audio action needs it. Direct reading routes retain eager audio preparation, and the existing wait paths explicitly start it.

### Follow-up verification
- 37 home return/touch/gesture tests passed, plus new first-paint DOM checks for 8 route targets, slow/failed images, outgoing animation, modified clicks and browser-return settling.
- New Reader local-panel startup test executes shipped synchronous scripts while holding Bible downloads and DOMContentLoaded independently. Passed requested destinations, saved/empty archive, existing resume records, late i18n, changed destination, typed query and canceled stale action checks.
- 12 panel-entry, 8 chapter-arrow, 8 staged-data/resilience, 18 guide navigation and 8 library entry scenarios passed. Navigation departure/cache checks passed.
- Android touch-handler simulation again passed pan up/down, cancellation, pinch handoff and leave/reenter; 23 Reader inline scripts parsed. No physical Android device was available.
- Audio checks: 19 lazy manifest + 18 start readiness + 10 shard checks = 47 passed. One optional older iOS memory suite has an unrelated existing source-version assertion requiring v50; current baseline already references the newer preview engine URL. Its 5 functional cases pass.
- Live cloud Chromium repeated Home → Find, Home → Archive, Find → Home, and Reader dock navigation. A temporary preview-only requestAnimationFrame DOM sampler observed no wrong visible panel/card/heading in the checked destination loads after the final fix. The sampler was removed from the delivered preview.
- Warm-preview diagnostic examples, measured from document navigation to the first sampled correct visible DOM state (not device benchmarks): Find 1286 → 283 ms; Archive 1445 → 196 ms; Home return 242 → 122 ms. Browser/device/network timing will vary.
- Live Find and Archive each showed zero full audio-manifest resource requests. Resume reading opened the recorded Numbers 2:1 location; the manifest loaded on the reading route, and a selected-verse Listen click showed Pause/mini-player controls with the engine play log for numbers.002.001.bible. No claim of physical-device audio testing.

Preview only; no production deployment or remote push. Existing design, consent behavior and saved user records are retained. Remaining nonblank startup work includes full Bible text parsing/search indexing; this change does not promise zero latency on every device.
