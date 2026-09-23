# Yamone Golf v0.3.2 — Cloudflare 개발 3단계

플레이어 연결·해제·이름 수정·삭제 보호와 개인별 입력 대상 관리를 추가한 개발판입니다. 기존 v0.2, 1·2단계 소스와 태그를 보존합니다.

## 이번 단계에서 추가한 기능

- 진행 중 라운드의 참여자는 실제 플레이어를 추가하고 미등록 이름을 수정할 수 있습니다. 최대 8명이며 마지막 한 명은 삭제할 수 없습니다.
- 개인 코드/개인 QR로 사용자를 확인한 뒤 슬롯에 연결합니다. 같은 닉네임은 개인 코드와 user_id로 구분합니다. 연결은 기록 참여자 등록·광고 처리와 별개입니다.
- 연결 해제 시 임시 이름을 설정하며 슬롯 ID·기존 스코어·개인 입력 대상 연결을 유지합니다. 연결된 슬롯에는 해당 사용자의 현재 닉네임이 표시됩니다.
- 삭제 전 사용자 연결, 저장된 스코어, 보내기/받기 관계, 개인 입력 목록 영향을 보여 줍니다. 기록이 있는 슬롯은 삭제를 막습니다. 안전한 삭제도 서버 이력은 보존합니다.
- 내 입력 대상은 선택/미선택으로 나눕니다. 드래그와 위/아래 버튼으로 정렬하고 개인별로 저장합니다. 선택을 비워 관람만 할 수도 있습니다.
- 동시 수정 충돌 시 초안을 남깁니다. 응답 유실 시 같은 요청 ID를 재사용해 슬롯 추가·수정을 중복 처리하지 않습니다.
- Android/iOS 개인 QR 스캔 화면과 카메라 권한 처리. 웹은 개인 코드 또는 QR 텍스트 입력을 지원합니다. 카메라 프레임을 서버로 보내거나 사진/영상을 저장하지 않습니다.
- 한국어/영어 화면 및 iOS 카메라 권한 문구를 분리했습니다.

1·2단계 사용자 인증/복구, 골프장 관리, 라운드 생성/초대/참여도 포함합니다. **광고는 개발 테스트이며 실제 광고 SDK·배너는 아직 없습니다.** 이메일·Resend는 마지막에 연결합니다.

스코어 입력·종료·자동 종료·기록 받기는 후속 단계입니다. 삭제 보호를 위해 scores/deliveries/receipts의 참조 테이블만 먼저 두었으며 점수나 기록 전송 기능을 구현한 상태는 아닙니다. 현재 생성한 개발 라운드를 종료하는 UI는 아직 없습니다. 순서는 `docs/DEVELOPMENT.md`, 기준은 `docs/POLICY.md`를 참고하세요.

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

필요하면 Worker를 `npm run dev --workspace yamone-golf-cloudflare -- --ip 0.0.0.0`으로 실행하고 같은 네트워크의 휴대폰에서 접근합니다. QR 스캔은 새 개발 빌드에서 실기기 검증이 필요합니다. Web/Android export만으로 APK·실기기 검증이 끝난 것은 아닙니다.

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

테스트에는 사용자·기기 복구, 세 사용자의 라운드 참여, 플레이어 연결/충돌/삭제 보호, 개인 입력 대상 흐름이 포함됩니다.

설치된 Chromium을 사용할 때는 `PLAYWRIGHT_EXECUTABLE_PATH`로 실행 파일 경로를 지정할 수 있습니다.

## Cloudflare 연결

`yamone-golf-cloudflare/wrangler.jsonc`의 모든 0으로 된 DB ID는 로컬 개발용 자리표시자입니다. 배포 전 실제 개발·운영 D1 ID로 각각 교체해야 합니다. 구체적인 순서는 `docs/CLOUDFLARE.md`를 참고하세요.

현재 Cron은 만료된 요청 제한 데이터만 정리합니다. 6시간 라운드 자동 종료는 6단계에서 구현합니다.
