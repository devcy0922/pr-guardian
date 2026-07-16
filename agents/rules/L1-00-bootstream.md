# L1-00-bootstream

**MANDATORY**: 이 파일은 pr-guardian 레포지토리에서 에이전트가 가장 먼저 읽어야 하는 부트스트림 규칙이다.

## 0. 역할

- `agents/rules/` 디렉토리는 본 레포지토리의 AI 에이전트 제어 규칙의 독립적 저장소다.
- `agents/rules/rules.md`는 활성화 및 로딩할 규칙의 Whitelist를 관리하는 인덱스다.
- `agents/state/`는 Git 추적에서 격리된 로컬 작업 상태 폴더다.

## 1. 필수 로딩 순서

작업 시작 시 아래 순서대로 규칙을 로드하고 준수한다.

1. `agents/rules/L1-00-bootstream.md` (본 파일: 진입 및 뼈대 규약)
2. `agents/rules/rules.md` (인덱스 로드)
3. `agents/rules/L2-00-common.md` (공통 규칙)
4. `agents/rules/L2-02-pr-guardian.md` (개발 가이드 및 환경)
5. `agents/rules/L3-10-pr-guardian.md` (도메인 비즈니스 규칙 및 검증 파이프라인)

## 2. 보안 및 격리 정책

- **로컬 보안 격리**: `L2-*.md` 및 `L3-*.md` 파일은 Git 추적 대상에서 제외(`.gitignore`)되어 있다.
- **민감 정보 금지**: 퍼블릭 공유가 가능한 `rules.md`와 `L1-*.md` 파일에는 사설 IP, API 토큰, 사내 호스트명 등 어떠한 자원 정보도 포함하지 않는다.

## 3. 충돌 우선순위

규칙 충돌 시 아래의 우선순위를 엄격히 적용한다.

1. 사용자의 최신 명시 지시 (현재 대화 세션)
2. 시스템 전역 프롬프트 (user_global) 규칙
3. 로컬 도메인 룰 (`L3-*`)
4. 공통 룰 (`L2-*`)
5. 부트스트림 룰 (`L1-*`)
