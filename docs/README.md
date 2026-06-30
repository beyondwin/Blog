# Archive Docs

`docs/`는 이 저장소의 내부 지식 라이브러리다. source capture, curated note, generated navigation, metadata를 분리해서 보관한다.

## Layout

- `_inbox/`: 아직 분류하지 않은 local intake.
- `raw/`: 원문 wording, transcript, exported PDF 변환본처럼 provenance가 중요한 source capture.
- `notes/`: 사람이 다듬은 curated document. 장기 보관의 기준 layer다.
- `wiki/`: `raw`와 `notes`를 바탕으로 만든 generated navigation.
- `_index/`: [INDEX.md](INDEX.md)를 관리하기 위한 catalog와 topic metadata.
- `_graph/`: graph artifact 설명. Graphify runtime output은 repo root의 `graphify-out/`에 둔다.

## Source Of Truth

충돌하는 정보가 있으면 아래 순서로 판단한다.

1. `raw/`의 원본 자료.
2. `notes/`의 curated note.
3. 질문이 executor-skill 구현 이력에 관한 경우, 해당 skill의 experiment record.
4. `wiki/`나 `graphify-out/`의 generated summary와 relationship map.

generated layer는 빠른 길찾기용이다. 중요한 답변은 source file, curated note, claim을 만든 spec/plan까지 거슬러 올라가 확인한다.

## Version Control

track하는 것:

- durable source document.
- curated note.
- index metadata.
- generated layer를 설명하는 lightweight README.

track하지 않는 것:

- local intake.
- private raw capture.
- generated wiki pages.
- `graphify-out/`.
- 임시 작업 plan.

## Intake Workflow

1. 새 자료를 `_inbox/`에 둔다.
2. 원문이 중요한 자료는 `raw/`에 보존한다.
3. 읽고 정리한 결과를 `notes/<topic>/`으로 승격한다.
4. `_index/catalog.yml`, `_index/topics.yml`, `INDEX.md`를 갱신한다.
5. navigation이 필요할 만큼 바뀌었으면 `wiki/`나 `graphify-out/`을 갱신한다.

작업 계획이나 agent scratch file은 그대로 catalog에 넣지 않는다. 장기적으로 읽을 가치가 있는 문서로 정리된 뒤에만 curated note가 된다.

## Graphify

Graphify는 source of truth가 아니라 graph navigation layer다.

설치 또는 실행 확인:

```bash
uvx --from graphifyy graphify --help
```

Codex 연동:

```bash
uvx --from graphifyy graphify codex install
```

graph 갱신:

```bash
graphify update .
```

architecture나 codebase 질문에 답하기 전에는 `graphify-out/GRAPH_REPORT.md`를 읽고, 중요한 claim은 `docs/raw/` 또는 `docs/notes/`에서 다시 확인한다.
