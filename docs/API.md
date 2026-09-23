# 1단계 API

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

현재 서버에는 골프장·라운드·점수·광고 완료 등록·이메일 API가 없습니다. 다음 단계에서 규칙과 테스트를 함께 추가합니다.
