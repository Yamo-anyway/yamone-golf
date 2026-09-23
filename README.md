# Yamone Golf v0.3.9 — Cloudflare 개발 9단계

신페리오 계산·재계산·결과/이력 화면을 연결한 개발판입니다. 기존 v0.2와 1~8단계, 9단계 준비(v0.3.8)를 보존합니다.

## 이번 단계에서 추가한 기능

- 종료 후 3시간 미만에 생성자와 종료 권한을 위임받은 참여자가 계산합니다. 최초 포함 최대 3개 결과이며 재계산해도 기한이 연장되지 않습니다.
- 18홀 완주자만 포함하고 미완료자를 제외할 때 명단과 확인 버튼을 표시합니다. 재계산은 새 추첨과 횟수 사용을 안내합니다.
- 계산 결과/공동 순위, 계산자/시각, 제외 선수, 최신 및 과거 이력, 계산 당시 전체 스코어카드를 제공합니다.
- 확인 중 점수·이름·선수·이력이 바뀌면 재확인합니다. 서버가 실제 쓰기 시 기기·권한·시간·원본 버전·횟수를 재검사합니다.
- 요청을 기기에 먼저 보관합니다. 응답 유실·앱 재실행 후 같은 요청으로 확인하며 중복 추첨/횟수 사용을 막습니다. 홈에서 결과 확인을 이어갑니다.
- 저장 결과는 원본 점수 수정에 따라 자동 변경하지 않습니다. 과거 결과를 열면 당시 Snapshot을 표시합니다.
- 참여자와 기록 수신자는 전체 이력을 열람합니다. 미참여 수신자에게 계산 권한을 부여하지 않습니다.

**이번 계산 방식은 18홀 PAR 72, 전·후반 각 PAR 합계 24인 숨김 6홀(총 12홀), 더블파 제한, 핸디캡 0~36입니다.** 맞는 숨김 홀 구성이 없는 코스와 9홀은 계산 불가 사유를 안내합니다. 기준은 화면의 ‘계산 기준 보기’ 및 docs/PEORIA.md에 명시했습니다. 숨김 홀 선정 정보는 서버 내부에만 보관합니다.

현재 DB는 `0001`~`0007`을 사용하며 v0.3.8 대비 새 마이그레이션은 없습니다. 실제 광고 SDK·배너, 이메일, 외부 배포는 아직 연결하지 않았습니다. 신페리오 계산 자체에는 전면 광고가 없습니다.

## 기존 버전과 구분

- 기존 v0.2.0 원본 ZIP을 `baseline/`에 그대로 보존했습니다. `SHA256SUMS`로 확인할 수 있습니다.
- 앱 개발판 식별자는 `com.yamone.golf.dev`입니다. 기존 `com.yamone.golf`와 함께 설치할 수 있습니다.
- 새 D1 사용자는 기존 Node/SQLite 서버 사용자와 별개입니다. 이전 서버 데이터를 자동 이전하지 않습니다.
- 원격 Git 저장소·Cloudflare 계정에 업로드하거나 운영 DB를 생성한 상태가 아닙니다.

## 로컬 실행

Node.js 24와 npm을 사용합니다. 저장소 루트에서:

```bash
npm ci
npm run db:local
npm run server
```

별도 터미널에서 웹 확인:

```bash
npm run export:web
npm run preview
```

브라우저로 `http://localhost:4173`에 접속합니다. preview 서버가 `/api`를 로컬 Worker의 8787 포트로 전달합니다. preview는 개발 검증용이며 운영 호스팅 서버가 아닙니다.

휴대폰 실행 시 `.env.example`을 `.env`로 복사하고 `EXPO_PUBLIC_API_URL`을 **개발 컴퓨터의 LAN 주소와 8787 포트**로 설정합니다. 휴대폰의 localhost는 컴퓨터가 아닙니다.

```bash
cp .env.example .env
npm start
```

필요하면 Worker를 `npm run dev --workspace yamone-golf-cloudflare -- --ip 0.0.0.0`으로 실행하고 같은 네트워크의 휴대폰에서 접근합니다. QR 스캔과 네트워크 상태 감지는 새 개발 빌드에서 실기기 검증이 필요합니다. Web/Android export만으로 APK·실기기 검증이 끝난 것은 아닙니다.

## 검증 명령

```bash
npm run typecheck
npm run lint
npm test
npm run export:web
npm run export:android
```

UI 검증은 웹 export 후 아래 명령으로 실행합니다. 테스트가 별도 포트의 Worker/D1과 preview 서버를 자동 실행하고 종료합니다. 각 UI 묶음마다 새 메모리 D1을 사용하여 개발 DB와 다른 묶음의 요청 제한/데이터를 변경하지 않습니다.

```bash
npx playwright install chromium
npm run test:ui
```

테스트에는 사용자·기기 복구, 라운드, 플레이어/입력 대상, 스코어, 오프라인 재실행·충돌·저장 실패·동시 탭 입력, 종료·권한·자동 종료, 기록 전달, 개인 통계와 본인 수정, 신페리오 계산/이력까지 포함됩니다.

특정 UI 검증만 실행하려면 `npm run test:ui -- tests/offline-ui.ts`를 사용합니다. 브라우저의 로컬 저장 잠금은 HTTPS 또는 localhost와 Web Locks 지원이 필요합니다.

설치된 Chromium을 사용할 때는 `PLAYWRIGHT_EXECUTABLE_PATH`로 실행 파일 경로를 지정할 수 있습니다.

## Cloudflare 연결

`yamone-golf-cloudflare/wrangler.jsonc`의 모든 0으로 된 DB ID는 로컬 개발용 자리표시자입니다. 배포 전 실제 개발·운영 D1 ID로 각각 교체해야 합니다. 구체적인 순서는 `docs/CLOUDFLARE.md`를 참고하세요.

Cron은 6시간 만료 라운드 종료와 요청 제한 데이터 정리를 수행하도록 연결했습니다. 실제 외부 스케줄은 배포 후에 활성화됩니다.
