# 10단계 광고 — v0.3.10-stage10a / 2026-09-24

## 완료 범위와 미완료 구분

실제 SDK의 테스트 경로와 서버/화면 연결, 모의 SDK 이벤트·회귀·번들 검증까지입니다. 실제 기기에서 광고가 뜬 것을 확인한 버전이 아니며 APK/iOS 설치 빌드·운영 광고 승인·계정 연결·실제 이메일·배포는 수행하지 않았습니다.

## 설치 및 환경

Expo `~57.0.24`, React Native `0.86.3`, `react-native-google-mobile-ads` `17.1.0`을 lockfile 기준으로 사용합니다. `npx expo install react-native-google-mobile-ads`의 온라인 호환성 조회는 프록시 시간 초과였으며, `EXPO_OFFLINE=1 npx expo install react-native-google-mobile-ads`로 설치 완료했습니다. 오프라인 `expo install --check`는 통과했지만 RN Directory의 온라인 호환성 검사 통과를 의미하지 않습니다. 설치 때 기존 transitive react-native-worklets/Expo peer 범위 경고가 있었으며 실제 네이티브 컴파일 검증은 남아 있습니다.

| 설정                                              | 동작                                                        |
| ------------------------------------------------- | ----------------------------------------------------------- |
| EXPO_PUBLIC_ADS_MODE 생략                         | Android/iOS=admob-test, Web=mock                            |
| admob-test                                        | 네이티브 실제 SDK + Google TestIds, 웹은 비활성             |
| mock                                              | 웹 개발용 완료/장애 버튼, 네이티브는 비활성                 |
| disabled 또는 알 수 없는 값                       | 광고 비활성, 완료로 자동 인정하지 않음                      |
| ADMOB_TEST_ANDROID_APP_ID / ADMOB_TEST_IOS_APP_ID | 개발용 AdMob 앱 ID만 빌드 시 교체; 광고 단위는 계속 TestIds |
| EXPO_PUBLIC_ADS_BANNER_FIXTURE=1                  | 웹 배치 검증용 50px 모의 배너. 서버도 test_ads=true여야 함  |

기본 앱 ID는 Google 공식 샘플, 개발 앱 식별자는 com.yamone.golf.dev입니다. Android SDK backend는 nextgen, 측정 지연은 true입니다. app.config.ts가 선택적 개발 App ID 형식을 검사하며 개인 키를 앱에 넣지 않습니다. `EXPO_PUBLIC_*`은 번들에 포함되므로 비밀 값이 아닙니다. 라이브 광고 단위는 아직 받거나 노출하지 않습니다.

설치 뒤 개발 빌드를 새로 만들어야 합니다. Expo Go에서는 안내만 하고 광고 장애로 위장해 통과시키지 않습니다. 현재 환경에는 Android SDK와 연결된 기기가 없어 네이티브 설치 빌드를 실행하지 않았습니다. Expo config introspection으로 Android APPLICATION_ID/DELAY_APP_MEASUREMENT_INIT와 iOS GADApplicationIdentifier를 확인했습니다.

## 제공자·개인정보

네이티브 모듈은 지연 로딩합니다. 먼저 UMP gatherConsent/getConsentInfo를 확인하고 canRequestAds인 경우에만 초기화·요청합니다. 동의 확인이 불가능하면 광고를 요청하지 않습니다. 이름/위치/골프장/개인 코드/라운드 내용을 광고 요청에 넣지 않으며 비개인화 요청 옵션을 사용합니다. 비개인화 옵션만으로 동의 절차를 생략하지 않습니다.

내 정보에 광고 개인정보 선택 진입점을 넣었습니다. 제공자가 REQUIRED로 보고한 양식만 열고 이후 동의를 다시 확인합니다. 샘플 App ID만으로 실제 UMP 양식을 확인할 수 있는 것은 아닙니다. 개발용 AdMob 앱의 Privacy & messaging 설정과 테스트 기기/지역 QA가 필요합니다. 연령대·운영 고지·스토어 데이터 공개 항목은 출시 체크 항목이며 임의 법적 적합성을 선언하지 않습니다.

## 전면 광고 생명주기

1. 원래 action_id/user_id/입력을 먼저 기기에 보관합니다. 광고 시작 전 서버 최신 action을 조회하고 이미 처리됐으면 다시 표시하지 않습니다.
2. loading에만 15초 제한을 둡니다. LOADED 뒤 show를 호출하기 전에 타이머를 제거합니다. OPENED 뒤 CLOSED만 completed입니다. show 실패/ERROR는 장애 결과입니다.
3. loading 중 백그라운드, 화면 이탈, 초기화 대기 취소는 interrupted입니다. 표시 중에는 광고 자체의 네이티브 Activity 이동이나 외부 광고 링크 방문을 완료/강제 종료로 추측하지 않습니다.
4. 표시 중 프로세스가 죽으면 terminal 결과를 저장한 적이 없으므로 재실행 후 미처리 action으로 남습니다. 표시 시간만으로 완료하지 않습니다.
5. terminal 결과와 source를 기기에 저장한 뒤 foreground 복귀를 기다립니다. 저장 실패 시 같은 화면의 메모리 결과로 저장을 재시도하며 광고를 다시 띄우지 않습니다. 저장 완료 이전 OS 종료까지 내구성을 보장한다고 주장하지 않습니다.
6. 서버 settlement 이후 최신 상태·권한을 재검사한 execute만 실제 기능을 수행합니다. 응답 유실/실패는 같은 요청 ID와 증빙으로 기능만 재시도합니다. 광고 종료 메시지를 기능 성공 메시지로 사용하지 않습니다.

## 서버 경계

`GET /api/ad-config`는 인증 후 test_ads/production_ads를 반환합니다. 현재 production_ads는 false입니다. ad settlement의 source는 development-test 또는 admob-test만 시험 환경에서 받습니다. 생략된 source는 이전 저장본과의 호환을 위해 development-test입니다. 두 출처 모두 운영에서는 거절합니다.

source 문자열은 진위 증명이 아닙니다. 일반 Interstitial의 닫힘 및 실패는 클라이언트 콜백이고, Rewarded SSV를 일반 전면 광고에 있다고 가정하지 않았습니다. 사용자 동의 없이 보상형 광고로 바꾸거나 SDK·환경 문자열만으로 운영 지급/승인 조건을 해제하지 않습니다. 운영 연결 전에는 앱 무결성/서버 challenge·실패 승인 방식을 검토하고 자격 증명이 없어도 가능한 검증을 별도로 구현해야 합니다.

참여 광고 중 초대 취소/라운드 종료가 발생해도 (user_id,round_id) settlement는 1개로 남고 실제 참여는 거절됩니다. 신규 회원·기기 인증 방식, null 점수, 종료/완료 분리 및 시간·권한 정책은 변경하지 않았습니다. 기존 DB 0001~0007을 그대로 사용합니다.

## 배너

Shell은 배너를 ScrollView 다음, 하단 탭 이전에 둡니다. SafeAreaView 안에 있어 시스템 영역을 침범하지 않습니다. 현재 활성 화면만 광고를 마운트합니다. record 상세는 서버가 확인한 received/ended 이후, 신페리오는 record 진입 후 성공한 종료 기록 조회에서만 허용합니다. 계산 확인/실행 중에는 숨깁니다. round로 들어간 같은 기록에는 표시하지 않습니다.

네이티브 배너는 로딩 완료 전 높이 0이고 실패/15초 미노출이면 제거합니다. Web QA fixture는 실제 광고가 아니라고 표시하며 일반 웹 빌드에서는 반환값 null입니다. QA 전용 실패 키는 `ymg:qa-banner-fail`이며 fixture 빌드에만 적용됩니다.

## 재현 검증

```bash
npm ci
npm run typecheck
npm run lint
npm test
EXPO_PUBLIC_ADS_BANNER_FIXTURE=1 npm run export:web
EXPO_PUBLIC_ADS_BANNER_FIXTURE=1 npm run test:ui
npm run export:web
npm run export:android
npx expo config --type introspect
```

기본 UI는 기존 9묶음, fixture 환경에서 광고 1묶음을 추가해 10묶음입니다. 배너 검증은 웹 배치/실패 fixture 검증이지 실제 광고 노출 검증이 아닙니다. `PLAYWRIGHT_EXECUTABLE_PATH`로 호환 Chromium을 지정할 수 있고 `QA_KOREAN_FONT`로 로컬 한국어 WOFF2를 지정합니다.

## 기기·운영 QA 체크

- 새 개발 빌드 설치, SDK 17.1.0 / RN 0.86 네이티브 컴파일 및 시작/전환 오류.
- Android/iOS 전면 test 광고의 load/open/close/error, 광고 클릭 외부 앱 이동 후 복귀, 알림/전화/잠금.
- 로딩/표시/닫힘 직후 강제 종료 및 재실행. 광고 완료 후 네트워크 차단, 서버 성공 응답 유실.
- 배너 크기 변화, 기기 안전영역/키보드/탭 겹침, 앱 복귀 시 iOS 빈 WebView, 데이터 절약/망 전환.
- UMP 지역·동의 거절/재선택/네트워크 장애, 운영 메시지/광고 ID/스토어 고지 확정.
- 운영 verifier/오류 승인 경로가 준비되기 전 production fail-closed 유지. 배포·계정/유료 리소스 생성은 별도 승인 필요.

## 공식 자료 확인 (2026-09-24)

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)와 [Expo 라이브러리 설치](https://docs.expo.dev/workflow/using-libraries/): 버전·expo install·개발 빌드 경로 확인.
- [Invertase 설치](https://docs.page/invertase/react-native-google-mobile-ads): Expo config plugin·테스트 ID 확인. 설치된 17.1.0의 타입/플러그인도 대조했습니다.
- [광고 이벤트와 배너](https://docs.page/invertase/react-native-google-mobile-ads/displaying-ads): 일반 전면 이벤트, 배너 크기/실패, Rewarded SSV 구분.
- [UMP 동의](https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent): canRequestAds·개인정보 선택 전제.
- [Google Android 시작](https://developers.google.com/admob/android/quick-start), [iOS 시작](https://developers.google.com/admob/ios/quick-start): 공식 샘플 App ID 확인.
