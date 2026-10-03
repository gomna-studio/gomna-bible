# Reader entry polish — local preview v3

Scope: prepare the requested Reader destination and scripture positioning before revealing it. No deployment authorized or performed.

Observed cause: scripture positioning ran immediately, two frames later and again at 220 ms after revealing the view. The last correction could move an already visible passage. Default Reader markup could also precede URL navigation.

Changes: gate initial Reader paint on URL navigation, content and stable layout; wait for scripture centering and commentary readiness; remove the 220 ms reposition and normal loading label. Preserve outgoing content behind a transparent click blocker.

Validation: Chromium 390/1280 px with Bible data delayed 1200 ms reproduced 70/63 wrong-title frames on origin/main and zero on candidate. Five panel variants, five Home/Find/back repetitions, nine scripture entry source variants and three commentary variants passed. A verse entry remained stationary during 600 ms of post-reveal frame sampling. Unit guard checks cover layout delay and late recovery. Transition regression and diff checks passed.

Limits: desktop Chromium viewport simulation is not physical iPhone Safari verification. Independent HTML navigation may show a neutral background while the destination initializes. Authentication, translated UI, production cache migration and all possible book/range combinations are not certified by these tests. Audio engine unchanged; preview includes tracked manifest and cue files. Final deployment requires user review and explicit instruction.
