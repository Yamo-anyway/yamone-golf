# API — v0.3.12

## 골프장 관리자 API

`GET /admin`은 같은 Worker에서 관리자 웹을 제공합니다. `/admin/api/*`는 32자 이상 `COURSE_ADMIN_TOKEN`을 Bearer로 요구하고 요청 제한을 적용합니다. 운영 토큰은 Wrangler secret에만 저장합니다.

| 메서드  | 경로                                             | 용도                                      |
| ------- | ------------------------------------------------ | ----------------------------------------- |
| GET     | `/admin/api/courses?q=&country=&status=&offset=` | 저장된 코스 조회                          |
| POST    | `/admin/api/courses`                             | 이름·KR/PH·도시·9홀 PAR 직접 등록         |
| GET/PUT | `/admin/api/courses/:id`                         | 상세 조회·version 기반 전체 수정/비활성화 |
| GET     | `/admin/api/courses/:id/history`                 | 관리자 변경 이력                          |
| GET     | `/admin/api/golfcore/search?country=kr           | ph&q=&offset=`                            | GolfCore scorecard 검색 |
| GET     | `/admin/api/golfcore/courses/:slug`              | 9홀 단위 검토 초안 생성                   |
| POST    | `/admin/api/golfcore/import`                     | 검토·수정한 초안을 D1에 신규 저장/갱신    |

GolfCore 호출은 공식 `https://api.golfcore.org/v1` JSON API만 사용합니다. 같은 slug는 하나의 D1 코스에만 대응하며 `source_url`을 보존합니다. 지도 좌표·이미지는 저장하지 않습니다.

모든 응답은 Cache-Control: no-store입니다. 오류는 `{ "error": "code" }` 형식이며 화면 문자열은 앱의 ko/en 리소스에서 정합니다. 각 성공 응답의 profile은 비밀값과 해시를 포함하지 않습니다.

| 메서드 | 경로                | 입력 / 결과                                                                                         |
| ------ | ------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | /health             | DB 연결 확인, 버전, 서버 시간                                                                       |
| POST   | /api/users          | nickname, language(system/ko/en), device_secret(64 hex), recovery_key, client(web/native) → profile |
| GET    | /api/me             | 활성 기기 인증 → profile, server_time                                                               |
| PATCH  | /api/me             | nickname 또는 language → 변경된 profile                                                             |
| POST   | /api/recovery/claim | recovery_key, next_recovery_key, 새 device_secret, client → 같은 user_id의 profile                  |
| POST   | /api/device/reset   | 활성 인증 폐기. 사용자 데이터 삭제와 다름. 현재 화면에는 일반 로그아웃 메뉴 없음                    |

생성과 복구는 요청 전에 기기 비밀값 및 복구 키를 보관합니다. 같은 기기 비밀값으로 재전송하면 기존 결과를 돌려줍니다. 이미 폐기된 기기 비밀값은 새 사용자 생성에 재사용하지 않습니다.

복구는 기존 키를 소비하고 새 키로 교체합니다. 새 기기는 교체된 키를 별도 보관하도록 안내합니다. 키를 아는 동시 요청 2개 중 하나만 성공합니다. 복구 실패 시 기존 활성 기기는 유지됩니다.

오류 예: unauthorized(401), device_moved(401), invalid_nickname(400), invalid_recovery(400), origin_denied(403), rate_limited(429), server_error(500).

## 복구 이메일 API

이메일은 일반 로그인 식별자가 아니며 현재 활성 기기에서 선택적으로 인증합니다. 인증이 끝난 주소만 새 기기 복구에 사용할 수 있습니다.

| 메서드 | 경로                                      | 인증 | 입력 / 결과                                                                            |
| ------ | ----------------------------------------- | ---- | -------------------------------------------------------------------------------------- |
| GET    | /api/email-recovery                       | 필요 | configured, 마스킹 주소, verified_at                                                   |
| POST   | /api/email-recovery/verification-requests | 필요 | request_id, email, language → 15분 코드 발송 상태                                      |
| POST   | /api/email-recovery/verify                | 필요 | request_id, code → 이메일 인증                                                         |
| POST   | /api/email-recovery/requests              | 없음 | request_id, email, language → 주소 존재 여부와 무관하게 accepted                       |
| POST   | /api/email-recovery/claim                 | 없음 | request_id, code, 새 device_secret, next_recovery_key, client → 같은 user_id의 profile |

코드는 공백·하이픈을 제외하고 12자이며 15분 뒤 만료됩니다. D1에는 코드 해시만 저장합니다. 복구 요청은 등록된 주소가 아니거나 Resend 전송 장애가 있어도 같은 공개 응답을 사용합니다. 실제 복구 claim은 코드·만료·미소비 상태를 검사하며 기존 기기 폐기, 새 기기 활성화, 복구 키 교체, 요청 소비를 한 D1 batch로 처리합니다.

Resend 요청은 `yamone-golf:<verify|recover>:<request_id>` 멱등 키를 사용합니다. 앱은 request_id와 새 기기 비밀값·다음 복구 키를 먼저 SecureStore에 기록하고, 응답 유실 시 동일 본문으로 재요청합니다.

## 2단계 골프장·라운드 API

아래 API는 모두 활성 기기 인증이 필요합니다. UUID 요청 ID와 준비 내용을 기기에 보관한 뒤 요청합니다.

| 메서드    | 경로                           | 입력 / 결과                                                         |
| --------- | ------------------------------ | ------------------------------------------------------------------- |
| GET       | /api/courses?q=&offset=0       | 활성 코스의 이름/도시/지역 검색, 국가·출처 링크 포함, 30개씩        |
| POST      | /api/courses                   | course_id(UUID), name, region, segments[{name, pars[9]}]            |
| GET/PATCH | /api/courses/:id               | 조회 / 전체 정보 + 기존 version으로 수정                            |
| GET       | /api/me/courses                | 개인 목록 courses와 version                                         |
| PATCH     | /api/me/courses                | version, action(add/remove/reorder), course_id 또는 전체 course_ids |
| GET       | /api/home                      | 진행 중 라운드, 유효한 초대 카드                                    |
| POST      | /api/rounds/lookup             | code → 골프장·코스·홀 수·생성자 닉네임                              |
| POST      | /api/round-actions             | action_id, kind(create/join), 준비 내용 → 광고/완료 상태·요약       |
| GET       | /api/round-actions/:id         | 해당 사용자의 보류/완료 상태 재조회                                 |
| POST      | /api/round-actions/:id/ad      | 개발 환경 전용 outcome 등록                                         |
| POST      | /api/round-actions/:id/execute | 최신 권한/상태 재확인 → 라운드 생성/참여                            |
| GET       | /api/rounds/:id                | 참여자만 원본·참여 사용자·플레이어 슬롯 조회                        |
| POST      | /api/rounds/:id/invitations    | 참여자가 invitation_id(UUID), personal_code로 초대                  |
| POST      | /api/invitations/:id/decline   | 수신자만 초대 카드 취소                                             |

생성 준비: course_id, course_version, segment_indices(1개 또는 2개, 동일 코스 반복 가능), players[{name,self}](1~8명). self=true는 최대 1명이며 현재 사용자에만 연결됩니다. 준비 당시 골프장/코스/PAR을 복사하며, 라운드 생성 후 공용 정보 수정과 독립적입니다.

참여 준비: code 또는 invitation_id. 초대는 현재 사용자에게 온 pending 상태여야 합니다. 참여는 round_participants만 추가하고 기존 player_slots와 점수에는 손대지 않습니다. 플레이어 연결은 아래 3단계 API로 별도로 처리합니다.

같은 action_id는 같은 작업을 의미하며 첫 준비 내용이 유지됩니다. 변경한 내용으로 새 작업을 하려면 기존 보류 작업을 취소한 뒤 새 ID를 사용합니다. execute 응답 유실 시 같은 ID로 재시도하면 같은 라운드를 반환합니다.

광고 결과: completed/unavailable/load_failed/show_failed/load_timeout. interrupted는 거절하며 기능도 실행하지 않습니다. 테스트 결과는 development/test/ui-test에서만 허용하고 ad_source=development-test로 구분합니다. 실제 광고 검증 API가 아닙니다.

준비 action의 광고 완료는 기능 요청 실패 후에도 유지됩니다. 실제 실행 성공 시 (user_id, round_id)의 단일 광고 이력을 원자적으로 등록합니다. 클라이언트는 광고 결과를 먼저 기기에 보관하므로 결과 등록 요청의 응답 유실에도 광고를 다시 요구하지 않습니다. 앱이 결과 없이 닫히면 미처리 상태로 재개합니다.

공용 수정은 course.version, 개인 목록은 course_lists.version으로 충돌을 검출합니다. 목록 제거는 user_courses 관계만 변경합니다. 현재 개인 목록은 100개까지이며 공용 검색은 페이지 단위로 제공합니다.

활성 기기·라운드 상태·초대 상태 확인과 실제 쓰기는 D1 batch에서 함께 실행합니다. mutation_guards의 CHECK 실패는 배치 전체를 롤백합니다. active_round_users의 사용자별 PK로 진행 중 라운드가 하나임을 보장합니다. 완료 전에는 클라이언트에 성공을 알리지 않습니다.

추가 오류: course_changed/list_changed/state_changed/active_round_exists/round_ended/invitation_unavailable/ad_required(409), forbidden(403), ads_not_configured(503). 오류 후 화면 초안을 임의로 지우지 않습니다.

점수·종료·기록 보내기/받기 API는 아래에 이어집니다.

## 3단계 플레이어·개인 입력 대상 API

모든 경로는 해당 라운드의 참여자만 사용할 수 있습니다. `:r`은 round_id, `:s`는 slot_id입니다. 연결만 된 비참여자는 이 API로 라운드를 조회하거나 관리할 수 없습니다.

| 메서드 | 경로                                    | 입력 / 결과                                                                  |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | /api/rounds/:r/players                  | status, roster_version, 플레이어 목록·연결 코드·참조 수                      |
| POST   | /api/rounds/:r/players                  | mutation_id, name → 새 미등록 슬롯, 최신 목록                                |
| POST   | /api/rounds/:r/player-lookup            | code(개인 코드 또는 정해진 QR URI) → user, linked_slot_id                    |
| PATCH  | /api/rounds/:r/players/:s               | mutation_id, version, action, 변경 내용                                      |
| GET    | /api/rounds/:r/players/:s/delete-impact | 사용자 연결·스코어·전송·수신·개인 목록 참조 수와 삭제 가능 여부              |
| DELETE | /api/rounds/:r/players/:s               | mutation_id, version, roster_version, target_count → 재검사 후 삭제          |
| GET    | /api/rounds/:r/input-targets            | 본인 목록의 version, roster_version, customized, players, 순서 있는 slot_ids |
| PATCH  | /api/rounds/:r/input-targets            | mutation_id, version, roster_version, slot_ids → 본인 목록 전체 저장         |

PATCH action:

- rename: name. 미등록 슬롯만 허용하며 종료 후에도 기존 참여자가 이름을 수정할 수 있습니다.
- link: code, confirmed_user_id. 미리 확인한 사용자를 명시합니다. 같은 라운드에서 하나의 user_id는 한 슬롯에만 연결됩니다.
- unlink: name. 임시 이름을 지정하고 user_id만 연결 해제합니다. 슬롯 ID·스코어·이전 전송/수신 참조는 지우지 않습니다.

추가·삭제·입력 대상 변경은 진행 중 라운드에서만 허용합니다. 7단계부터 종료 후에도 기존 참여자는 연결·해제·미등록 이름 수정을 할 수 있습니다. 연결 해제는 대기 중 전송을 함께 취소하며 이미 받은 개인 기록은 유지합니다. 연결은 round_participants 또는 active_round_users를 추가하지 않고 광고도 요청하지 않습니다. 플레이어 응답에는 현재 연결 사용자의 received_current, pending_delivery_id도 포함합니다.

삭제는 다음을 원자적으로 다시 확인합니다: 기기 활성, 참여 권한, 진행 상태, 슬롯 버전, 전체 플레이어 목록 버전, 사용자 미연결, 실제 스코어 없음, 모든 전송/수신 참조 없음, 영향받는 저장 목록 수, 최소 플레이어 1명 유지. 수신 후 개인 기록을 지운 흔적이나 취소된 전송이 있어도 단순 삭제하지 않습니다. 강제 삭제 API는 제공하지 않습니다.

삭제 시 deleted_at을 기록해 슬롯 ID와 감사 이력을 보존하고 화면에서 제외합니다. 저장된 개인 목록에서는 해당 슬롯만 제거하며 영향받은 목록의 version을 증가시킵니다. 원본 플레이어 순서와 개인 입력 대상 순서는 별개입니다.

개인 입력 대상은 최초 미설정 상태에서 현재 전체 슬롯을 기본 선택으로 반환합니다. 한번 저장하면 빈 배열도 명시적인 선택으로 유지합니다. 이후 새 슬롯은 사용자가 직접 선택하며, 다른 사용자 목록을 요청 파라미터로 지정할 수 없습니다. 순서 변경은 라운드 updated_at을 갱신하지 않습니다.

모든 쓰기는 mutation_id별 중복 방지와 본문 해시를 사용합니다. 성공 응답 유실 후 동일 본문/ID를 재요청하면 다시 실행하지 않고 최신 목록을 반환합니다. 같은 ID에 다른 본문은 request_reused(409)입니다. 앱은 같은 화면에서 같은 변경을 재시도할 때 ID를 유지합니다. 이름 작성 중 화면 이탈에는 확인이 있으며, 앱 강제 종료까지 모든 이름 초안을 보존하는 기능은 아직 없습니다.

오류: player_changed, player_link_changed, user_already_player, targets_changed, player_protected, delete_changed, last_player, player_limit, linked_name_locked(409). 충돌 응답 뒤 조회로 최신 값을 확인하며 앱 초안은 명시적인 선택 전까지 남깁니다.

## 후속 점수·기록 API 통합 시 제약

0003 마이그레이션의 scores는 아래 4단계 API가 사용합니다. deliveries/receipts는 0006 마이그레이션과 아래 7단계 API로 연결합니다.

4단계의 점수 저장은 동일 트랜잭션에서 deleted_at IS NULL, 활성 기기, 참여/입력 권한, 라운드 상태와 홀 범위를 확인해야 합니다. 삭제된 슬롯에 뒤늦게 도착한 입력을 복원해서는 안 됩니다. 점수 없음은 strokes=NULL 또는 행 부재이며 0은 저장할 수 없습니다. 7단계의 전송·수신도 수신 사용자·라운드·슬롯 관계를 함께 검증해야 합니다.

## 4단계 스코어 API

`GET /api/rounds/:round_id/scores`: 참여자에게 라운드 상태, 9/18홀, 코스/PAR 복사본, 플레이어, 내 입력 대상 순서/버전, `scores[{slot_id,hole,strokes,version}]`을 같은 D1 batch의 일관된 상태로 반환합니다. 행이 없으면 `strokes=null,version=0`으로 해석합니다. 삭제한 점수는 null 행과 증가한 버전을 유지합니다.

`PUT /api/rounds/:round_id/scores`:

```json
{
  "mutation_id": "UUID",
  "hole": 1,
  "roster_version": 0,
  "target_version": 0,
  "entries": [{ "slot_id": "UUID", "strokes": 4, "version": 0 }]
}
```

- entries는 현재 사용자가 선택한 입력 대상 전체와 정확히 같아야 합니다. 1~8명, 중복/다른 라운드/삭제 슬롯 불가. 개인 목록 변경 또는 플레이어 목록 변경은 `targets_changed`로 거절합니다.
- strokes는 1~999의 정수 또는 null. null은 삭제/미입력입니다. 0, 소수, 문자열은 거절합니다. hole은 실제 라운드 9/18홀 범위여야 합니다.
- 저장된 값과 같으면 성공하되 버전/감사 이력/라운드 갱신 시각은 바꾸지 않습니다.
- 다른 값이며 버전이 오래됐으면 HTTP 409 `{error:"score_conflict",conflicts:[{slot_id,strokes,version,proposed}],sheet}`를 반환하고 전체 쓰기를 보류합니다. UI는 최신 값 → 제안 값을 표시합니다.
- 확인 후 conflicts의 최신 version을 넣어 새 mutation_id로 재요청합니다. 그 사이 값/버전이 바뀌면 다시 충돌합니다. 값이 변경됐다 돌아온 경우도 버전으로 검출합니다. 이미 같은 목표 값이 저장된 경우는 성공으로 처리합니다.
- 성공은 `{sheet,replayed}`. 동일 mutation_id와 동일 내용을 재시도하면 실행을 반복하지 않고 최신 sheet와 replayed=true를 반환합니다. 다른 내용 재사용은 `request_reused`입니다. 원래 요청이 성공한 뒤 다른 사람이 수정했어도 재시도가 되덮어쓰지 않습니다.
- 활성 기기, 참여자, active 라운드, 선택 목록/슬롯/점수 버전을 실제 D1 batch에서 다시 검사합니다. 한 점수라도 검사가 실패하면 변경 이력과 다른 점수까지 모두 롤백합니다.
- 점수와 다른 참여자의 슬롯 삭제가 경쟁해도 같은 트랜잭션의 삭제/점수 존재 검사가 오래된 쓰기를 막습니다.
- ended 라운드에는 쓰기를 거절합니다. 종료+24시간 수신자 본인 수정은 아래 8단계 API에서 별도로 처리합니다.
- 점수 입력에는 광고 정산을 요구하거나 생성하지 않습니다.

## 5단계 오프라인 전송

5단계 클라이언트는 `GET /api/rounds/:id/scores?user_id=<캐시 사용자>`와 PUT의 `user_id`를 보냅니다. 현재 인증 기기의 사용자와 다르면 `user_changed`(409)로 거절하며 점수/전송 이력을 변경하지 않습니다. 기존 4단계 클라이언트와 호환하기 위해 생략된 필드는 기존 인증 기준으로 처리합니다.

저장 요청은 기기의 영속 대기열에 정확한 mutation_id, user_id, hole, 목록 버전과 각 score version/값을 먼저 기록합니다. HTTP 응답 유실 또는 로컬 확인 저장 실패 후에도 같은 요청을 사용합니다. 네트워크 복구 시 현재 서버 버전으로 요청을 몰래 변경하지 않습니다.

`score_conflict`는 기기에 상세 내용을 보관하고 사용자 확인 뒤 새 mutation_id/확인한 버전으로 전송합니다. 확인하지 않은 초안, 종료/권한/목록 변경 보류 요청은 자동으로 승인하지 않습니다. `round_ended`는 자동 재시도 대상이 아니며 현재 기기에 요청을 유지합니다. 네트워크/5xx/429는 전면 실행 중 재시도 대상입니다.

5단계 점수 전송은 4단계의 0001~0004 점수 구조를 그대로 사용합니다. 서버가 이전 요청 성공을 기억하고 있는 한, 라운드 종료 이후의 동일 요청 재조회도 새 쓰기 없이 확인할 수 있습니다. 신규 요청은 종료 상태에서 거절합니다.

## 6단계 종료 API

모두 현재 활성 기기의 참여자 인증이 필요합니다.

- `GET /api/rounds/:id/ending`: 서버 종료 여부/시각/사유, record_version, permission_version, 내 can_end/is_creator, 참가자별 종료 권한·개인 코드, 각 플레이어의 입력 홀 수/합계/완료 여부.
- `POST /api/rounds/:id/ending`: `{user_id, mutation_id, record_version}`. 최신 버전과 권한을 검사하여 종료. 응답은 GET과 같은 종료 상태. 바뀐 기록은 `end_changed`(409), 위임 없는 사용자는 `end_forbidden`(403).
- `POST /api/rounds/:id/end-permissions`: `{user_id,mutation_id,permission_version,participant_id,can_end:boolean}`. 생성자만 사용. 다른 버전은 `permissions_changed`(409). 비참여자/자기 자신 대상은 `invalid_participant`.
- `GET /api/home`에 `ended_rounds`가 추가됩니다. 해당 사용자가 참여한 최근 종료 10개이며 개인 수신 기록이 아닙니다. 7단계부터 수신 이력이 있는 라운드는 개인 기록을 삭제했더라도 이 목록에 다시 표시하지 않습니다.

새 요청의 user_id가 인증 사용자와 다르면 user_changed(409). 같은 요청 ID와 같은 내용은 재조회로 처리하고, 다른 내용은 request_reused(409). 이미 종료된 라운드의 종료 재요청은 현재 종료 상태를 반환하며 새 활동이나 광고 이력을 만들지 않습니다.

마이그레이션 0005를 적용해야 합니다. 6시간 만료는 scheduled와 API 양쪽에서 처리하고 실제 쓰기 조건에도 기한을 검사합니다. 결과 미확정 오프라인 요청은 이전과 같이 같은 ID로 재시도할 수 있지만, 새로운 종료 후 점수 쓰기는 거절합니다.

## 7단계 기록 전달 API

0006 마이그레이션을 적용합니다. 모든 쓰기에는 인증 사용자와 일치하는 `user_id`가 필수입니다. `mutation_id`는 같은 작업의 재시도에 유지하며 다른 본문으로 재사용할 수 없습니다. 수신 흐름의 `action_id`도 원래 `delivery_id`에 고정됩니다.

| 메서드 | 경로                               | 입력 / 결과                                                                        |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | /api/record-inbox?before=          | 본인에게 온 유효한 pending 전송                                                    |
| GET    | /api/records?before=               | 본인의 received 개인 기록                                                          |
| GET    | /api/records/:receipt_id           | 본인 RECEIPT, 전체 라운드 sheet, ended_at, can_manage, current_player, peoria_runs |
| DELETE | /api/records/:receipt_id           | user_id, mutation_id → 개인 RECEIPT만 deleted 처리                                 |
| GET    | /api/rounds/:id/deliveries?before= | 종료 라운드의 기존 참여자에게 전송 이력                                            |
| POST   | /api/rounds/:id/deliveries         | user_id, mutation_id, slot_id, version, recipient_id → 전송                        |
| POST   | /api/deliveries/:id/cancel         | user_id, mutation_id → pending 전송 취소                                           |
| POST   | /api/receipt-actions               | user_id, action_id, delivery_id → 광고/수신 준비 상태                              |
| GET    | /api/receipt-actions/:id           | 본인의 광고/수신 상태 재조회                                                       |
| POST   | /api/receipt-actions/:id/ad        | user_id, outcome → 개발 테스트 광고 결과 저장                                      |
| POST   | /api/receipt-actions/:id/execute   | user_id → 최신 상태 검증 후 RECEIPT                                                |

목록은 `{items,next_cursor}`이며 20개씩 반환합니다. `before`는 서버가 준 `timestamp:UUID` 커서를 그대로 사용합니다. 삭제·취소 항목은 받을 기록/개인 기록 목록에서 제외되며 전송 이력은 유지합니다.

보내기는 기존 참여자, 종료 상태, 현재 슬롯 버전과 연결 사용자를 같은 트랜잭션에서 검사합니다. 같은 슬롯/수신자의 pending 전송이 있으면 기존 항목으로 연결합니다. 이미 활성 개인 기록이 있으면 `already_received`입니다. pending 전송은 보낸 사람·생성자·받는 사람만 취소할 수 있고 수신 완료 전송은 취소할 수 없습니다.

수신은 참여자 등록과 별개입니다. 다른 진행 중 라운드가 있어도 받을 수 있으며 active_round_users를 변경하지 않습니다. 생성자/참여자의 기존 광고 이력을 재사용합니다. 미참여 수신자는 광고 처리 뒤 이력을 먼저 보관하고 실제 수신을 실행합니다. 광고 중 취소/연결 해제가 생기면 광고 이력은 유지하되 수신은 거절합니다. 테스트 환경에서만 완료/장애 결과를 받으며 interrupted는 인정하지 않습니다.

실제 수신의 RECEIPT 생성·DELIVERY received·action 완료는 원자적으로 처리합니다. 활성 기기, 수신 사용자, pending 상태, 현재 슬롯 연결, ended 상태, 광고 이력, 활성 개인 기록 부재를 다시 확인합니다. 동시에 같은 전송을 받아도 개인 기록은 하나이며 같은 전송의 재시도는 원래 RECEIPT를 반환합니다.

개인 삭제는 공동 라운드/점수/다른 사람의 기록과 과거 received 전송을 변경하지 않습니다. 삭제한 RECEIPT의 재조회·수신 재시도는 deleted 상태를 반환하고 sheet는 null입니다. 새로운 명시적 전송만 새 수신 항목이 됩니다. 예전 삭제 요청은 나중에 받은 새 RECEIPT를 삭제하지 않습니다.

sheet는 전체 플레이어·홀별 점수·코스/PAR을 포함하는 읽기 전용 원본 조회입니다. 비참여 수신자에게 공동 입력 권한을 부여하지 않습니다. current_player는 현재 슬롯의 연결 사용자 일치 여부이고 can_manage는 기존 참여자인지 나타냅니다. peoria_runs는 저장된 공개 신페리오 이력을 최신 순으로 반환합니다. 이력이 없으면 빈 배열입니다.

추가 오류: record_not_found/delivery_not_found(404), delivery_unavailable/already_received/player_link_changed/request_reused/user_changed/ad_required(409), forbidden(403), ads_not_configured(503). 서버 성공 전에는 앱에서 수신 완료로 표시하지 않습니다.

## 8단계 개인 기록·통계·본인 수정

`GET /api/records`에 `q`(골프장명, 최대 100자), `scope=all|statistics|incomplete|nine`을 추가합니다. `before`는 이전과 같은 커서이며 같은 검색/필터와 함께 전달합니다. 응답 항목에 현재 본인 슬롯의 `holes_recorded`, `total_strokes`, `current_player`가 추가됩니다. 통계 필터는 연결된 18홀 완주만, 미완료 필터는 해당 라운드 홀 수보다 입력이 적은 기록을 조회합니다.

`GET /api/statistics`는 현재 사용자에 대해 다음을 반환합니다. `received_rounds`, `eligible_rounds`, `excluded{unlinked,nine_hole,incomplete}`, `average_strokes`, `best_strokes`, `highest_strokes`, `average_to_par`, `distribution{eagle_or_better,birdie,par,bogey,double_or_worse}`, `by_par[{par,holes,average_strokes}]`, `recent[{receipt_id,round_id,course_name,ended_at,total_strokes,total_par}]`(최신 10개). 집계는 한 D1 batch에서 같은 상태를 읽으며 삭제/9홀/미수신/미완료/현재 연결 해제는 통계에 포함하지 않습니다.

`GET /api/records/:id`에 `slot_version`, `edit{allowed,reason,deadline,server_time}`이 추가됩니다. reason은 available/record_deleted/record_unlinked/record_locked입니다. 개인 기록 삭제 시 sheet는 계속 null입니다.

`GET /api/records/:id/scores?user_id=`는 본인 수신 기록의 편집용 `PersonalScoreView`입니다. `receipt_id,round_id,user_id,player_slot_id,slot_version,player_name,hole_count,course,scores,edit`를 반환합니다. scores에는 해당 슬롯만 들어갑니다. 만료/연결 해제면 조회 가능하되 edit.allowed=false이며 삭제한 RECEIPT는 record_deleted를 반환합니다. user_id를 보내면 현재 인증 사용자와 일치해야 합니다.

`PUT /api/records/:id/scores`:

```json
{
  "user_id": "UUID",
  "mutation_id": "UUID",
  "player_slot_id": "UUID",
  "slot_version": 1,
  "hole": 1,
  "strokes": 4,
  "version": 1
}
```

슬롯은 서버가 해당 RECEIPT의 본인 슬롯과 대조합니다. strokes는 1~999 정수 또는 null입니다. user_id는 필수이며 현재 기기 사용자와 일치해야 합니다. 성공은 `{mutation_id,replayed}`입니다. 성공 뒤 최신 화면은 GET으로 다시 조회합니다. 서버 성공과 화면 갱신 실패를 구분할 수 있도록 쓰기 성공 응답에 별도 조회 결과를 섞지 않습니다.

값이 같으면 점수/이력 버전 변경 없이 요청만 확인합니다. 다른 값이며 버전이 오래됐으면 409 `{error:"score_conflict",current:{slot_id,hole,strokes,version},view}`를 반환합니다. 명시적으로 확인한 최신 version과 새로운 mutation_id로 다시 저장하며 슬롯 버전은 임의로 바꾸지 않습니다.

24시간 기한은 SQL 실행 시 서버 시각으로 재검사합니다. 이미 성공한 요청은 기한/연결/수신 상태가 나중에 달라져도 재확인할 수 있으나 다른 본문은 request_reused입니다. 진행 중 공동 입력 API는 종료 후 계속 거절하며 이 API만 본인 수정 권한을 갖습니다. 원본 SCORE와 감사 이력/record_version은 함께 저장합니다. ended_at/updated_at/round_completions/광고 이력은 변경하지 않습니다.

오류: record_edit_forbidden(403), record_deleted/record_unlinked/record_locked/player_link_changed/score_conflict/user_changed/request_reused/state_changed(409), invalid_score(400). 비소유 RECEIPT는 record_not_found(404)이며 폐기 기기는 401입니다. 상태 경쟁 시 재검사하거나 전체 트랜잭션을 롤백합니다.

## 신페리오 — 9단계

`GET /api/rounds/:round_id/peoria`

- 활성 기기 인증 필요. 생성자/기존 참여자 또는 현재 received 수신자만 조회합니다. 진행 중은 409 round_not_ended, 무권한은 403 forbidden입니다.
- 응답: round_id, 현재 record_version, latest_run_id(없으면 null), runs(최신 순), calculation.
- calculation: available, reason, deadline, server_time, confirmation_token, targets/excluded(슬롯ID·당시 이름·입력 홀 수).
- reason: available / peoria_forbidden / peoria_expired / peoria_limit / peoria_no_players / peoria_course_unsupported.
- 이력: 식별자·순번·시각·계산자/당시 이름·원본/계산 방식 버전·코스명/PAR/전체 선수 점수 Snapshot·대상/제외 슬롯ID·결과/순위. 공개 타입 shared/peoria.ts 참조.
- 숨김 홀과 내부 실행 요청 ID/해시는 조회 응답에 포함하지 않습니다. 같은 공개 이력은 기록 상세 peoria_runs에도 포함하며 삭제된 RECEIPT에는 빈 배열, 다른 사용자 RECEIPT는 404입니다.

`POST /api/rounds/:round_id/peoria`

- 본문: user_id, request_id(UUID), record_version, expected_runs(0~2), confirmation_token(GET 값), exclude_incomplete(boolean), confirm_recalculation(boolean).
- 미완료가 있으면 exclude_incomplete=true, 재계산이면 confirm_recalculation=true가 필요합니다. 임의 숨김 홀 등 알 수 없는 본문 필드는 거절합니다.
- 생성자 또는 종료 위임 참여자만 종료+3시간 미만에 실행합니다. 현재 원본/이름/플레이어/이력/권한 버전이 확인 당시와 달라지면 peoria_changed(409)로 새 확인을 요구합니다.
- 새 성공 201, 동일 요청 재확인 200. 응답 {request_id,run_id,replayed}. 원래 요청은 마감/횟수 소진 뒤에도 성공 결과를 재확인합니다. 본문을 바꾼 ID 재사용은 request_reused(409)입니다.
- 계산 쓰기와 Snapshot·내부 추첨·중복방지 정보를 하나의 원자적 행으로 저장합니다. UPDATE/DELETE 실행 API는 없습니다. 내부 계산 정보는 ACK에 포함하지 않습니다.

# 광고 SDK 개발 연결 추가 — v0.3.10

`GET /api/ad-config`: 활성 기기 인증 후 `{ test_ads: boolean, production_ads: false }`. 서버 시험 환경 여부가 유일한 test_ads 기준입니다.

`POST /api/round-actions/:id/ad`와 `POST /api/receipt-actions/:id/ad`는 기존 outcome 외에 선택적 source(`development-test`/`admob-test`)를 받습니다. 생략 시 이전 저장본을 위한 development-test입니다. 알려진 source라도 production/unknown 환경에서는 503 ads_not_configured입니다. 이미 저장된 시험 증빙이 있는 DB를 운영 환경으로 가져와도 새 execute를 허용하지 않습니다. 기존에 성공한 작업의 조회·멱등 재확인은 추가 생성과 구분합니다.

참여 ad는 실제 참여 전 round_ad_settlements를 보관합니다. 이 API의 성공은 참여·수신 성공이 아니며 execute가 최신 초대/종료/권한을 재검사합니다. source는 신뢰할 수 있는 광고 제공자 서명이 아니라 진단용 시험 출처입니다. 자세한 미완료 운영 경계는 ADS.md를 참조하세요.
