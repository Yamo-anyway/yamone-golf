# 3단계 앱 에셋·공통 UI — 2026-10-26

기존 깃발과 포레스트 그린·라임 색상을 유지해 실제 앱용 에셋과 공통 컴포넌트를 제작했다. 이미지 생성 시안과 별도로, 최종 앱은 크기·언어·상태가 바뀌는 텍스트와 벡터를 사용한다.

## 제작물

| 구분      | 구현                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- |
| 브랜드    | 공통 깃발 마크, 워드마크 조합, 단색 마크, 정사각 앱 아이콘                                         |
| 플랫폼    | 1024px 불투명 앱 아이콘, Android 투명 전경·단색 테마 아이콘, 투명 스플래시, 64px favicon           |
| 버튼      | 기본·보조·강조·조용한·삭제, 아이콘 전용, 일반/작은 크기, 누름·비활성·로딩·포커스                   |
| 입력·선택 | 검색/이메일/잠금 아이콘을 넣는 입력창, 오류·포커스·읽기 전용, 칩·체크박스·라디오·스위치            |
| 아이콘    | 메뉴·탐색·점수·개인/동반자·QR·공유·받기·달력·통계·오프라인·오류 등 43종                            |
| 안내 그림 | 골프장 없음·기록 없음·검색 없음·오프라인·오류·완료, 6종 SVG                                        |
| 점수      | 기존 21×25 점수 표시 공통화. 파 숫자, 버디/이글 원 1개, 보기 네모, 더블 이상 네모 2개, 미입력 대시 |
| 상태      | 저장됨·수정 중·전송 대기·충돌 확인·종료 배지                                                       |
| 규칙      | 공통 색상·글자 크기·모서리·터치 크기. 일반 버튼 52px, 작은 버튼·선택 도구 최소 48px                |

원본은 `src/ui/brand-paths.ts`, `icon-paths.ts`, `artwork-paths.ts`, `theme.ts`다. SVG와 플랫폼 PNG를 `assets/`로 내보낸다. 글꼴은 OS 기본 글꼴을 사용하며 한국어 글꼴 파일을 앱에 추가하지 않았다. 기존 QRCode는 실제 값으로 생성하는 고대비 QR과 여백을 유지한다. QR 메뉴 아이콘과 실제 QR 데이터는 구분한다.

## 화면 적용

- 공통 Button을 사용하는 앱 전역에 상태·아이콘·포커스 규칙을 적용했다. 기존 동작·라벨·testID는 유지한다.
- 시작/복구 화면의 상단 헤더와 로딩 화면에 같은 브랜드 마크를 사용한다.
- 뒤로 버튼, 검색/새로고침/기록 받기/통계/저장 등 주요 동작과 점수 ±를 공통 아이콘으로 연결했다.
- 골프장·기록·검색의 빈 화면을 벡터 그림으로 표시한다. 오류는 경고 아이콘과 색상 배경을 함께 사용한다.
- 기록 범위는 선택 상태를 표현하는 칩으로 바꿨다. 스코어카드 전송 대기는 아이콘과 텍스트가 있는 배지로 표시한다.
- 체크박스·라디오·스위치와 나머지 안내 그림은 공통 키트로 준비했다. 기존 업무 흐름에 없던 새 설정이나 기능을 추가하지 않았다.
- Expo 57용 `expo-splash-screen` 플러그인과 Android 단색 아이콘 경로를 설정했다. 앱 식별자·버전·운영 광고 설정은 바꾸지 않았다.

## 다시 제작·확인

```bash
npm run assets:export
npm run assets:check
npm run assets:gallery
# .tmp/asset-gallery/design/index.html을 브라우저에서 연다.
npm run typecheck
npm run lint
npm run export:web
npm run test:ui -- tests/assets-ui.ts
```

`design/app-preview.png`는 로컬 테스트 데이터로 실행한 앱 화면 3개를 모은 이미지다. `tests/assets-ui.ts` 실행 후 `node design/render-app-preview.mjs`로 다시 만든다.

`design/asset-kit.png`는 실제 React Native 공통 컴포넌트를 웹으로 렌더링한 전체 보드다. `design/asset-gallery.tsx`는 검토용이며 앱 라우트나 사용자 메뉴에 들어가지 않는다. 미리보기 번들과 임시 검증 데이터는 `.tmp/`, `qa/`에 생성한다. `PLAYWRIGHT_EXECUTABLE_PATH`는 시스템 브라우저 경로가 필요한 환경에서만 설정한다.

## 한국어·영어 제작물

에셋 보드의 제목·버튼·입력 안내·스코어 설명·상태 문구를 `design/gallery-copy.ts`에서 한국어/영어로 제공한다. 앱은 기존 `src/ui/locales/ko.ts`·`en.ts`를 사용한다. 아이콘·로고·안내 그림에는 언어별 문구가 없으므로 같은 벡터를 공유하고 텍스트만 언어 설정에 따라 바뀐다.

| 제작물                  | 한국어                                    | 영어                                      |
| ----------------------- | ----------------------------------------- | ----------------------------------------- |
| 전체 에셋 보드          | `design/asset-kit.png`                    | `design/asset-kit-en.png`                 |
| 실제 앱 적용 화면       | `design/app-preview.png`                  | `design/app-preview-en.png`               |
| 조작 가능한 검토용 HTML | `.tmp/asset-gallery/design/index-ko.html` | `.tmp/asset-gallery/design/index-en.html` |

`npm run assets:gallery`로 HTML 두 개를 함께 생성한다. `npm run test:ui -- tests/assets-ui.ts`는 두 언어의 보드와 실제 시작·골프장·기록·점수 입력/저장 화면을 확인하고 캡처한다. 적용 화면은 `node design/render-app-preview.mjs`와 `node design/render-app-preview.mjs --en`으로 각각 생성한다. 앱은 휴대폰 언어를 기본으로 사용하고, 내 정보의 한국어/English 선택이 우선하며 재시작해도 유지된다.

## 범위와 후속 작업

검증 결과는 `VALIDATION.md`의 최신 절을 기준으로 한다. Web·Android·iOS 코드 번들 성공은 APK/IPA 설치·실기기 실행 검증을 대신하지 않는다. 특히 OS 시작 화면·홈 화면 아이콘·Android 테마 색상은 7단계 새 preview/release 설치 빌드와 실기기에서 확인한다. 공식 Expo 안내도 시작 화면을 Expo Go/개발 클라이언트 대신 preview 또는 production 빌드로 검사하도록 권장한다.

다음 개발 단계는 4번 골프장 데이터·관리자 마무리다. 원격 DB 변경·운영 배포는 이 단계에 포함하지 않는다.

참고: [Expo 57 SplashScreen](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/), [앱 아이콘·시작 화면](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).
