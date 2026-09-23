# Cloudflare 연결 안내

이번 소스는 로컬 Worker와 D1에서 동작하도록 구성했습니다. 실제 계정/리소스 연결은 아직 수행하지 않았습니다. 개발 DB와 운영 DB는 분리합니다.

v0.3.4는 4단계의 `0004_score_mutations.sql`까지 그대로 사용합니다. 새 D1 마이그레이션은 없습니다. 기존 1~3단계 개발 DB에는 `npm run db:local`로 추가 마이그레이션을 적용합니다. 운영 광고가 아직 없으므로 현재 버전은 운영 출시 대상이 아닙니다.

## 개발 서버 만들기

저장소 루트에서 `cd yamone-golf-cloudflare` 후:

```bash
npx wrangler login
npx wrangler d1 create yamone-golf-dev
```

출력된 실제 `database_id`를 `wrangler.jsonc`의 최상위 `d1_databases`에 넣습니다. 그다음:

```bash
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

반환된 Worker HTTPS URL 뒤에 `/health`를 붙여 확인합니다. 앱의 `.env`에서 `EXPO_PUBLIC_API_URL`을 해당 URL로 설정하고 앱 번들을 다시 만듭니다.

## 운영 분리

운영 배포 단계에서만 `yamone-golf` D1을 생성하고 `env.production.d1_databases`의 ID를 설정합니다. 개발 ID를 운영 항목에 복사하지 않습니다.

```bash
npx wrangler d1 create yamone-golf
npx wrangler d1 migrations apply DB --remote --env production
npx wrangler deploy --env production
```

현재 Cron은 요청 제한 버킷 정리만 수행합니다. 6시간 라운드 종료는 6단계에서 스케줄러와 함께 구현합니다.

## 앱/웹 인증

- native: 32바이트 난수 기기 비밀값을 요청 전에 SecureStore에 보관하고 Bearer로 보냅니다. 서버에는 SHA-256 해시만 저장합니다.
- web: 초기 연결 중에만 임시 비밀값을 탭에 보관하고, 성공 후에는 HttpOnly/SameSite 쿠키로 인증합니다. 운영 웹은 API와 동일 출처로 제공하는 구성을 기본으로 합니다.
- 다른 출처의 개발 웹을 연결한다면 해당 Origin을 `ALLOWED_ORIGINS`에 명시합니다. 와일드카드는 사용하지 않습니다. 같은 사이트가 아닌 도메인 간 웹 쿠키 사용은 별도 설계가 필요합니다.
- 개인 코드/QR/user_id는 인증 수단이 아닙니다.
- 복구 키는 암호학적 난수로 앱에서 생성하고 요청 전에 보관합니다. 서버에는 해시만 저장합니다. 생성 응답 유실 시에도 키를 잃지 않기 위한 방식입니다.
- D1 batch로 사용자·기기 생성 및 복구 교체를 원자적으로 처리합니다. 활성 기기 1대 제약은 DB에도 적용합니다.
- 수정 SQL은 실행 시점에도 기기가 활성 상태인지 확인합니다.

## 참고한 공식 자료

- [D1 batch와 트랜잭션](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 로컬 개발](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [D1 마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/)
- [Expo SDK 57 SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
- [Expo SDK 57 Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/)
- [Expo SDK 57 Localization](https://docs.expo.dev/versions/v57.0.0/sdk/localization/)
- [Expo SDK 57 Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/)

공용 골프장 순서와 개인 즐겨찾기는 분리되어 있습니다. 공용 courses에는 favorite 속성이 없고, user_courses의 관계와 sort_order만 바뀝니다. 라운드 골프장 데이터는 생성 준비 시 별도 복사본을 저장합니다.

3단계는 player_slots의 버전/삭제 표시, round의 roster_version, input_target_lists/input_targets, player_mutations/player_audit를 추가합니다. 기존 슬롯은 version=1, 삭제되지 않은 상태로 유지됩니다. 개인 목록의 초기 기본값은 전체 플레이어이며 명시적 선택을 저장한 뒤에는 저장한 선택을 사용합니다.

4단계는 `score_mutations`(요청 중복 실행 방지), `score_audit`(점수 변경 이력), scores의 라운드/홀 인덱스를 추가합니다. 0003의 scores 구조를 그대로 사용하며 기존 점수는 변경하지 않습니다. 점수 삭제 후 null 행을 보존하여 이전 점수 버전이 다시 사용되지 않게 합니다. 신뢰한 웹 Origin에는 PUT 사전 요청도 허용합니다.

5단계는 점수 요청의 원래 user_id를 인증 사용자와 대조합니다. 오프라인 대기열은 기기에 있으며 서버에 초안 테이블을 만들지 않습니다. 배포 전 개발·운영 환경 검증과 실제 기기 인증/네트워크 복귀 검증은 여전히 별도입니다.
