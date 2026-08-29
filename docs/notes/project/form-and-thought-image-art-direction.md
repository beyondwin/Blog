# FORM & THOUGHT 이미지 아트 디렉션

- 상태: approved generation and integration policy
- 날짜: 2026-08-29
- 승인 근거: [ADR-0007](adr/0007-form-and-thought-react-only-editorial-system.md),
  [ADR-0008](adr/0008-full-bleed-density-and-topic-media.md)
- reference manifest: [assets/form-and-thought-reference/manifest.yml](assets/form-and-thought-reference/manifest.yml)

## 목적

대표 이미지가 필요한 아티클과 홈을 하나의 시각 세계로 묶되, 동일한 건축 공간 공식을 반복하지 않고 각 글의 핵심 주장과 행동을 식별 가능하게 만든다. 이미지는 콘텐츠의 근거를 대신하지 않으며 FORM & THOUGHT의 black/terracotta/off-white 편집 지면에 맞아야 한다.

## 공통 이미지 문법

- palette, 자연광, 낮은 채도와 충분한 negative space를 공유한다.
- 소재는 사람·행동, 도구·작업대, 데이터·구조, 경계·증거, 디자인·재료, 읽기·사유로 분산한다.
- architectural minimalism은 하나의 subject formula가 아니라 framing과 restraint의 guardrail이다.
- 넓은 면과 한두 개의 강한 선은 허용하지만 모든 글의 주 피사체로 반복하지 않는다.
- warm off-white, terracotta, near-black, deep brown.
- 낮은 채도와 자연광, 선명한 그림자.
- 한 명의 작은 인물 또는 책·컵·의자·식물 같은 단일 정물.
- 여백이 충분하고 텍스트를 얹을 영역이 명확한 구도.
- photoreal 또는 tactile editorial collage. 한 세트 안에서 스타일을 섞지 않는다.

## 금지

- 화면 안 글자, 로고, UI, watermark.
- neon, glossy 3D, purple/blue AI gradient.
- 여러 의미 없는 사물로 채운 stock-photo composition.
- 근거 없는 기술 diagram, 코드 화면, 제품 logo.
- 책 표지 재창작.
- 실제 인물의 닮은 얼굴을 허가 없이 생성.
- 기존 사진의 출처·권리를 덮어쓰는 생성 이미지.

## 콘텐츠별 방향

### 에이전트와 코딩 도구

반복되는 로봇, 터미널, 회로 대신 규율·경계·작업 흐름을 사람의 행동, 작업대, 문, 선, evidence object와 제한된 공간 은유로 표현한다. 같은 건축 공간이 연속되지 않게 한다.

### 디자인과 UI

grid, crop, paper, material sample, 빛이 만든 면을 사용한다. 완성된 가짜 앱 화면을 생성하지 않는다.

### 데이터와 검색

거리, 층, 교차, 정렬, 분기 같은 관계를 사용한다. 실제 글에 근거한 구조 diagram은 사용할 수 있지만 가짜 dashboard나 근거 없는 graph를 만들지 않는다.

### 서평

판본 identity와 public redistribution rights가 모두 승인된 실제 책 표지가 우선이다. 권리가 warning/hold/unverified이면 bytes를 public artifact에 넣지 않고 text-led variant를 사용한다. 보조 정물이 필요하면 책, 메모, 빛, 테이블 정도로 제한하며 특정 책의 표지를 재현하지 않는다.

### 생각

한 장의 조용한 이미지 또는 text-only paper cell을 사용한다. 미래 빈 cell을 채우기 위한 이미지는 생성하지 않는다.

## 아티클 세트 다양성

- 공개 article 17개 모두에 핵심 주장, 금지 오독, image family와 retain/replace 근거가 있는 brief를 만든다.
- featured media가 없는 네 article은 새 media 후보가 필요하다.
- 기존 asset도 의미 식별력이 약하거나 반복성이 크면 새 ID로 교체한다.
- 목록에서 연속 세 article이 같은 family, camera distance 또는 주 피사체를 사용하지 않는다.
- 최종 contact sheet는 개별 품질뿐 아니라 전체 목록 rhythm을 함께 승인한다.

## 서평 표지 수집

- exact ISBN, publisher, edition label과 publication year를 candidate source와 대조한다.
- publisher/rightsholder media, reuse를 허용하는 official distributor/API, licensed repository 순으로 찾는다.
- 상품 페이지에 보인다는 사실만으로 redistribution approval을 추론하지 않는다.
- source URL, retrieved date, license/permission evidence, checksum과 dimensions를 기록한다.
- edition은 맞지만 redistribution evidence가 없으면 `hold`이며 public bytes를 만들지 않는다.
- 검색 thumbnail, 다른 판본, hotlink와 생성 표지는 사용하지 않는다.

## 생성 절차

1. 실제 콘텐츠의 핵심 주장과 금지된 오독을 한 문장씩 정리한다.
2. route slot의 target ratio와 text-safe area를 지정한다.
3. 같은 palette와 camera/light grammar로 후보를 만든다.
4. 후보를 동일 crop으로 정리한 contact sheet를 만든다.
5. 사용자에게 contact sheet를 보여 승인받는다.
6. 승인 전 후보 원본은 ignored local intake/output에 둔다. durable docs에는 승인 decision manifest와 승인 contact sheet만 남긴다.
7. 승인된 원본만 content asset bundle에 저장하고 public derivative는 release pipeline에서 생성한다.
8. docs-only decision manifest에 generator/model, prompt version, 생성일, 후보 ID, crop focal point, approval state, approver, approval evidence를 기록한다.
9. source `media.yml`에는 현재 검증 schema가 받는 checksum, dimensions, `sourcePath`, `rightsNote`, credit와 검증일을 기록한다. schema 확장 전에는 지원하지 않는 필드를 억지로 넣지 않는다.
10. `approvalState: approved`와 rights review가 docs decision manifest에서 확인되고 source media validation이 통과한 asset만 release에 포함한다.

## 파일 규칙

```text
# 승인 전, gitignored local intake
output/form-and-thought-image-candidates/<batch-id>/

# 승인 후 source of truth
src/assets/content/<collection>/<slug>/
  <asset-id>.png
  media.yml

# durable approval evidence
docs/notes/project/assets/form-and-thought-generated/<batch-id>/
  decision-manifest.yml
  approved-contact-sheet.png
```

- reference 원본은 `docs/notes/project/assets/form-and-thought-reference/`에만 보존하고 public site asset으로 직접 사용하지 않는다.
- 생성 후보는 approval 전 public release 경로에 넣지 않는다.
- 거절 후보 원본은 사용자가 별도 보존을 승인하지 않는 한 curated docs에 넣거나 stage하지 않는다.
- 기존 media를 덮어쓰지 않고 새 asset id를 만든다.
- optimized WebP/AVIF와 immutable public URL은 source asset과 별도로 release build가 만든 산출물이며 수동 편집하지 않는다.

## Route slot contract

| slot | desktop ratio | crop and safe area | mobile behavior |
| --- | --- | --- | --- |
| `homeHero` | 약 2.0–2.1:1 image field | subject는 오른쪽 또는 중앙, navigation과 hero copy 영역을 침범하지 않음 | 세로 crop에서도 subject와 주요 대각선 유지 |
| `homePick` | 1:1에 가까운 split 안 landscape | 중앙 60%에 핵심 형태, 텍스트는 별도 field | image가 text 앞에 오고 4:3 이내로 완화 |
| `indexLandscape` | 1.55–1.7:1 | 제목을 이미지 위에 올리지 않음 | 4:3 crop, focal point 유지 |
| `searchTopic` | 세 카드의 지정 폭에 맞춘 portrait/landscape | 작은 크기에서도 한 개의 명확한 형태 | 한 열에서 16:10 또는 text-only |
| `detailHero` | 2.0–2.2:1 전체 hero의 image field | split 경계 반대쪽에 text-safe 여백 | 4:3 또는 3:2, title 다음 순서 |
| `detailFigure` | 원본 비율 우선 | 본문 의미와 locator 보존 | 본문 다음 한 열, caption 동반 |
| `reviewCoverStage` | stage는 landscape row, rights-approved 표지는 원본 비율 | `contain`, crop 금지, edition identity와 redistribution rights를 모두 확인 | 미승인 표지는 stage/media 자체를 생략 |

같은 physical asset이 여러 slot을 담당할 수 있지만 각 placement의 derivative, focal point, safe area, mobile override는 decision manifest에 따로 기록한다.

## 승인 체크리스트

- 핵심 주장과 이미지 은유가 충돌하지 않는가.
- reference의 색, 여백, 빛과 같은 세트로 보이는가.
- 목록 crop과 detail crop 모두에서 주 피사체가 보이는가.
- text-safe area가 실제 제목 길이를 견디는가.
- 이미지 자체에 읽을 수 없는 가짜 글자가 없는가.
- source/provenance와 rights state가 기록됐는가.
- 서평 표지를 대체하거나 가짜 콘텐츠를 암시하지 않는가.
- article 목록에서 인접 asset이 같은 소재와 camera grammar를 반복하지 않는가.
- review cover의 exact edition과 redistribution evidence가 모두 있는가.
