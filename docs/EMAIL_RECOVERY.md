# 이메일 기기 이전·복구 — v0.3.11

이메일은 일반 로그인이나 회원가입 식별자가 아닙니다. 활성 기기의 `내 정보`에서 선택적으로 인증한 주소만 앱 삭제·기기 분실 후 같은 `user_id`를 복구하는 데 사용합니다. 닉네임 중복, 개인 코드, 복구 키와 이메일의 역할은 서로 다릅니다.

## 사용자 흐름

1. 현재 활성 기기에서 이메일 주소를 입력하고 15분짜리 코드를 받습니다.
2. 코드 또는 앱 링크를 현재 기기에서 확인하면 복구 이메일이 등록됩니다.
3. 새 기기에서 같은 이메일로 복구 코드를 요청합니다. 응답은 주소 등록 여부와 관계없이 `accepted`입니다.
4. 코드를 확인하기 전에 새 기기 비밀값과 다음 복구 키를 SecureStore에 저장합니다.
5. 성공 시 서버가 기존 활성 기기를 폐기하고 새 기기만 활성화하며 복구 키를 교체합니다. 응답 유실 시 같은 요청 ID·기기 비밀값으로 재확인합니다.

## 서버 보안 기준

- 이메일은 소문자로 정규화하고 유일한 복구 주소로 관리합니다. 한 주소를 여러 `user_id`에 연결할 수 없습니다.
- 12자리 코드는 `EMAIL_TOKEN_SECRET`의 HMAC으로 결정적으로 만들고 D1에는 SHA-256 해시만 저장합니다. 같은 요청의 Resend 재시도는 같은 본문과 `Idempotency-Key`를 사용합니다.
- 코드 유효기간은 15분입니다. 인증·복구 요청과 코드 확인은 IP/사용자 단위 제한을 적용합니다.
- 알 수 없는 이메일도 동일한 공개 응답을 반환하며 usable code나 user_id를 만들지 않습니다.
- 코드 확인과 기기 폐기·새 기기 활성화·복구 키 교체·요청 소비는 하나의 D1 batch로 처리합니다. 실패하면 기존 기기를 유지합니다.
- `RESEND_API_KEY`와 `EMAIL_TOKEN_SECRET`은 Wrangler secret으로만 주입합니다. Git, `wrangler.jsonc`, 앱 번들, D1에 저장하지 않습니다.
- 개발 mock 코드는 `production` 응답에 절대 포함하지 않습니다.

## 환경 설정

공개 설정은 `wrangler.jsonc`에 있습니다.

- `EMAIL_MODE=resend`
- `EMAIL_FROM=Yamone Golf <noreply@golf.yamone.net>`
- `EMAIL_APP_LINK=yamone-golf:///email-recovery`

운영 secret은 배포 계정에서 별도로 설정합니다.

```bash
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler secret put EMAIL_TOKEN_SECRET --env production
```

`EMAIL_TOKEN_SECRET`은 최소 32바이트의 독립 난수여야 하며 Resend API 키와 재사용하지 않습니다. 로컬 테스트는 Miniflare binding의 mock 제공자만 사용하고 실제 메일을 발송하지 않습니다.

## 운영 검증 — 2026-09-29

- 운영 D1에 `0001`~`0008` 마이그레이션을 적용하고 production Worker 및 10분 Cron을 배포했습니다.
- Wrangler secret으로 두 비밀값을 등록했으며 값은 Git·문서·명령 출력에 남기지 않았습니다.
- 실제 Resend 인증 메일과 복구 메일을 수신하고 코드를 확인했습니다.
- 서버 API에서 동일 `user_id`로 새 기기가 활성화되고 기존 기기는 `device_moved` 401, 새 기기는 200이 되는 것을 확인했습니다.
- 운영 검증용 사용자와 연결된 인증·복구·기기 행은 검증 후 삭제했고 잔여 사용자 수 0을 확인했습니다.

## 아직 완료로 보지 않는 항목

Android 메일 앱의 링크로 앱에 복귀, 앱 강제 종료·재실행, 실제 두 Android 기기 이전은 설치 APK에서 별도 QA가 필요합니다. 서버 API 검증은 네이티브 생명주기 증거를 대체하지 않습니다.
