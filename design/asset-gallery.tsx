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
    [chip, setChip] = useState("전체"),
    [count, setCount] = useState(4);
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">YAMONE GOLF · APP ASSET KIT</p>
          <h1>한눈에 보는 앱 에셋</h1>
          <p>로고부터 버튼, 입력 도구, 스코어와 안내 화면까지</p>
        </div>
        <div className="hero-brand">
          <BrandMark size={112} />
        </div>
      </header>
      <div className="grid">
        <Panel
          number="01"
          title="브랜드 · 시작 화면"
          detail="기존 깃발을 유지한 공통 로고와 기기별 아이콘"
        >
          <div className="brand-row">
            <BrandLockup size={96} />
            <BrandMark size={56} />
            <BrandMark size={56} monochrome />
          </div>
          <div className="brand-examples">
            <div>
              <img src="../assets/icon.png" className="launcher ios" />
              <small>앱 아이콘 · 1024px</small>
            </div>
            <div>
              <img src="../assets/icon.png" className="launcher android" />
              <small>Android 원형 마스크</small>
            </div>
            <div className="splash">
              <BrandLockup size={64} />
              <small>시작 화면 · 페이퍼 배경</small>
            </div>
          </div>
        </Panel>
        <Panel
          number="02"
          title="기본 버튼 · 주요 동작"
          detail="실제 텍스트와 벡터 아이콘 · 크기가 달라져도 선명하게"
        >
          <div className="buttons">
            <Button label="새 라운드" iconName="plus" onPress={noop} />
            <Button label="참여하기" iconName="qr" secondary onPress={noop} />
            <Button label="저장" iconName="save" onPress={noop} />
            <Button label="취소" secondary onPress={noop} />
            <Button
              label="확인"
              iconName="check"
              variant="tonal"
              onPress={noop}
            />
            <Button label="삭제" danger iconName="trash" onPress={noop} />
            <Button
              label="다시 시도"
              iconName="refresh"
              secondary
              onPress={noop}
            />
            <Button label="공유" iconName="share" secondary onPress={noop} />
            <Button
              label="기록 받기"
              iconName="download"
              quiet
              onPress={noop}
            />
          </div>
        </Panel>
        <Panel
          number="03"
          title="버튼 상태 · 작은 버튼"
          detail="기본 / 누름 / 비활성 / 로딩 / 키보드 포커스 지원"
        >
          <div className="buttons">
            <Button label="기본 상태" testID="kit-normal" onPress={noop} />
            <Button
              label="비활성 상태"
              testID="kit-disabled"
              disabled
              onPress={noop}
            />
            <Button label="저장 중" testID="kit-busy" busy onPress={noop} />
            <Button label="보조 버튼" secondary onPress={noop} />
            <Button label="조용한 버튼" quiet onPress={noop} />
            <Button label="강조 버튼" variant="tonal" onPress={noop} />
          </div>
          <div className="inline">
            <IconButton
              label="뒤로"
              iconName="chevron-left"
              secondary
              onPress={noop}
            />
            <IconButton
              label="QR 코드"
              iconName="qr"
              secondary
              onPress={noop}
            />
            <IconButton
              label="공유하기"
              iconName="share"
              secondary
              onPress={noop}
            />
            <IconButton label="더 보기" iconName="more" quiet onPress={noop} />
            <span className="step">
              <IconButton
                label="점수 줄이기"
                testID="kit-minus"
                iconName="minus"
                secondary
                onPress={() => setCount(count - 1)}
              />
              <strong data-testid="kit-count">{count}</strong>
              <IconButton
                label="점수 늘리기"
                testID="kit-plus"
                iconName="plus"
                onPress={() => setCount(count + 1)}
              />
            </span>
          </div>
          <p className="footnote">
            일반 버튼 52px · 작은 버튼과 선택 도구 최소 48px
          </p>
        </Panel>
        <Panel
          number="04"
          title="입력창 · 검색 · 선택 도구"
          detail="입력 / 오류 / 잠금 / 선택 상태를 공통 기준으로"
        >
          <div className="fields">
            <Field
              label="검색"
              leadingIcon="search"
              placeholder="골프장 이름을 검색하세요"
              testID="kit-search"
            />
            <Field
              label="입력 오류"
              error="이메일 주소를 확인해 주세요"
              leadingIcon="mail"
              value="yamone@"
              onChangeText={noop}
            />
            <Field
              label="수정할 수 없는 값"
              leadingIcon="lock"
              value="종료된 라운드"
              editable={false}
            />
          </div>
          <div className="inline">
            {["전체", "18홀", "9홀", "기록 없음"].map((label) => (
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
              label="선택 완료"
              checked={choice}
              onPress={() => setChoice(!choice)}
            />
            <Choice label="선택 전" checked={false} onPress={noop} />
            <Choice
              label="전반"
              mode="radio"
              checked={radio === "front"}
              onPress={() => setRadio("front")}
            />
            <Choice
              label="후반"
              mode="radio"
              checked={radio === "back"}
              onPress={() => setRadio("back")}
            />
            <Toggle
              label="켜짐 / 꺼짐"
              value={toggle}
              onValueChange={setToggle}
            />
          </div>
        </Panel>
        <Panel
          number="05"
          title="공통 아이콘 43종"
          detail="24px 격자 · 1.8px 둥근 선 · 메뉴 / QR / 공유 / 기록 / 오류"
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
          title="스코어 기호 · 저장 상태"
          detail="색상과 모양을 함께 사용해 의미를 구분"
        >
          <div className="scoremarks">
            {[
              [4, "파"],
              [3, "버디·이글"],
              [5, "보기"],
              [6, "더블 이상"],
              [null, "미입력"],
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
                ["saved", "저장됨"],
                ["draft", "수정 중"],
                ["queued", "전송 대기"],
                ["conflict", "충돌 확인"],
                ["ended", "종료됨"],
              ] as const
            ).map(([tone, label]) => (
              <StatusBadge key={tone} label={label} tone={tone} />
            ))}
          </div>
          <p className="footnote">
            기존 규칙 유지: 버디·이글은 원 1개, 더블 이상은 네모 2개
          </p>
        </Panel>
        <Panel
          number="07"
          title="색상 · 글자 · 표면"
          detail="포레스트 그린과 라임, 눈이 편한 페이퍼 배경"
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
            좋은 라운드 되세요.
          </Txt>
          <Txt>본문 16 / 24 · 한국어와 English</Txt>
          <Txt style={{ fontSize: 13, color: colors.muted }}>
            도움말 13 · 카드 16px · 버튼 12px 모서리
          </Txt>
        </Panel>
        <Panel
          number="08"
          title="빈 화면 · 연결 · 결과 안내"
          detail="앱에서 사용하는 문구를 그대로 담을 수 있는 벡터 그림 6종"
          wide
        >
          <div className="artworks">
            {(Object.keys(artworkPaths) as ArtworkKind[]).map((kind, i) => (
              <div key={kind}>
                <StateArtwork kind={kind} width={190} />
                <strong>
                  {
                    [
                      "골프장 없음",
                      "기록 없음",
                      "검색 결과 없음",
                      "오프라인",
                      "오류 발생",
                      "완료",
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
          title="앱 적용 · 홈과 동작"
          detail="공통 버튼·카드·아이콘으로 조합한 화면 예시"
        >
          <Card>
            <div className="inline between">
              <div>
                <Txt
                  style={{ fontSize: 22, lineHeight: 30, fontWeight: "800" }}
                >
                  오늘의 라운드를
                  <br />
                  시작해 볼까요?
                </Txt>
              </div>
              <BrandMark size={64} />
            </div>
            <Txt style={{ color: colors.muted }}>
              동반자와 함께, 한 홀씩 기록해요.
            </Txt>
            <Button label="라운드 방 만들기" iconName="plus" onPress={noop} />
            <Button
              label="코드·QR로 방 참여하기"
              iconName="qr"
              secondary
              onPress={noop}
            />
          </Card>
        </Panel>
        <Panel
          number="10"
          title="앱 적용 · 확인과 오류"
          detail="삭제 같은 중요한 동작은 확인과 취소를 명확하게"
        >
          <Card>
            <Txt style={{ fontSize: 20, fontWeight: "800" }}>
              이 홀의 점수를 비울까요?
            </Txt>
            <Txt style={{ color: colors.muted }}>
              입력 화면에서 저장하면 삭제가 반영됩니다.
            </Txt>
            <div className="buttons two">
              <Button label="취소" secondary onPress={noop} />
              <Button
                label="점수 비우기"
                danger
                iconName="trash"
                onPress={noop}
              />
            </div>
          </Card>
          <div className="notice">
            <Icon name="warning" color={colors.error} />
            <Txt style={{ color: colors.error, flex: 1 }}>
              연결을 확인한 뒤 다시 시도해 주세요.
            </Txt>
          </div>
        </Panel>
      </div>
      <footer>
        YAMONE GOLF · 실제 앱 컴포넌트로 렌더링한 제작물 · 2026.10.26
        <br />앱 아이콘 / Android 테마 아이콘 / 스플래시 / SVG 원본 포함
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Gallery />);
