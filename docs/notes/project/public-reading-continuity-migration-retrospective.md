# Public reading continuity React migration 작업 회고

이 문서는 Public reading continuity React migration 전체 과정을 돌아보고,
다음 대형 작업에서 시간과 검증 비용을 줄이기 위한 실행 규칙을 정리한다.
구현 결과를 설명하는 문서가 아니라 **작업 방식을 개선하기 위한 참고 문서**다.

관련 문서:

- [구현 계획](public-reading-continuity-implementation-plan.md)
- [renderer 비교 근거](evidence/public-renderer-comparison.md)
- [cutover·rollback·clean-host 근거](evidence/public-site-cutover.md)

## 한눈에 보는 결론

| 아쉬웠던 점 | 실제 영향 | 다음에는 |
| --- | --- | --- |
| 검증 도구가 안정되기 전에 비싼 증거를 만들었다 | 도구를 고칠 때마다 같은 후보를 다시 측정했다 | 검증 도구의 실패 조건부터 확정한 뒤 증거를 한 번 만든다 |
| 전체 브랜치 리뷰가 최종 cutover 증거 뒤에 왔다 | 코드가 다시 바뀌어 local·clean-host 증거를 다시 봉인했다 | 전체 리뷰를 최종 증거 바로 전에 배치한다 |
| Task 15의 프로세스 종료 조건을 처음부터 충분히 정의하지 못했다 | cleanup·PID·process group 관련 수정이 여러 차례 이어졌다 | 성공보다 실패·중단·지연 상황을 먼저 테스트한다 |
| 보고서 숫자를 사람이 옮겼다 | 기능은 맞는데 숫자와 표현만 고치는 커밋이 생겼다 | 숫자는 machine receipt에서 만들고 문서에는 해석만 쓴다 |
| 최종 `main` 실행 환경 확인이 늦었다 | 오래된 `node_modules`와 없는 ignored build 때문에 검증이 두 번 실패했다 | merge 전후에 환경 준비 상태만 먼저 확인하고 전체 gate는 한 번 실행한다 |
| 의존성 보안 확인이 마지막에 왔다 | high 경고 5건을 이미 봉인된 migration과 분리해 남겨야 했다 | 시작할 때 audit 결과를 기록하고, migration과 함께 고칠지 별도 작업으로 둘지 결정한다 |
| 통과한 증거와 아직 측정하지 못한 항목이 여러 문서에 흩어졌다 | 현재 상태를 파악하는 데 시간이 들었다 | 하나의 상태표에서 `passed`, `blocked`, `not_measured`를 함께 관리한다 |

## 숫자로 본 반복 비용

기준 범위는 migration 시작 commit 다음부터 최종 merge commit까지다.

- 전체 commit: 75개
- `fix`: 30개
- `test`: 20개
- `docs`: 11개

commit 수가 많다는 사실 자체가 문제는 아니다. 다만 renderer 비교 구간에서는
검증 도구 수정과 후보 재측정이 번갈아 나왔고, Task 15에서는 프로세스 정리
조건을 보완할 때마다 cutover 증거를 다시 만들었다. 이 두 구간은 다음 작업에서
순서를 바꾸면 반복을 크게 줄일 수 있다.

## 무엇이 비효율적이었나

### 1. 증거를 너무 일찍 만들었다

renderer 후보와 cutover 결과는 소스, 설정, 검증 도구에 묶여 있다. 그런데 이번
작업에서는 첫 증거를 만든 뒤 검증 도구의 허점이 발견됐다. 도구를 고치면 이전
증거를 그대로 최종 근거로 쓸 수 없어 같은 후보를 다시 측정해야 했다.

다음에는 아래 순서를 지킨다.

1. 먼저 검증 도구가 잘못된 입력을 거부하는지 테스트한다.
2. 경로 이탈, symlink, 중간 종료, 오래된 프로세스처럼 실패하기 쉬운 상황을 넣는다.
3. 검증 도구 리뷰를 끝낸다.
4. 그 뒤에만 실제 후보 측정이나 clean-host 증거를 만든다.

핵심은 **증거를 만드는 도구부터 안정시킨다**는 것이다.

### 2. 전체 리뷰가 비싼 최종 증거보다 늦었다

Task 15 증거가 만들어진 뒤 전체 브랜치 리뷰에서 다음 문제가 발견됐다.

- public release allowlist의 symlink 경계
- published review·travel의 공개 안전 조건
- article collection의 기존 정렬 순서

수정은 필요했고 결과도 좋아졌지만, app과 release source hash가 바뀌어 local
cutover와 clean-host 증거를 최종 소스에 맞춰 다시 봉인해야 했다.

다음에는 리뷰 순서를 아래처럼 바꾼다.

```text
기능 구현 → focused 검증 → task 리뷰 → 전체 브랜치 리뷰
→ 소스 동결 → 성능·cutover·clean-host 최종 증거
```

전체 리뷰 뒤에는 원칙적으로 문서와 machine receipt만 바꾼다. 코드나 build
설정이 다시 바뀌면 어떤 증거가 영향을 받았는지부터 계산하고, 영향받은 증거만
다시 만든다.

### 3. Task 15가 뒤늦게 프로세스 관리 작업으로 커졌다

처음에는 React → Astro → React 전환 확인이 중심이었지만 실제로는 다음 조건까지
안전해야 했다.

- controller와 child process를 정확히 구분하기
- 재사용된 PID를 다른 프로세스로 오인하지 않기
- process group 전체가 끝났는지 확인하기
- listener 조회 결과가 비어 있거나 늦게 나오는 경우 처리하기
- 신호를 받은 뒤에도 정리와 실패 근거를 남기기
- macOS의 `/tmp`와 `/private/tmp`를 같은 실제 경로로 판단하기

이 조건들이 구현 중에 하나씩 드러나면서 수정 차수가 늘었다.

다음에는 full cutover drill 전에 작은 실패 주입 테스트를 만든다.

- 시작 직후 실패
- build 중 실패
- preview 준비 지연
- 빈 PID/listener 결과
- 자식 프로세스가 늦게 종료되는 상황
- `SIGINT`, `SIGTERM` 수신
- cleanup 대상 경로가 허용 범위를 벗어나는 상황

이 작은 테스트가 모두 통과한 뒤 local drill 1회, clean-host proof 1회만 수행한다.

### 4. 보고서 숫자와 실제 증거가 분리돼 있었다

Task 8과 Task 11에서는 기능 문제가 아니라 migration 수, 브라우저 결과 표현 같은
보고서 내용을 나중에 바로잡았다. 사람이 여러 결과를 문서로 옮기면 숫자가
어긋날 가능성이 커진다.

다음에는 아래 값을 JSON receipt 한 곳에서 읽어 문서를 만든다.

- route 수와 성공·실패 수
- desktop·mobile case 수
- source·config·lockfile hash
- 실행 명령과 Node·browser 버전
- `passed`, `failed`, `blocked`, `not_measured`

Markdown에는 숫자를 다시 계산하지 않고, 결과의 의미와 남은 경계만 설명한다.
숫자나 문구만 고쳤고 소스 hash가 같다면 전체 validate나 브라우저 검증을 다시
돌리지 않는다.

### 5. 최종 실행 환경 준비를 늦게 확인했다

fast-forward merge 뒤 `main`의 첫 validate는 오래된 `node_modules` 때문에
workspace package를 찾지 못했다. `npm ci` 뒤에는 ignored
`build/public-releases`가 없어 다시 멈췄다. 소스 결함은 아니었지만 전체 gate를
시작하기 전에 알 수 있는 환경 문제였다.

다음에는 전체 gate 직전에 가벼운 준비 확인을 둔다.

1. Node가 정확히 24인지 확인한다.
2. `package-lock.json`과 설치 상태가 맞는지 확인한다.
3. 검증이 요구하는 ignored·generated 입력 목록을 확인한다.
4. 필요한 공식 build 명령으로만 입력을 만든다.
5. 준비가 끝난 뒤 전체 gate를 한 번 실행한다.

준비 확인은 test나 build를 대신하지 않는다. 실패 원인을 환경과 코드로 빠르게
나누기 위한 단계다.

### 6. 의존성 위험을 마지막에 확인했다

최종 `npm audit`에서 retained Astro/build 도구 체인에 high 경고 5건이 남았다.
자동 수정은 Astro, Sharp, Rollup 주변의 넓은 변경을 요구했고, 이미 승인된 정확
버전과 cutover 증거를 다시 열게 만들었다. 그래서 이번 migration에 억지로 섞지
않고 별도 위험으로 남겼다.

다음 작업 시작 시에는 아래 세 가지를 함께 기록한다.

- 현재 경고 수와 직접·간접 의존성 구분
- 자동 수정이 바꾸는 package 수와 주요 package
- 이번 작업에 포함할지, 별도 maintenance 작업으로 둘지

보안 수정이 넓은 framework 변경을 요구하면 기능 migration 중간에 끼우지 않는다.
별도 branch에서 호환성 검증과 함께 처리한다.

### 7. 상태가 여러 곳에 흩어졌다

브라우저 성능, local cutover, clean-host, production 권한 경계가 각각 다른
보고서와 receipt에 있었다. 모든 문서는 필요했지만, 현재 상태를 한 번에 보기가
어려웠다.

다음에는 작업 ledger 첫 화면에 아래 표를 유지한다.

| 항목 | 상태 | 묶인 source hash | 다시 실행하는 조건 |
| --- | --- | --- | --- |
| focused test | pending/passed/failed | code hash | 관련 code 변경 |
| browser matrix | pending/passed/failed | UI·route hash | 화면 동작 또는 CSS 변경 |
| performance | pending/passed/not_measured | build·route hash | 성능 관련 source·config 변경 |
| local cutover | pending/passed/failed | app·harness hash | app 또는 harness 변경 |
| clean-host | pending/passed/failed | commit·lock hash | 최종 commit 또는 lock 변경 |
| production observation | blocked/passed | release ID | 실제 권한과 관찰 조건 충족 |

## 다음 작업의 기본 진행 순서

### 0. 시작 카드 작성

작업을 시작할 때 한 화면짜리 카드를 만든다.

- 목표와 하지 않을 일
- 현재 branch·worktree·source SHA
- Node·package manager 버전
- 수정 허용 범위
- 필요한 검증과 각 검증의 비용
- production·publish·delete처럼 별도 승인이 필요한 작업
- 시작 시점의 audit와 알려진 경고

### 1. 계약과 실패 조건 먼저 확정

기능의 happy path뿐 아니라 경계, cleanup, rollback, 잘못된 입력을 먼저 적는다.
비싼 proof harness는 이 단계에서 독립 리뷰를 받는다.

### 2. Task별 최소 반복

각 Task는 원칙적으로 아래 한 묶음으로 끝낸다.

```text
RED 1회 → focused GREEN 1회 → 필요한 browser matrix 1회
→ 전체 gate 1회 → 독립 리뷰 1회
```

리뷰 지적은 재현 테스트를 먼저 만들고 해당 항목만 고친다. 수정 뒤에는 전체를
다시 돌리지 않고 그 결함이 닿는 가장 작은 범위만 재검증한다.

### 3. 전체 리뷰 뒤 소스 동결

모든 기능 Task가 끝나면 먼저 전체 브랜치 리뷰를 한다. Critical·Important와
로컬에서 고칠 수 있는 위험을 해결한 다음 source SHA를 동결한다. 성능,
cutover, clean-host 같은 비싼 최종 증거는 그 SHA에 대해서만 만든다.

### 4. 최종 증거와 보고서 생성

machine receipt에는 최소한 아래 값을 넣는다.

- source SHA
- lockfile SHA
- build config SHA
- proof harness SHA
- route inventory SHA
- 정확한 실행 명령
- Node·browser·OS 정보
- 결과와 남은 `blocked`·`not_measured`

사람용 보고서는 receipt를 링크하고 해석만 덧붙인다.

### 5. merge와 push

1. 원격 변경과 main의 사용자 파일을 read-only로 확인한다.
2. fast-forward 가능 여부를 확인한다.
3. 최종 검증을 통과한 동일 SHA를 main에 합친다.
4. source와 lockfile이 같다면 같은 전체 gate를 의미 없이 반복하지 않는다.
5. push 뒤 `git ls-remote`로 로컬·원격 SHA가 같은지 확인한다.

## 재검증 판단표

| 변경 | 다시 실행할 것 | 재사용할 것 |
| --- | --- | --- |
| 보고서 숫자·표현만 수정 | 문서 link, receipt 일치, `git diff --check` | test, browser, build, performance |
| unit 대상 code 변경 | 해당 RED/GREEN | 관련 없는 browser·performance |
| UI 동작·CSS 변경 | focused test와 해당 route desktop/mobile | 다른 route와 clean-host |
| route·build config 변경 | route inventory, 해당 browser, build 관련 gate | 관계없는 unit evidence |
| proof harness 변경 | harness failure test, 영향받은 proof 1회 | app source가 같은 browser evidence |
| source·config hash가 모두 같음 | 아무 것도 다시 실행하지 않음 | 봉인된 기존 증거 전체 |
| source hash는 바뀌었지만 증거 입력과 무관함 | 영향 관계 확인과 문서 기록 | 무관함이 확인된 기존 증거 |
| 최종 동결 SHA가 바뀜 | 영향을 받는 최종 proof만 | hash가 유지된 별도 proof |

## 반복 중단 기준

아래 조건이면 같은 검증을 더 돌리지 않는다.

- 관련 source·config·lock·harness hash가 이전 통과 시점과 같다.
- 실패가 아니라 보고서 표현만 바뀌었다.
- 동일 화면의 screenshot을 이미 같은 viewport와 build에서 확보했다.
- 구체적인 결함 없이 “확실히 하기 위해” 전체 validate를 다시 돌리려는 상황이다.
- production 권한이 없어 결과가 달라질 수 없는 작업이다.

재실행하려면 “어떤 변경이 어떤 기존 증거를 무효화했는가”를 한 문장으로 먼저
적는다. 이 문장을 적을 수 없다면 재실행하지 않는다.

## 유지할 좋은 방식

이번 작업에서 계속 가져갈 방식도 분명하다.

- 증거가 없으면 `passed`로 꾸미지 않고 `blocked` 또는 `not_measured`로 남겼다.
- source와 receipt를 hash로 묶어 오래된 증거를 최종 근거로 잘못 쓰지 않았다.
- production 권한을 push 승인으로 확대 해석하지 않았다.
- main의 사용자 파일과 sibling baseline worktree를 보존했다.
- 마지막에는 local main과 remote main SHA를 직접 비교했다.
- 독립 리뷰 지적을 실제 재현 테스트와 작은 수정으로 닫았다.

목표는 검증을 줄이는 것이 아니라 **같은 신뢰도를 더 적은 반복으로 얻는 것**이다.

## 현재 남은 후속 항목

이 회고 작성 시점의 경계다.

- Task 16과 Astro 제거: 실제 production cutover·rollback·observation 권한과
  조건이 생길 때만 진행한다.
- retained Astro/build 의존성 high 경고 5건: 별도 dependency maintenance
  작업에서 호환성 검증과 함께 처리한다.
- review cover 17건의 재배포 권리 경고: 출처별 권리 확인 없이는 자동으로
  통과 처리하지 않는다.
- changed-run machine environment와 exact-command provenance:
  기존 기록대로 `not_measured`를 유지한다.

## 다음 작업 시작 체크리스트

- [ ] Node·branch·worktree·dirty state를 먼저 확인했다.
- [ ] 목표, 제외 범위, 승인 경계를 한 화면에 적었다.
- [ ] 시작 시 audit와 기존 경고를 분류했다.
- [ ] 비싼 증거보다 검증 도구 리뷰를 먼저 배치했다.
- [ ] 각 Task의 RED·GREEN·browser·gate·review 횟수를 정했다.
- [ ] receipt에 source·config·lock·harness hash가 들어간다.
- [ ] 전체 브랜치 리뷰를 최종 cutover proof보다 앞에 둔다.
- [ ] 재실행 전에 무효화된 changed surface를 한 문장으로 적는다.
- [ ] 권한이 없는 운영 항목은 `blocked`로 남긴다.
- [ ] merge 후 local·remote SHA를 비교한다.
