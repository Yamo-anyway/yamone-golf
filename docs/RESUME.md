# 다음 실행 재개 지점 — v0.3.12-course-admin

1. GitHub `Yamo-anyway/yamone-golf`의 `develop/0.3.x` 최신 커밋과 태그를 기준으로 재개합니다. v0.3.10이나 사라진 임시 v0.3.25 보고본으로 되돌아가지 않습니다.
2. 실제 package 버전은 0.3.12입니다. `AGENTS.md`, README, DEVELOPMENT, POLICY, VALIDATION, CLOUDFLARE를 먼저 읽습니다.
3. 운영 D1 `yamone-golf` ID `c4bfbdea-d475-4415-aa9e-5ba3806cb552`에는 아직 `0001`~`0008`만 적용되어 있습니다. v0.3.12의 `0009_course_catalog_admin.sql`과 새 Worker는 배포하지 않았습니다.
4. Resend `golf.yamone.net` 도메인의 실제 인증·복구 메일 수신과 서버 계정 이전을 검증했습니다. `RESEND_API_KEY`와 `EMAIL_TOKEN_SECRET`은 Cloudflare secret에만 있으며 값은 채팅·Git·문서에 없습니다.
5. GitHub Actions `Android QA APK` run `36540461421`에서 운영 Worker와 Google 테스트 광고를 연결한 v0.3.11 QA APK를 생성했습니다. workflow commit은 `2af95501ca2574e8b61f9dc23f925c79543d0ec2`, artifact는 `yamone-golf-android-test-3`입니다.
6. APK SHA-256은 `5bb4db3024a0dc5c00028bf92d7a311cd4a0210293df8677218025fc5bd86241`입니다. 압축 구조·내부 체크섬·APK v2 서명은 통과했으나 Play Store용 운영 서명본이 아닙니다.
7. v0.3.12는 `/admin`에서 한국·필리핀 GolfCore 검색/검토/가져오기와 직접 등록·수정·비활성화·이력을 제공합니다. 운영 적용 전 별도 `COURSE_ADMIN_TOKEN`을 Wrangler secret으로 등록합니다.
8. 다음은 `0009` 원격 마이그레이션 → 관리자 secret → Worker 배포 → `/admin` 로그인 → 소량 코스 검토 가져오기 순서입니다. 이후 새 Android QA APK와 실기기 회귀를 진행합니다.
9. APK를 Android 휴대폰에 설치해 이메일 앱 링크, 기기 이전, 강제 종료/재부팅/망 전환, QR, 테스트 광고와 배너 안전영역을 QA합니다. 운영 AdMob/UMP와 스토어 배포는 미완료입니다.
10. 늦은 오프라인 입력 수용·나가기·사용자 삭제 등 미정 정책은 보류합니다. 다른 프로젝트와 자동화는 수정하지 않습니다.

## 소스 패키징

변경·검증·문서를 커밋하고 태그를 만든 다음 다음처럼 실행합니다. 출력 파일이 이미 있으면 새 이름을 사용합니다.

```bash
node --import tsx scripts/package-source.ts /absolute/path/yamone-golf-v0.3.12-course-admin-source.zip
```

체크포인트에는 실제 commit/tag, ZIP SHA256, 새 검증 결과와 다음 재개 지점을 씁니다. 새 소스 ZIP과 체크포인트는 `/골프`에 새 파일로 저장하며 기존 저장본은 삭제하지 않습니다.
