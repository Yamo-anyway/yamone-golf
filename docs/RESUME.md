# 다음 실행 재개 지점 — v0.3.11-stage11b

1. GitHub `Yamo-anyway/yamone-golf`의 `develop/0.3.x` 최신 커밋과 태그를 기준으로 재개합니다. v0.3.10이나 사라진 임시 v0.3.25 보고본으로 되돌아가지 않습니다.
2. 실제 package 버전은 0.3.11입니다. `AGENTS.md`, README, DEVELOPMENT, POLICY, VALIDATION, EMAIL_RECOVERY, ADS를 먼저 읽습니다.
3. 운영 D1 `yamone-golf` ID `c4bfbdea-d475-4415-aa9e-5ba3806cb552`에 `0001`~`0008`을 적용했습니다. production Worker와 10분 Cron은 `https://yamone-golf-api.yamone-golf.workers.dev`에 배포됐습니다.
4. Resend `golf.yamone.net` 도메인의 실제 인증·복구 메일 수신과 서버 계정 이전을 검증했습니다. `RESEND_API_KEY`와 `EMAIL_TOKEN_SECRET`은 Cloudflare secret에만 있으며 값은 채팅·Git·문서에 없습니다.
5. 검증용 사용자는 관련 이메일 요청·기기·복구 행과 함께 삭제해 잔여 수 0을 확인했습니다. 다음은 Android APK에 운영 API를 연결하고 앱 링크/강제 종료/실제 기기/광고를 QA합니다.
6. 실제 기기 강제 종료/광고·QR 인식, 운영 AdMob/UMP, 설치 APK·스토어 배포는 미완료입니다. 로컬 mock·번들 생성을 실기기 완료로 보고하지 않습니다.
7. 늦은 오프라인 입력 수용·나가기·사용자 삭제 등 미정 정책은 보류합니다. 다른 프로젝트와 자동화는 수정하지 않습니다.

## 소스 패키징

변경·검증·문서를 커밋하고 태그를 만든 다음 다음처럼 실행합니다. 출력 파일이 이미 있으면 새 이름을 사용합니다.

```bash
node --import tsx scripts/package-source.ts /absolute/path/yamone-golf-v0.3.11-stage11a-source.zip
```

체크포인트에는 실제 commit/tag, ZIP SHA256, 새 검증 결과와 다음 재개 지점을 씁니다. 새 소스 ZIP과 체크포인트는 `/골프`에 새 파일로 저장하며 기존 저장본은 삭제하지 않습니다.
