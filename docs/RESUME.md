# 다음 실행 재개 지점 — v0.3.10-stage10a

1. `/골프`의 최신 소스와 체크포인트를 먼저 확인합니다. v0.3.9로 되돌아가지 않습니다. 기존 작업 디렉터리가 남아 있으면 실제 git status/log와 최신 저장본을 대조합니다. 다른 작업이 사용 중이면 덮어쓰지 않습니다.
2. 기본 작업 경로는 `/workspace/scratch/5a1715aab655/yamone-golf-v0.3.0`, 브랜치는 `develop/0.3.x`입니다. 경로 이름은 최초 버전이며 실제 package 버전은 0.3.10입니다. 외부 Git remote는 없습니다.
3. 소스 ZIP에는 추적 파일·검증 캡처와 `repository-history.bundle`을 넣습니다. `.env`/기기 토큰/로컬 DB/node_modules는 제외합니다. 복원 시 bundle을 새 경로로 clone하고 `develop/0.3.x`를 checkout하면 이전 태그/커밋도 남습니다. clone이 만든 origin은 로컬 bundle이지 외부 원격 연결이 아닙니다. 소스 ZIP의 qa는 필요하면 복사합니다.
4. AGENTS/README/DEVELOPMENT/POLICY/VALIDATION/ADS를 읽고 `npm ci` 후 검증합니다. 테스트용 Chromium과 폰트 경로는 환경 의존이므로 없으면 다시 준비합니다.
5. 개발 광고 SDK/배너 연결과 로컬 회귀는 이번 단계까지입니다. 운영 test-proof 차단을 절대 해제하지 않습니다. 남은 10단계 독립적 보완·비메일 기능 점검을 먼저 하고, 11단계 마지막 기능으로 Resend 이전/복구 이메일의 구현·로컬 mock 검증을 진행합니다. 마지막은 기기 QA·백업·출시 준비입니다.
6. 실제 기기 강제 종료/광고·QR 인식, 운영 AdMob/UMP/Cloudflare/Resend 연결, APK·스토어 배포는 미완료입니다. 계정·실발송·배포·유료 자원은 승인 없이 하지 않습니다. 거절됐던 wrangler deploy/dry-run을 다시 실행하지 않습니다.
7. 늦은 오프라인 입력 수용·나가기 등 미정 정책은 보류 상태를 유지합니다. 다른 프로젝트와 자동화는 수정하지 않습니다.

## 소스 패키징

변경·검증·문서를 커밋하고 태그를 만든 다음 다음처럼 실행합니다. 출력 파일이 이미 있으면 새 이름을 사용합니다.

```bash
node --import tsx scripts/package-source.ts /absolute/path/yamone-golf-v0.3.10-stage10a-source.zip
```

체크포인트에는 실제 commit/tag, ZIP SHA256, 새 검증 결과와 다음 재개 지점을 씁니다. 새 소스 ZIP과 체크포인트는 `/골프`에 새 파일로 저장하며 기존 저장본은 삭제하지 않습니다.
