# Yamone Golf v0.3.7 — Cloudflare 개발 8단계

개인 기록 검색·18홀 통계·종료 후 본인 점수 수정을 추가한 개발판입니다. 기존 v0.2와 1~7단계 소스/태그를 보존합니다.

## 이번 단계에서 추가한 기능

- 받은 기록에서 골프장명 검색, 전체/통계 대상/미완료/9홀 필터, 본인 점수와 입력 홀 수를 확인합니다.
- 통계는 본인 플레이어 연결·수신 완료·18홀 전체 입력 조건을 모두 만족한 기록만 사용합니다. 다른 선수의 미완료 여부는 영향을 주지 않습니다. 9홀과 신페리오는 제외합니다.
- 평균·최저·최고 타수, PAR 대비 평균, 홀별 스코어 분포, PAR별 평균, 최근 통계 대상 10라운드를 표시합니다.
- 받은 플레이어 본인만 현재 연결된 자신의 점수를 **라운드 종료 시각부터 24시간** 안에 수정합니다. 생성자·기록자·종료 권한만으로 다른 선수의 점수를 수정할 수 없습니다.
- 서버가 실제 쓰기 때 활성 기기·수신 상태·플레이어 연결/버전·기한·점수 버전을 검사합니다. 종료 시각은 수정하거나 다시 받아도 연장되지 않습니다.
- 초안과 결과 미확정 요청을 사용자별로 기기에 보관합니다. 앱 재실행, 응답 유실, 저장 실패 후 같은 요청으로 확인하며 충돌은 최신 값으로 다시 확인합니다.
- 저장한 점수는 공동 라운드 원본에 반영됩니다. 삭제/null은 미입력이며 18홀 완료 여부에 따라 통계 대상도 바뀝니다. 기존 종료 당시 완료 Snapshot은 보존합니다.
- 홈에서 수정 중인 기록으로 다시 들어갈 수 있습니다. 기한 만료/연결 변경으로 거절돼도 입력값을 임의로 삭제하지 않습니다.

1~7단계 기능을 모두 포함합니다. **실제 광고 SDK·배너, Cloudflare 외부 배포, 이메일은 아직 연결하지 않았습니다.** 이번 수정에는 광고가 없습니다. 신페리오 계산/이력은 다음 9단계입니다.

`docs/PERSONAL_RECORDS.md`에 통계·권한·시간·초안 보관 규칙을 정리했습니다. DB는 기존 `0001`~`0006` 구조를 사용하며 이번 단계의 추가 마이그레이션은 없습니다.

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

테스트에는 사용자·기기 복구, 라운드, 플레이어/입력 대상, 스코어, 오프라인 재실행·충돌·저장 실패·동시 탭 입력, 종료·권한·자동 종료, 기록 전달, 개인 통계와 본인 수정까지 포함됩니다.

특정 UI 검증만 실행하려면 `npm run test:ui -- tests/offline-ui.ts`를 사용합니다. 브라우저의 로컬 저장 잠금은 HTTPS 또는 localhost와 Web Locks 지원이 필요합니다.

설치된 Chromium을 사용할 때는 `PLAYWRIGHT_EXECUTABLE_PATH`로 실행 파일 경로를 지정할 수 있습니다.

## Cloudflare 연결

`yamone-golf-cloudflare/wrangler.jsonc`의 모든 0으로 된 DB ID는 로컬 개발용 자리표시자입니다. 배포 전 실제 개발·운영 D1 ID로 각각 교체해야 합니다. 구체적인 순서는 `docs/CLOUDFLARE.md`를 참고하세요.

Cron은 6시간 만료 라운드 종료와 요청 제한 데이터 정리를 수행하도록 연결했습니다. 실제 외부 스케줄은 배포 후에 활성화됩니다.
