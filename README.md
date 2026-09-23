# Yamone Golf v0.3.6 — Cloudflare 개발 7단계

종료 후 플레이어 연결과 기록 보내기·받기·개인 기록 삭제를 추가한 개발판입니다. 기존 v0.2와 1~6단계 소스/태그를 보존합니다.

## 이번 단계에서 추가한 기능

- 기존 참여자는 종료 후에도 개인 코드·QR로 Player Slot을 연결/해제하고 미등록 이름을 수정합니다. 연결만으로 진행 중 라운드의 참여자를 추가하지 않습니다.
- 전송 대기/수신 완료/취소를 별도 DELIVERY 이력으로 관리합니다. 보낸 사람·생성자·받는 사람은 아직 받지 않은 전송을 취소할 수 있습니다.
- 홈의 골프 기록 → 받을 기록/받은 기록 → 라운드 전체 열람을 연결했습니다. 수신자는 자신의 점수뿐 아니라 전체 플레이어, 코스/PAR, 홀별 점수, 순위를 봅니다.
- 생성자·참여자는 기존 라운드 광고 이력을 사용합니다. 미참여 플레이어는 최초 수신 전 광고를 처리하고, 장애도 처리 완료로 인정합니다. 광고 화면에서 앱 종료만 한 것은 수신하지 않습니다.
- 광고 중 전송 취소/사용자 연결 변경을 서버 실행 시 다시 검사합니다. 광고 처리는 보존하지만 수신 권한이 없으면 등록하지 않습니다.
- 수신 요청·광고 결과를 먼저 기기에 보관하고, 앱 재실행·응답 유실·저장 실패 후 같은 요청으로 결과를 확인합니다.
- 개인 기록 삭제는 RECEIPT만 deleted로 표시합니다. 라운드 원본/다른 사용자의 기록은 그대로이고 과거 전송은 다시 나타나지 않습니다. 새로운 보내기가 있어야 다시 받을 수 있습니다.
- 연결 해제는 대기 전송을 취소하고 점수/슬롯/기존 수신 기록을 보존합니다. 원래 수신자의 기록을 새 연결 사용자에게 넘기지 않습니다.

1~6단계 기능을 모두 포함합니다. **실제 광고 SDK·배너, Cloudflare 외부 배포, 이메일은 아직 연결하지 않았습니다.** 현재 광고 화면은 개발 테스트 어댑터입니다. 신페리오 계산/이력은 9단계, 개인 통계와 종료+24시간 본인 수정은 다음 8단계입니다.

`docs/RECORDS.md`에 상태·권한·광고·재시도 규칙을 정리했습니다. DB에는 `0006_record_delivery.sql`을 적용합니다. 기존 생성/참여 광고 이력은 유지합니다.

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

테스트에는 사용자·기기 복구, 라운드, 플레이어/입력 대상, 스코어, 오프라인 재실행·충돌·저장 실패·동시 탭 입력, 종료·권한·자동 종료와 기록 전달까지 포함됩니다.

특정 UI 검증만 실행하려면 `npm run test:ui -- tests/offline-ui.ts`를 사용합니다. 브라우저의 로컬 저장 잠금은 HTTPS 또는 localhost와 Web Locks 지원이 필요합니다.

설치된 Chromium을 사용할 때는 `PLAYWRIGHT_EXECUTABLE_PATH`로 실행 파일 경로를 지정할 수 있습니다.

## Cloudflare 연결

`yamone-golf-cloudflare/wrangler.jsonc`의 모든 0으로 된 DB ID는 로컬 개발용 자리표시자입니다. 배포 전 실제 개발·운영 D1 ID로 각각 교체해야 합니다. 구체적인 순서는 `docs/CLOUDFLARE.md`를 참고하세요.

Cron은 6시간 만료 라운드 종료와 요청 제한 데이터 정리를 수행하도록 연결했습니다. 실제 외부 스케줄은 배포 후에 활성화됩니다.
