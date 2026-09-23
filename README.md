# Yamone Golf v0.3.1 — Cloudflare 개발 2단계

닉네임 시작·기기 인증에 이어 골프장 관리와 라운드 생성·참여·초대를 연결한 개발판입니다. 기존 v0.2와 1단계 결과를 보존합니다.

## 이번 단계에서 이용할 수 있는 기능

- 공용 골프장 검색·등록·수정: 9홀 단위 코스, 홀별 PAR 3~7, 수정 충돌 확인.
- 내 골프장 추가·제거, 손잡이 드래그 및 위/아래 정렬, 사용자별 순서 저장.
- 9홀/18홀 라운드 준비, 동일 9홀 두 번 선택, 실제 플레이어 1~8명, 생성자의 플레이 여부 선택.
- 라운드 코드로 조회·참여, 개인 코드로 초대, 홈에서 초대 확인·취소·참여.
- 사용자당 진행 중 라운드 1개를 서버 트랜잭션으로 보장. 초대만 받으면 제한 없음.
- 라운드 생성 당시 골프장/코스/PAR 복사본 보존, 참여 사용자와 실제 플레이어 분리.
- 광고 준비·처리·기능 실행을 분리하고 요청 ID와 보류 내용을 보관. 처리 응답 유실 시 재실행 가능.
- 1단계 사용자 생성·복구 키·활성 기기 1대·개인 코드/QR·한국어/영어 유지.

**현재 광고 화면은 명시적인 개발 테스트입니다. 실제 광고 SDK·배너는 아직 없습니다.** 운영 환경은 테스트 광고 완료 등록을 거절합니다. 이메일·Resend는 마지막에 연결합니다.

플레이어 관리·스코어 입력·종료·자동 종료·기록 받기는 후속 단계입니다. 현재 생성한 개발 라운드는 화면에서 종료할 수 없으므로 실제 골프 기록용 완성판으로 사용하지 않습니다. 기능별 순서는 `docs/DEVELOPMENT.md`, 확정 정책은 `docs/POLICY.md`를 참고하세요.

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
```

UI 검증은 웹 export 후 아래 명령으로 실행합니다. 테스트가 별도 포트의 Worker/D1과 preview 서버를 자동 실행하고 종료합니다. 테스트 DB는 메모리에 격리되어 개발 DB를 변경하지 않습니다.

```bash
npx playwright install chromium
npm run test:ui
```

테스트에는 사용자·기기 복구와 세 명이 함께 사용하는 라운드 흐름이 포함됩니다.

설치된 Chromium을 사용할 때는 `PLAYWRIGHT_EXECUTABLE_PATH`로 실행 파일 경로를 지정할 수 있습니다.

## Cloudflare 연결

`yamone-golf-cloudflare/wrangler.jsonc`의 모든 0으로 된 DB ID는 로컬 개발용 자리표시자입니다. 배포 전 실제 개발·운영 D1 ID로 각각 교체해야 합니다. 구체적인 순서는 `docs/CLOUDFLARE.md`를 참고하세요.

현재 Cron은 만료된 요청 제한 데이터만 정리합니다. 6시간 라운드 자동 종료는 6단계에서 구현합니다.
