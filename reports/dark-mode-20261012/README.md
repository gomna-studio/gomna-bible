# 다크모드 조사 및 수정 — 검토용, 배포 금지

기준: main a58e2b0827eeadbae2106dc86367728058982921 (PR #205).
2026-10-12 운영에서 받은 index.html, reader.html, js/gomna-theme.js,
js/gomna-guide-colorful.css, gomna_category_feature.js, sw.js는 이 main과 바이트 단위로 일치했다.

## 확인된 원인

- settings_guide.js의 설정 버튼 → GomnaTheme.set(option.id) → gomna_theme_v1 저장 → html[data-gomna-theme] 적용.
- 길잡이 CSS의 다크 팔레트는 html/body[data-theme="dark"]를 사용했다. 앱이 설정하는 속성과 불일치한다.
- 길잡이의 --guide-ink/--guide-muted를 !important 색상 규칙이 참조한다. 공통 테마의 자동 색상 스캐너만으로 명시적인 길잡이 팔레트를 대신하는 구조였다.
- 닫기 버튼 3곳은 인라인 color:#000!important여서 외부 다크 CSS보다 우선했다.
- 수정은 길잡이 팔레트를 실제 테마 속성과 공통 색상 변수에 연결하고, 닫기 색상을 var(--gomna-text,#000)으로 바꾼다. 다크에서만 밝은 글씨, 라이트에서는 기존 검정이다.
- 공통 자동 스캐너와 우선순위 충돌을 막기 위해 길잡이 다크 변수만 important로 명시한다. 상태/인증/이벤트/크기/배치 코드는 변경하지 않는다.

## 검사 결과와 한계

- CSS parser 통과. DOM/CSS 모의검사: 길잡이 8개 텍스트/컨트롤의 라이트 색상이 main과 동일.
- 다크 대비: 헤더/뒤로/닫기 17.03:1, 제목/본문 13.07:1, 보조 설명 6.82:1.
- 라이트→다크→라이트, localStorage 저장, 새 DOM에서 저장값 복원, 테마 적용 후 동적으로 삽입된 콘텐츠 검사 통과.
- 이는 jsdom 모의검사다. 실제 Safari 렌더링, 로그인, 앱 종료/재실행 또는 PWA 검사로 간주하지 않는다.
- 기존 관련 Node 검사 45건 중 42건 통과, 3건 실패. 수정 전 main의 해당 두 테스트 파일에서도 같은 3건 실패(18 통과/3 실패) 재현.
- 기존 실패: auth/callback.html의 auth 파일 버전 불일치 1건; gomna-pwa-recovery.test.mjs의 신규 버전 재로딩 관련 2건. 해당 코드는 이번 수정에서 건드리지 않았다.
- JavaScript 구문, Python 구문, git diff --check 통과.
- 홈/Reader/묵상은 같은 gomna-theme.js를 로드한다. 로그인 코드는 테마 키를 직접 수정하지 않는다. 전체 앱 화면의 시각적 점검은 미완료.
- 하단 내비는 기존 Reader dock을 이동하는 구조를 유지했다. 내비 전체의 실기기 대비 검증은 미완료.

## 재현/검사 명령

```sh
npm install --prefix /tmp/gomna-theme-qa jsdom css-tree --no-audit --no-fund
GOMNA_QA_MODULES=/tmp/gomna-theme-qa/node_modules node tests/guide-dark-theme.test.cjs
node --check gomna_category_feature.js
node --test tests/guide-navigation-minimal.test.mjs tests/guide-image-viewer.test.mjs tests/home-guide-return-card.test.mjs tests/home-life-read-native-touch.test.mjs tests/startup-recovery.test.mjs tests/transition-stale-frame.test.mjs scripts/tests/gomna-pwa-recovery.test.mjs scripts/tests/gomna-auth-login-flow.test.mjs
git diff --check
```

## Mac/iPhone 시험 준비

운영/오디오 작업 폴더에 덮어쓰지 말고 별도 checkout/worktree에서 이 브랜치를 연다.
`python3 scripts/preview-guide-theme.py`는 배포 없이 로컬 시험 서버를 실행하고 Mac/iPhone 주소를 출력한다.
Mac은 localhost:8841, iPhone은 같은 Wi-Fi의 Mac IP를 사용한다. 서버가 실행되기 전에는 해당 주소가 열리지 않는다.
previewTheme=dark 또는 light는 시험 응답에만 삽입된 코드로 시험 주소의 테마를 설정한다. 운영 계정/테마 저장소에는 접근하지 않는다.

HTTP LAN 미리보기는 Safari 시각검사용이다. 설치형 PWA는 신뢰되는 HTTPS 시험 호스트와 별도 설치가 필요하다.
이 환경에는 사용자의 Mac/iPhone이나 실기기 Safari가 연결되어 있지 않으므로 검증 완료로 표시하지 않는다.
미리보기의 OAuth 리디렉션은 별도 허용 주소가 없으면 운영으로 돌아갈 수 있으므로 로그인 실증 검사도 미완료다.

## 배포 게이트 / 보존

승인 전 main 병합 및 운영 배포 금지. 서비스워커/HTML 자산 버전도 아직 변경하지 않았다.
승인 후 필요한 CSS/JS 참조와 앱 STATIC 버전만 함께 갱신하고 PWA release 마커 일치 검사를 한다.
기존 로그인 저장소, BIBLE_CACHE, DATA_CACHE, AUDIO_MANIFEST_CACHE, 음원 및 Cue는 보존한다.
재생/일시정지/대기 중 강제 갱신은 하지 않는다. 기존 실패와 실기기 검증을 평가한 뒤 배포 여부를 결정한다.

## 아이콘 무반응

사용자 확인: 로그인/다크 변경 후 홈 화면 아이콘 무반응, iPhone 재시동 후 접속 회복.
당시 기기 실행/충돌 기록이 없어 원인은 확정할 수 없다. 색상 오류와 동일 원인이라는 증거도 없다.
재발 시 iOS 버전, 정확한 시각, 화면 녹화, 앱 프로세스/기기 분석 로그를 확보해야 한다.

## O/X (X는 미완료/미검증 포함)

1. 길잡이 글씨 해결: O — 코드 수정 및 DOM 모의 대비 검사; 실기기 확정은 보류.
2. 전체 앱 다크 점검: X — 공통 테마 경로 확인, 전체 시각 검증 미완료.
3. 라이트 디자인 유지: O — 검사한 색상 동일, 레이아웃 선언 변경 없음; 실기기 미검증.
4. 로그인 후 정상 적용: X — 테마 모의검사만 수행, 실제 로그인 미검증.
5. 앱 재실행 테마 유지: X — 저장값 새 DOM 복원만 확인, 설치앱 재실행 미검증.
6. iPhone Safari: X — 실기기 미연결.
7. iPhone 홈 PWA: X — 실기기 미연결, HTTPS 시험 미배포.
8. 기존 기능 보호: O — 오디오/인증/데이터/내비 동작 무변경, 관련 길잡이 회귀 통과; 전 기능 실기기 검증 아님.
9. 자동 테스트 전체 통과: X — 42/45, 기존 main 동일 실패 3건; 새 다크 모의검사 별도 통과.
10. 운영 배포: X — 승인 대기, 배포하지 않음.
