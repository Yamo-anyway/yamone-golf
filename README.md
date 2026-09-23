# Yamone Golf v0.3.8 — Cloudflare 개발 9단계 준비

8단계 기능을 유지하면서 신페리오 이력의 서버 저장 구조와 읽기 API를 추가했습니다. **9단계 전체 완료본은 아닙니다.** 계산 시간·실행 권한을 확정한 뒤 계산 엔진과 앱 화면을 연결합니다.

## 이번 단계에서 추가한 기반

- 계산 시각·계산자·당시 이름·원본 버전·계산 방식 버전·점수 Snapshot·대상/제외 플레이어·결과/순위를 저장하는 D1 구조.
- 라운드별 1~3 정수 순번과 중복 순번 차단으로 최대 3개 이력 제한.
- 종료 라운드 참여자와 현재 개인 기록 수신자만 조회하는 신페리오 이력 API. 최신 결과부터 반환합니다.
- 받은 기록 상세의 `peoria_runs`를 실제 저장 이력에 연결. 개인 기록 삭제 후 비참여 수신자는 더 이상 조회할 수 없습니다.
- 숨김 홀과 내부 요청 정보는 조회 SQL에서 제외하고, Snapshot 내부도 공개 필드만 반환합니다.
- 본인 점수 수정·이름 변경 후에도 계산 당시 이력을 유지합니다.

**계산/재계산 쓰기 API, 앱의 신페리오 화면, 무작위 홀 선정은 아직 연결하지 않았습니다.** 조회 API는 `calculation.available=false`를 반환합니다. 테스트 이력은 격리된 테스트 DB에만 넣으며 앱에 예시 결과를 생성하지 않습니다.

`docs/PEORIA.md`에 다음 연결 설계와 두 가지 정책 제안을 정리했습니다. DB는 기존 `0001`~`0006` 뒤에 `0007_peoria_history.sql`을 적용합니다. 실제 광고 SDK·배너, 이메일, 외부 배포는 아직 연결하지 않았습니다.

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
