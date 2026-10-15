# Mobile blank lower viewport investigation

Base: main 2a627e696e9d289ad20804386695d537816342bd.

The supplied iPhone screenshots show the home card clipped above navigation and an Abraham detail ending after its heading. These images establish the symptom, not the runtime viewport measurements or which deployment introduced it.

Confirmed code defects: library layout used raw visualViewport.height/offsetTop and did not subscribe to the existing viewport-restored event. The home recovery helper required innerHeight to agree with a small-viewport CSS measurement, so simultaneous stale JavaScript heights were not recovered.

Changes: connect library layout to the shared corrected viewport, listen for recovery/focus/visibility, and use agreement between dynamic CSS height and fixed layout as an additional independent measurement. Keep keyboard, zoom, ordinary browser and audio-update guards. Prepare static release v99; no audio/data/auth cache deletion changes.

Validation: 12 recovery tests, 4 library layout tests, 10 startup regression groups, JS syntax checks and git diff --check passed. The model reproduces a library panel ending at 430px despite navigation at 692px; corrected layout reaches 692px. Simultaneously stale innerHeight and visualViewport readings recover to a 780px CSS/fixed viewport. Older release tests used a no-longer-valid release string; fixtures now follow the existing release version parser.

Limitations: production desktop Chrome visually inspected, but no physical iPhone or Android reproduction. Local Chromium download failed; WebKit downloaded but cannot launch because required host libraries are missing, and dependency installation failed. This patch is a candidate for the observed symptom, not proof that every blank screen is fixed. Keep draft until mobile preview/physical-device checks verify home, people/story scrolling, background/resume, keyboard and zoom. Do not infer that this UI fault explains active-user counts without analytics evidence.
