# API — v0.3.1

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

## 2단계 골프장·라운드 API

아래 API는 모두 활성 기기 인증이 필요합니다. UUID 요청 ID와 준비 내용을 기기에 보관한 뒤 요청합니다.

| 메서드    | 경로                           | 입력 / 결과                                                         |
| --------- | ------------------------------ | ------------------------------------------------------------------- |
| GET       | /api/courses?q=&offset=0       | 이름/지역 검색, 30개씩, next_offset                                 |
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

참여 준비: code 또는 invitation_id. 초대는 현재 사용자에게 온 pending 상태여야 합니다. 참여는 round_participants만 추가하고 기존 player_slots와 점수에는 손대지 않습니다. 플레이어 연결은 3단계입니다.

같은 action_id는 같은 작업을 의미하며 첫 준비 내용이 유지됩니다. 변경한 내용으로 새 작업을 하려면 기존 보류 작업을 취소한 뒤 새 ID를 사용합니다. execute 응답 유실 시 같은 ID로 재시도하면 같은 라운드를 반환합니다.

광고 결과: completed/unavailable/load_failed/show_failed/load_timeout. interrupted는 거절하며 기능도 실행하지 않습니다. 테스트 결과는 development/test/ui-test에서만 허용하고 ad_source=development-test로 구분합니다. 실제 광고 검증 API가 아닙니다.

준비 action의 광고 완료는 기능 요청 실패 후에도 유지됩니다. 실제 실행 성공 시 (user_id, round_id)의 단일 광고 이력을 원자적으로 등록합니다. 클라이언트는 광고 결과를 먼저 기기에 보관하므로 결과 등록 요청의 응답 유실에도 광고를 다시 요구하지 않습니다. 앱이 결과 없이 닫히면 미처리 상태로 재개합니다.

공용 수정은 course.version, 개인 목록은 course_lists.version으로 충돌을 검출합니다. 목록 제거는 user_courses 관계만 변경합니다. 현재 개인 목록은 100개까지이며 공용 검색은 페이지 단위로 제공합니다.

활성 기기·라운드 상태·초대 상태 확인과 실제 쓰기는 D1 batch에서 함께 실행합니다. mutation_guards의 CHECK 실패는 배치 전체를 롤백합니다. active_round_users의 사용자별 PK로 진행 중 라운드가 하나임을 보장합니다. 완료 전에는 클라이언트에 성공을 알리지 않습니다.

추가 오류: course_changed/list_changed/state_changed/active_round_exists/round_ended/invitation_unavailable/ad_required(409), forbidden(403), ads_not_configured(503). 오류 후 화면 초안을 임의로 지우지 않습니다.

점수·종료·기록 보내기/받기·이메일 API는 후속 단계입니다.
