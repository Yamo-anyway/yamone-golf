# Yamone Golf v0.3.0 — Cloudflare 개발 1단계

닉네임으로 시작하고 같은 기기에서 다시 실행하는 첫 흐름을 앱과 새 Worker/D1 API까지 연결한 개발판입니다. 라운드·스코어 기능은 다음 단계에서 연결합니다.

## 포함 범위

- 이메일 로그인 없이 닉네임 시작, 중복 닉네임 허용, 서버 UUID 사용자 생성.
- 개인 코드·QR, 닉네임 변경, 한국어/영어 및 기기 언어 기본값.
- native SecureStore 인증 보관, 웹 HttpOnly 쿠키, 재실행 시 기존 사용자 조회.
- 복구 키 발급·복구, 키 사용 후 교체, 복구 성공 시 기존 기기 인증 폐기.
- 사용자 생성/복구 응답이 유실돼도 같은 요청을 재시도해 중복 계정을 만들지 않는 처리.
- Worker/D1 마이그레이션, 개발/운영 설정 분리, health API, 요청 빈도 제한.
- 최신 전면·배너 광고 정책 함수와 테스트. **실제 광고 SDK와 배너 렌더러는 아직 없습니다.**

이메일·Resend는 마지막 단계입니다. 단계별 구현 상태와 정책은 `docs/DEVELOPMENT.md`, `docs/POLICY.md`에 있습니다.

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

필요하면 Worker를 `npm run dev --workspace yamone-golf-cloudflare -- --ip 0.0.0.0`으로 실행하고 같은 네트워크의 휴대폰에서 접근합니다. 실제 설치 빌드는 다음 단계의 실기기 검증에 포함합니다.

## 검증 명령

```bash
npm run typecheck
npm run lint
npm test
npm run export:web
npm run export:android
npm run deploy:check --workspace yamone-golf-cloudflare
```

UI 검증은 웹 export 후 아래 명령으로 실행합니다. 테스트가 별도 포트의 Worker/D1과 preview 서버를 자동 실행하고 종료합니다. 테스트 DB는 메모리에 격리되어 개발 DB를 변경하지 않습니다.

```bash
npx playwright install chromium
npm run test:ui
```

설치된 Chromium을 사용할 때는 `PLAYWRIGHT_EXECUTABLE_PATH`로 실행 파일 경로를 지정할 수 있습니다.

## Cloudflare 연결

`yamone-golf-cloudflare/wrangler.jsonc`의 모든 0으로 된 DB ID는 로컬 개발용 자리표시자입니다. 배포 전 실제 개발·운영 D1 ID로 각각 교체해야 합니다. 구체적인 순서는 `docs/CLOUDFLARE.md`를 참고하세요.

현재 Cron은 만료된 요청 제한 데이터만 정리합니다. 6시간 라운드 자동 종료는 라운드 테이블과 함께 후속 단계에서 구현합니다.
