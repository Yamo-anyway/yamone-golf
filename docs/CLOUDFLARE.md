# Cloudflare 운영 점검 안내

2026-10-27: 현재 환경의 Wrangler는 미인증이다. 이 통합본의 운영 DB 대조·마이그레이션·배포는 아직 수행하지 않았다. 운영 health의 0.3.22는 2026-10-26 확인 기록이며 코드 전체의 일치나 DB 구조 검증을 뜻하지 않는다.

운영 Worker `yamone-golf-api`와 D1 `yamone-golf`는 이미 존재한다. 새 운영 DB를 만들거나 개발 DB ID로 대체하지 않는다. 신규 로컬 DB는 0001~0012를 사용한다. 기존 운영에는 수동 반영된 필드가 있을 수 있어 전체 마이그레이션 일괄 적용 명령을 사용하지 않는다. 특히 0010의 중복 ALTER와 운영 골프장 초기화를 피해야 한다.

## 1. 인증과 읽기 전용 대조

저장소 루트에서, 현재 작업 환경에 Cloudflare 인증을 연결한 다음 실행한다. 인증 정보는 채팅·Git·문서에 붙여 넣지 않는다.

```bash
npm run db:preflight -- --remote --out .tmp/operations/production-20261027.json
```

이 명령은 DB 메타데이터·적용 이력·국가 설정·수집 상태만 읽는다. 생성·적용·배포·복원 기능은 없다. 이미 존재하지만 이력에 없는 구조, 제약·인덱스의 차이와 알 수 없는 이력을 검토 항목으로 남긴다. 출력이 일치해도 데이터 값·과거 SQL 체크섬의 일치를 증명하지 않는다. 재실행은 새 보고서 파일명을 쓴다. 상세와 종료 코드는 [5단계 기록](STEP5_OPERATIONS_20261027.md)에 있다.

이후 아래 명령은 **Worker 디렉터리**에서 수행한다.

```bash
cd yamone-golf-cloudflare
npx wrangler whoami
npx wrangler secret list --env production --format json
```

운영 설정에서 ENVIRONMENT=production, EMAIL_MODE=resend, 발신자 `noreply@golf.yamone.net`, 앱 링크 `yamone-golf:///email-recovery`, 10분 Cron과 기존 DB 바인딩을 대조한다. secret 목록에는 `RESEND_API_KEY`, `EMAIL_TOKEN_SECRET`, `COURSE_ADMIN_TOKEN`의 **이름**이 있어야 한다. 이름 존재만으로 값·도메인 인증·실제 발송이 정상이라는 뜻은 아니다. 기존 secret을 임의로 교체하지 않는다. 운영 mock 발송은 차단된다.

## 2. 변경 전 복구 지점과 export

아래는 기존 운영 DB를 읽는 명령이다. 변경 이력·소스 커밋·UTC 시각과 bookmark를 함께 보관하고, 이미 있는 백업 파일은 새 이름으로 구분한다.

```bash
npx wrangler d1 time-travel info DB --env production --json
npx wrangler d1 export DB --remote --env production --output ../.tmp/operations/prechange-20261027.sql
```

SQL export에는 사용자·복구 관련 비공개 데이터가 포함될 수 있으므로 비공개 위치에서 접근을 제한하고 Git이나 PR에 첨부하지 않는다. export 성공만으로 복원 검증이 끝나지 않는다. 별도 빈 로컬/검증 DB에 복원한 뒤 무결성·주요 행·제약·수집 위치·이력을 대조한다. 이번 단계에서는 격리 로컬 D1의 실제 export/import를 검증했다.

D1 Time Travel은 기본 제공되며 보관 기간은 요금제에 따라 Free 7일/Paid 30일이다. 현재 계정의 요금제·복구 가능 범위·bookmark를 확인해야 한다. 공식 자료: [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [SQL export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

운영 Time Travel restore는 현재 DB를 과거 시점으로 교체한다. 새 데이터 유실 구간과 인증 세션 영향, 복구 대상 bookmark, 현재 시점의 추가 export를 검토한 후에만 별도 실행한다. 단순 서버 코드 롤백과 DB 복원은 다르다. 이 단계에서 운영 restore를 실행하지 않는다.

## 3. 차이 검토 후 반영

사전 점검에서 확인한 실제 누락분만 변경안으로 만든다. 수동 적용과 이력 불일치를 확인하지 않은 채 0010을 재실행하거나, 실행하지 않은 파일을 이력에 추가하지 않는다. 변경 전후 스키마·이력·주요 행 수와 외래키를 대조한다. 통합 Worker 배포는 호환되는 DB와 운영 설정이 확인된 뒤 기존 production 환경에 진행한다. 구체적인 변경 SQL은 운영 조회가 끝난 뒤 확정한다.

## 4. 가동·오류 확인

- 공개 `/health`는 기본 D1 연결만 확인한다. 스키마 전체·이메일 발송·Cron 성공을 뜻하지 않는다.
- Workers 로그에서 Cron 실행 시각과 오류를 확인한다. 이 Worker는 요청 오류의 종류와 GolfCore 수집 오류 코드만 기록하며 토큰/복구 코드/메일 본문을 추가로 출력하지 않는다.
- 6시간 만료 라운드 잔여 수, 중복 활성 기기 수, 이메일 요청 상태별 집계, 국가별 수집 상태·마지막 성공·위치를 운영 D1에서 확인한다. 문제를 조사할 때도 비공개 주소·코드 전체를 문서에 복사하지 않는다.
- 운영 관리자 데이터 점검과 실제 앱 검색, 검토 데이터와 원문 수집의 분리를 확인한다. 실제 메일 발송·새 테스트 사용자 생성은 별도 검증 범위를 확정해 진행한다.

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
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [D1 로컬 개발](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [D1 마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/)
- [Expo SDK 57 SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
- [Expo SDK 57 Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/)
- [Expo SDK 57 Localization](https://docs.expo.dev/versions/v57.0.0/sdk/localization/)
- [Expo SDK 57 Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/)
- [GolfCore 공식 OpenAPI](https://www.golfcore.org/openapi.json)
- [GolfCore API 이용 조건](https://www.golfcore.org/terms/)

공용 골프장 순서와 개인 즐겨찾기는 분리되어 있습니다. 공용 courses에는 favorite 속성이 없고, user_courses의 관계와 sort_order만 바뀝니다. 라운드 골프장 데이터는 생성 준비 시 별도 복사본을 저장합니다.

3단계는 player_slots의 버전/삭제 표시, round의 roster_version, input_target_lists/input_targets, player_mutations/player_audit를 추가합니다. 기존 슬롯은 version=1, 삭제되지 않은 상태로 유지됩니다. 개인 목록의 초기 기본값은 전체 플레이어이며 명시적 선택을 저장한 뒤에는 저장한 선택을 사용합니다.

4단계는 `score_mutations`(요청 중복 실행 방지), `score_audit`(점수 변경 이력), scores의 라운드/홀 인덱스를 추가합니다. 0003의 scores 구조를 그대로 사용하며 기존 점수는 변경하지 않습니다. 점수 삭제 후 null 행을 보존하여 이전 점수 버전이 다시 사용되지 않게 합니다. 신뢰한 웹 Origin에는 PUT 사전 요청도 허용합니다.

5단계는 점수 요청의 원래 user_id를 인증 사용자와 대조합니다. 오프라인 대기열은 기기에 있으며 서버에 초안 테이블을 만들지 않습니다. 배포 전 개발·운영 환경 검증과 실제 기기 인증/네트워크 복귀 검증은 여전히 별도입니다.

7단계는 record_mutations/receipt_actions, 대기 전송 및 활성 개인 기록의 유일성, 목록 인덱스를 추가합니다. round_ad_settlements를 확장해 기존 생성/참여 action_id와 새 receive_action_id 중 하나를 참조합니다. 마이그레이션은 기존 광고 이력을 그대로 복사하며 로컬 업그레이드 테스트에서 데이터와 외래키를 확인했습니다.

8단계 통계는 현재 원본 점수에서 서버가 집계합니다. 수정은 기존 score_mutations/score_audit를 재사용하고 종료 시각·광고 이력·종료 Snapshot은 변경하지 않습니다. 기존 DB에 새 파괴적 변경은 없습니다.

## 9단계 준비의 추가 마이그레이션

v0.3.8은 `0007_peoria_history.sql`을 추가합니다. 이전 0001~0006의 사용자/라운드/광고/기록 데이터는 수정하지 않고 신페리오 이력 테이블만 생성합니다. 새 API 배포 전 해당 DB에 0007까지 적용해야 합니다. 로컬 검증은 운영 DB를 만들거나 변경하지 않습니다. v0.3.8에서는 조회만 연결했고 v0.3.9에서 실제 계산 POST도 연결했습니다. v0.3.9는 새 마이그레이션 없이 0007을 사용합니다.
