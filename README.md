# Yamone Golf v0.3.5 — Cloudflare 개발 6단계

라운드 종료, 종료 권한 위임, 서버 6시간 자동 종료를 추가한 개발판입니다. 기존 v0.2와 1~5단계 소스/태그를 보존합니다.

## 이번 단계에서 추가한 기능

- 생성자 또는 위임받은 참여자가 라운드를 종료합니다. 생성자는 참여자별 종료 권한을 주거나 회수합니다.
- 종료 전에 **모든 홀**의 기기 초안·전송 대기·충돌을 확인합니다. 초안 저장/버리기/계속 입력을 제공하며, 결과가 불명확한 전송 요청은 버리지 않습니다.
- 종료 확인 중 다른 사람이 점수·플레이어·참여자를 바꾸면 서버가 재확인을 요청합니다. 종료 요청도 먼저 기기에 보관하여 앱 종료·응답 유실 후 같은 요청으로 이어갑니다.
- 서버가 마지막 공동 기록 변경 +6시간에 자동 종료합니다. Cron은 10분마다 실행하고, 그 전에 들어온 요청도 만료 여부를 검사하여 늦은 쓰기로 기한을 연장할 수 없게 합니다.
- 종료와 함께 모든 참여자의 진행 중 라운드 제한을 풀고 남은 초대를 취소합니다. 점수와 플레이어는 보존하고 각 플레이어의 9/18홀 완료 여부를 별도로 기록합니다.
- 홈의 최근 종료 라운드에서 종료 상태와 스코어카드를 열 수 있습니다. 개인 기록 수신은 다음 단계입니다.
- 이 라운드에 이미 광고 처리를 마친 참여자는 종료 광고를 추가로 보지 않습니다. 실제 광고 SDK·배너 연결은 후속 단계입니다.

1~5단계의 닉네임 시작/복구 키, 골프장, 생성·초대·참여, 플레이어/입력 대상, 점수 충돌·스코어카드·오프라인 복구도 포함합니다. 이메일·Resend는 마지막에 연결합니다.

종료 후 늦게 도착한 오프라인 점수는 원래 값을 보존하고 보류합니다. 수용 정책은 미확정입니다. 종료+24시간 수신자 본인 수정은 8단계입니다. 자세한 처리 규칙은 `docs/ENDING.md`, 순서는 `docs/DEVELOPMENT.md`, 확정 기준은 `docs/POLICY.md`를 참고하세요.

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

UI 검증은 웹 export 후 아래 명령으로 실행합니다. 테스트가 별도 포트의 Worker/D1과 preview 서버를 자동 실행하고 종료합니다. 테스트 DB는 메모리에 격리되어 개발 DB를 변경하지 않습니다.

```bash
npx playwright install chromium
npm run test:ui
```

테스트에는 사용자·기기 복구, 라운드, 플레이어/입력 대상, 스코어, 오프라인 재실행·충돌·저장 실패·동시 탭 입력, 종료·권한·자동 종료까지 포함됩니다.

특정 UI 검증만 실행하려면 `npm run test:ui -- tests/offline-ui.ts`를 사용합니다. 브라우저의 로컬 저장 잠금은 HTTPS 또는 localhost와 Web Locks 지원이 필요합니다.

설치된 Chromium을 사용할 때는 `PLAYWRIGHT_EXECUTABLE_PATH`로 실행 파일 경로를 지정할 수 있습니다.

## Cloudflare 연결

`yamone-golf-cloudflare/wrangler.jsonc`의 모든 0으로 된 DB ID는 로컬 개발용 자리표시자입니다. 배포 전 실제 개발·운영 D1 ID로 각각 교체해야 합니다. 구체적인 순서는 `docs/CLOUDFLARE.md`를 참고하세요.

Cron은 6시간 만료 라운드 종료와 요청 제한 데이터 정리를 수행하도록 연결했습니다. 실제 외부 스케줄은 배포 후에 활성화됩니다.
