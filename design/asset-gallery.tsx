import { galleryText, type GalleryCopyKey } from "./gallery-copy";
const language = document.documentElement.lang === "en" ? "en" : "ko";
const t = (key: GalleryCopyKey) => galleryText(language, key);
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { View } from "react-native";
import {
  Button,
  Card,
  Chip,
  Choice,
  Field,
  IconButton,
  StatusBadge,
  Toggle,
  Txt,
} from "../src/ui/components";
import { BrandLockup, BrandMark } from "../src/ui/brand";
import { Icon } from "../src/ui/icons";
import { iconPaths, type IconName } from "../src/ui/icon-paths";
import { StateArtwork } from "../src/ui/state-artwork";
import { artworkPaths, type ArtworkKind } from "../src/ui/artwork-paths";
import { ScoreMark } from "../src/ui/score-mark";
import { colors } from "../src/ui/theme";
const noop = () => {};
function Panel({
  number,
  title,
  detail,
  children,
  wide = false,
}: {
  number: string;
  title: string;
  detail?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={wide ? "panel wide" : "panel"}>
      <div className="panel-heading">
        <span>{number}</span>
        <h2>{title}</h2>
      </div>
      {detail && <p className="detail">{detail}</p>}
      <div className="panel-body">{children}</div>
    </section>
  );
}
function Gallery() {
  const [choice, setChoice] = useState(true),
    [radio, setRadio] = useState("front"),
    [toggle, setToggle] = useState(true),
    [chip, setChip] = useState(t("전체")),
    [count, setCount] = useState(4);
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">YAMONE GOLF · APP ASSET KIT</p>
          <h1>{t("한눈에 보는 앱 에셋")}</h1>
          <p>{t("로고부터 버튼, 입력 도구, 스코어와 안내 화면까지")}</p>
        </div>
        <div className="hero-brand">
          <BrandMark size={112} />
        </div>
      </header>
      <div className="grid">
        <Panel
          number="01"
          title={t("브랜드 \u00B7 시작 화면")}
          detail={t("기존 깃발을 유지한 공통 로고와 기기별 아이콘")}
        >
          <div className="brand-row">
            <BrandLockup size={96} />
            <BrandMark size={56} />
            <BrandMark size={56} monochrome />
          </div>
          <div className="brand-examples">
            <div>
              <img src="../assets/icon.png" className="launcher ios" />
              <small>{t("앱 아이콘 \u00B7 1024px")}</small>
            </div>
            <div>
              <img src="../assets/icon.png" className="launcher android" />
              <small>{t("Android 원형 마스크")}</small>
            </div>
            <div className="splash">
              <BrandLockup size={64} />
              <small>{t("시작 화면 \u00B7 페이퍼 배경")}</small>
            </div>
          </div>
        </Panel>
        <Panel
          number="02"
          title={t("기본 버튼 \u00B7 주요 동작")}
          detail={t(
            "실제 텍스트와 벡터 아이콘 \u00B7 크기가 달라져도 선명하게",
          )}
        >
          <div className="buttons">
            <Button label={t("새 라운드")} iconName="plus" onPress={noop} />
            <Button
              label={t("참여하기")}
              iconName="qr"
              secondary
              onPress={noop}
            />
            <Button label={t("저장")} iconName="save" onPress={noop} />
            <Button label={t("취소")} secondary onPress={noop} />
            <Button
              label={t("확인")}
              iconName="check"
              variant="tonal"
              onPress={noop}
            />
            <Button label={t("삭제")} danger iconName="trash" onPress={noop} />
            <Button
              label={t("다시 시도")}
              iconName="refresh"
              secondary
              onPress={noop}
            />
            <Button
              label={t("공유")}
              iconName="share"
              secondary
              onPress={noop}
            />
            <Button
              label={t("기록 받기")}
              iconName="download"
              quiet
              onPress={noop}
            />
          </div>
        </Panel>
        <Panel
          number="03"
          title={t("버튼 상태 \u00B7 작은 버튼")}
          detail={t("기본 / 누름 / 비활성 / 로딩 / 키보드 포커스 지원")}
        >
          <div className="buttons">
            <Button label={t("기본 상태")} testID="kit-normal" onPress={noop} />
            <Button
              label={t("비활성 상태")}
              testID="kit-disabled"
              disabled
              onPress={noop}
            />
            <Button
              label={t("저장 중")}
              testID="kit-busy"
              busy
              onPress={noop}
            />
            <Button label={t("보조 버튼")} secondary onPress={noop} />
            <Button label={t("조용한 버튼")} quiet onPress={noop} />
            <Button label={t("강조 버튼")} variant="tonal" onPress={noop} />
          </div>
          <div className="inline">
            <IconButton
              label={t("뒤로")}
              iconName="chevron-left"
              secondary
              onPress={noop}
            />
            <IconButton
              label={t("QR 코드")}
              iconName="qr"
              secondary
              onPress={noop}
            />
            <IconButton
              label={t("공유하기")}
              iconName="share"
              secondary
              onPress={noop}
            />
            <IconButton
              label={t("더 보기")}
              iconName="more"
              quiet
              onPress={noop}
            />
            <span className="step">
              <IconButton
                label={t("점수 줄이기")}
                testID="kit-minus"
                iconName="minus"
                secondary
                onPress={() => setCount(count - 1)}
              />
              <strong data-testid="kit-count">{count}</strong>
              <IconButton
                label={t("점수 늘리기")}
                testID="kit-plus"
                iconName="plus"
                onPress={() => setCount(count + 1)}
              />
            </span>
          </div>
          <p className="footnote">
            {t("일반 버튼 52px \u00B7 작은 버튼과 선택 도구 최소 48px")}
          </p>
        </Panel>
        <Panel
          number="04"
          title={t("입력창 \u00B7 검색 \u00B7 선택 도구")}
          detail={t("입력 / 오류 / 잠금 / 선택 상태를 공통 기준으로")}
        >
          <div className="fields">
            <Field
              label={t("검색")}
              leadingIcon="search"
              placeholder={t("골프장 이름을 검색하세요")}
              testID="kit-search"
            />
            <Field
              label={t("입력 오류")}
              error={t("이메일 주소를 확인해 주세요")}
              leadingIcon="mail"
              value="yamone@"
              onChangeText={noop}
            />
            <Field
              label={t("수정할 수 없는 값")}
              leadingIcon="lock"
              value={t("종료된 라운드")}
              editable={false}
            />
          </div>
          <div className="inline">
            {[t("전체"), t("18홀"), t("9홀"), t("기록 없음")].map((label) => (
              <Chip
                key={label}
                label={label}
                selected={chip === label}
                onPress={() => setChip(label)}
              />
            ))}
          </div>
          <div className="choices">
            <Choice
              label={t("선택 완료")}
              checked={choice}
              onPress={() => setChoice(!choice)}
            />
            <Choice label={t("선택 전")} checked={false} onPress={noop} />
            <Choice
              label={t("전반")}
              mode="radio"
              checked={radio === "front"}
              onPress={() => setRadio("front")}
            />
            <Choice
              label={t("후반")}
              mode="radio"
              checked={radio === "back"}
              onPress={() => setRadio("back")}
            />
            <Toggle
              label={t("켜짐 / 꺼짐")}
              value={toggle}
              onValueChange={setToggle}
            />
          </div>
        </Panel>
        <Panel
          number="05"
          title={t("공통 아이콘 43종")}
          detail={t(
            "24px 격자 \u00B7 1.8px 둥근 선 \u00B7 메뉴 / QR / 공유 / 기록 / 오류",
          )}
          wide
        >
          <div className="icons">
            {(Object.keys(iconPaths) as IconName[]).map((name) => (
              <div key={name}>
                <Icon name={name} size={30} />
                <small>{name}</small>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          number="06"
          title={t("스코어 기호 \u00B7 저장 상태")}
          detail={t("색상과 모양을 함께 사용해 의미를 구분")}
        >
          <div className="scoremarks">
            {[
              [4, t("파")],
              [3, t("버디\u00B7이글")],
              [5, t("보기")],
              [6, t("더블 이상")],
              [null, t("미입력")],
            ].map(([v, label]) => (
              <div key={label}>
                <div className="mark-scale">
                  <ScoreMark par={4} strokes={v as number | null} />
                </div>
                <small>{label}</small>
              </div>
            ))}
          </div>
          <div className="inline">
            {(
              [
                ["saved", t("저장됨")],
                ["draft", t("수정 중")],
                ["queued", t("전송 대기")],
                ["conflict", t("충돌 확인")],
                ["ended", t("종료됨")],
              ] as const
            ).map(([tone, label]) => (
              <StatusBadge key={tone} label={label} tone={tone} />
            ))}
          </div>
          <p className="footnote">
            {t("기존 규칙 유지: 버디\u00B7이글은 원 1개, 더블 이상은 네모 2개")}
          </p>
        </Panel>
        <Panel
          number="07"
          title={t("색상 \u00B7 글자 \u00B7 표면")}
          detail={t("포레스트 그린과 라임, 눈이 편한 페이퍼 배경")}
        >
          <div className="swatches">
            {["green", "lime", "mint", "paper", "ink", "error"].map((key) => (
              <div key={key}>
                <span
                  style={{ background: colors[key as keyof typeof colors] }}
                />
                <small>
                  {key}
                  <br />
                  {colors[key as keyof typeof colors]}
                </small>
              </div>
            ))}
          </div>
          <Txt style={{ fontSize: 27, lineHeight: 35, fontWeight: "800" }}>
            {t("좋은 라운드 되세요.")}
          </Txt>
          <Txt>{t("본문 16 / 24 \u00B7 한국어와 English")}</Txt>
          <Txt style={{ fontSize: 13, color: colors.muted }}>
            {t("도움말 13 \u00B7 카드 16px \u00B7 버튼 12px 모서리")}
          </Txt>
        </Panel>
        <Panel
          number="08"
          title={t("빈 화면 \u00B7 연결 \u00B7 결과 안내")}
          detail={t("앱에서 사용하는 문구를 그대로 담을 수 있는 벡터 그림 6종")}
          wide
        >
          <div className="artworks">
            {(Object.keys(artworkPaths) as ArtworkKind[]).map((kind, i) => (
              <div key={kind}>
                <StateArtwork kind={kind} width={190} />
                <strong>
                  {
                    [
                      t("골프장 없음"),
                      t("기록 없음"),
                      t("검색 결과 없음"),
                      t("오프라인"),
                      t("오류 발생"),
                      t("완료"),
                    ][i]
                  }
                </strong>
                <small>{kind}.svg</small>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          number="09"
          title={t("앱 적용 \u00B7 홈과 동작")}
          detail={t("공통 버튼\u00B7카드\u00B7아이콘으로 조합한 화면 예시")}
        >
          <Card>
            <div className="inline between">
              <div>
                <Txt
                  style={{ fontSize: 22, lineHeight: 30, fontWeight: "800" }}
                >
                  {t("오늘의 라운드를")}
                  <br />
                  {t("시작해 볼까요?")}
                </Txt>
              </div>
              <BrandMark size={64} />
            </div>
            <Txt style={{ color: colors.muted }}>
              {t("동반자와 함께, 한 홀씩 기록해요.")}
            </Txt>
            <Button
              label={t("라운드 방 만들기")}
              iconName="plus"
              onPress={noop}
            />
            <Button
              label={t("코드\u00B7QR로 방 참여하기")}
              iconName="qr"
              secondary
              onPress={noop}
            />
          </Card>
        </Panel>
        <Panel
          number="10"
          title={t("앱 적용 \u00B7 확인과 오류")}
          detail={t("삭제 같은 중요한 동작은 확인과 취소를 명확하게")}
        >
          <Card>
            <Txt style={{ fontSize: 20, fontWeight: "800" }}>
              {t("이 홀의 점수를 비울까요?")}
            </Txt>
            <Txt style={{ color: colors.muted }}>
              {t("입력 화면에서 저장하면 삭제가 반영됩니다.")}
            </Txt>
            <div className="buttons two">
              <Button label={t("취소")} secondary onPress={noop} />
              <Button
                label={t("점수 비우기")}
                danger
                iconName="trash"
                onPress={noop}
              />
            </div>
          </Card>
          <div className="notice">
            <Icon name="warning" color={colors.error} />
            <Txt style={{ color: colors.error, flex: 1 }}>
              {t("연결을 확인한 뒤 다시 시도해 주세요.")}
            </Txt>
          </div>
        </Panel>
      </div>
      <footer>
        {t(
          "YAMONE GOLF \u00B7 실제 앱 컴포넌트로 렌더링한 제작물 \u00B7 2026.10.26",
        )}
        <br />
        {t("앱 아이콘 / Android 테마 아이콘 / 스플래시 / SVG 원본 포함")}
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Gallery />);
