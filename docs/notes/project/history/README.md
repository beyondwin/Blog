# 레거시 종료 기록

Astro, Public Atlas, Visual Storyworld, reading continuity, 구 URL compatibility는
지원하지 않는다. 복구 명령도 없다.

이 판단의 source는 [ADR-0007](../adr/0007-form-and-thought-react-only-editorial-system.md)이다.
superseded ADR-0002, 0003, 0004, 0006은 결정 이력이고, 아래 폴더는 당시 설계·계획·증거다.
현재 작업은 [프로젝트 문서](../README.md), `DESIGN.md`, [아키텍처 레퍼런스](../architecture-reference.md)를 따른다.

| 종료한 것 | 남긴 기록 |
| --- | --- |
| Astro renderer와 rollback | [구현 계획](form-and-thought-implementation-plan.md), [제거 증거](evidence/form-and-thought-astro-removal-manifest.md) |
| Next.js 후보 | [renderer 비교](evidence/public-renderer-comparison.md), `spikes/rejected/site-next/` |
| Public Atlas / Staged Aperture | [vertical slice 설계](visual-storyworld-public-atlas-design.md), [시안](assets/public-atlas/README.md) |
| mineral reading continuity | [연속 독서 설계](public-reading-continuity-design.md) |
| 완료된 전환 계획 | 이 폴더의 나머지 설계·계획·ledger |

현재 로컬 수락 증거는 [최종 acceptance](../evidence/form-and-thought-final-acceptance.md)다.
production origin은 `not_measured`, cutover 권한은 `false`다.
