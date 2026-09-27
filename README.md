# PR Guardian

> **개인화된 GitHub / Jira 워크플로우를 위한 딥 체킹 코드 리뷰 엔진 & MCP 서버**

PR Guardian은 단순한 diff 요약기를 넘어, 프로젝트 컨텍스트와 이슈 요구사항을 완벽하게 이해하고 GitHub Copilot 수준의 구체적인 코드 개선안(`suggestion`)을 도출하며, PM 워크플로우를 자동으로 동기화하는 지능형 가드레일 시스템입니다.

---

## 핵심 목적 (Purpose)

1. **요구사항 ↔ 코드 간 삼각 추적성 (Traceability)**
   - Issue / Jira AC ↔ PR 개발 계획 ↔ 실제 diff 비교를 통해 누락된 요구사항(Gaps)과 범위 초과 구현(Scope Creep)을 사전에 감지합니다.
2. **원클릭 커밋 가능한 Actionable Code Suggestions**
   - GitHub UI 상에서 즉시 반영 가능한 ````suggestion` 마크다운 블록을 생성하여 리뷰 반영 비용을 최소화합니다.
3. **PM 워크플로우 자동화 (PM Automation)**
   - PR 브랜치/이슈/Jira 버전을 기반으로 라벨 부착, 마일스톤 매핑 및 신규 생성, GitHub ProjectV2 보드 카드 등록을 자동으로 수행합니다.
4. **이중 실행 모드 (Dual-Mode Operation)**
   - **MCP Server**: Claude Desktop, Cursor, Antigravity 등의 AI 환경에서 로컬 도구로 직접 호출.
   - **Webhook Service**: GitHub 웹훅 수신을 통한 비동기 자동 리뷰 및 코멘트 발행 엔진.

---

## 주요 기능

### 1. 3계층 체크리스트 파이프라인 (8대 검사 항목)

| 계층 | # | 검사 항목 | 판정 방식 | 동작 상세 |
|---|---|---|---|---|
| **Layer 0** | 1 | 수정 파일 분류 & 통계 | 정적 패턴 | 파일 확장자 기반 도메인 분류 및 락파일 필터링 |
| **Layer 0** | 2 | 테스트 코드 존재 여부 | 정적 패턴 | 테스트 파일 경로 매핑 및 유무 판정 |
| **Layer 1** | 3 | 보안성 위반 검증 | 하이브리드 | 정적 시크릿 패턴 검사 + 탐지 시 LLM 오탐 검증 |
| **Layer 1** | 4 | 컨벤션 준수 | 정적 패턴 | Conventional Commits 및 브랜치 명명 규칙 검증 |
| **Layer 2** | 5 | 비즈니스 의도 분석 | LLM 추론 | Why / What / Timing 심층 요약 |
| **Layer 2** | 6 | 요구사항 추적성 (Traceability) | LLM 추론 | 이슈 요구사항 vs PR 계획 vs 실제 코드 정합성 검증 |
| **Layer 2** | 7 | 테스트 코드 품질 평가 | LLM 추론 | 상태 전이, 경계값, Vitest 패턴 분석 및 등급(A~D) 부여 |
| **Layer 2** | 8 | 구체적 코드 개선 제안 | LLM 추론 | GitHub 원클릭 커밋 가능한 `suggestion` 블록 생성 |

### 2. PM 자동화 (Project & Milestone Automation)
- **라벨 자동화**: 브랜치 패턴(`feat/`, `fix/`, `docs/` 등) 및 변경 파일 분석을 통한 라벨 자동 부착
- **마일스톤 동기화**: Jira FixVersion 또는 브랜치 버전 태그를 GitHub Milestone과 자동 매핑 (`AUTO_PM_CREATE_MILESTONE=true` 시 신규 생성)
- **ProjectV2 연동**: GitHub GraphQL API를 통해 대상 Project 보드에 PR 카드를 자동으로 등록

### 3. 고성능 동시성 제어 & 복원력
- **동시성 풀링**: vLLM 큐 과부하 방지를 위한 `runWithConcurrency(tasks, 2)` 풀링 적용
- **다중 후보 JSON 파서**: LLM의 사고 과정(Thinking) 태그나 마크다운 서식이 혼재되어도 유효한 JSON을 완벽하게 추출
- **분산 락 (Redis)**: 다중 웹훅 및 중복 이벤트에 대한 락 제어로 리뷰 중복 실행 방지 (미설정 시 Fail-open)

### 4. 제로 트러스트 보안 격리
- 레포지토리 설정과 로컬 데이터는 `.gitignore` 처리된 `data/repositories.json` 및 `outputs/`에 격리되어 민감 정보 노출을 원천 차단합니다.

---

## MCP 도구 명세

| 도구명 | 파라미터 | 설명 |
|---|---|---|
| `list_repositories` | 없음 | 등록된 관리 대상 레포지토리 목록 및 설정 조회 |
| `add_repository` | `owner`, `repo`, `issueTracker`, `defaultBranch` | 신규 레포지토리 등록 (GitHub/Jira 트래커 지정) |
| `remove_repository` | `owner`, `repo` | 등록된 레포지토리 삭제 |
| `run_review` | `owner`, `repo`, `pullNumber`, `publishComment` | 지정한 레포의 특정 PR 번호에 대해 즉시 딥 체킹 리뷰 실행 |
| `list_pull_requests` | `owner`, `repo`, `state`, `limit` | 대상 레포의 열려있는 PR 목록 및 메타데이터 조회 |

---

## 프로젝트 구조

```
pr-guardian/
├── agents/
│   └── rules.md                # 에이전트 작업 및 아키텍처 규칙
├── src/
│   ├── checklist/              # 3계층 체크리스트 검사 모듈 (L0, L1, L2)
│   ├── analyzer.ts             # PR 변경점 및 파일 분석
│   ├── collector.ts            # GitHub / Jira 데이터 수집기
│   ├── github.ts               # GitHub REST & GraphQL API 클라이언트
│   ├── jira.ts                 # Jira API 클라이언트
│   ├── llm.ts                  # vLLM / OpenAI 호환 LLM 클라이언트 (동시성 & 파서)
│   ├── lock.ts                 # Redis 기반 분산 락
│   ├── mcp-server.ts           # MCP Stdio 서버 진입점
│   ├── pipeline.ts             # 체크리스트 파이프라인 조율기
│   ├── pm-automation.ts        # 라벨, 마일스톤, ProjectV2 자동화
│   ├── publisher.ts            # GitHub 코멘트 발행 및 기존 코멘트 정리
│   ├── report.ts               # 마크다운 리뷰 리포트 생성기
│   ├── repository-store.ts     # 격리된 레포지토리 설정 저장소
│   ├── reviewer.ts             # 코어 리뷰 오케스트레이터
│   └── webhook.ts              # GitHub Webhook 라우팅 및 시그니처 검증
├── tests/                      # Vitest 기반 단위/통합 테스트 슈트
├── architecture.md             # 상세 시스템 아키텍처 문서
├── docker-compose.yml          # 컨테이너 오케스트레이션
└── package.json
```

---

## 빠른 시작

### 1. 의존성 설치 및 환경 설정

```bash
# 의존성 패키지 설치
pnpm install

# 환경 설정 파일 복사 및 구성
cp .env.example .env
```

`.env` 핵심 설정값:
```env
# GitHub 연동
GITHUB_TOKEN=ghp_...
GITHUB_WEBHOOK_SECRET=your_secret

# LLM Gateway
LLM_GATEWAY_URL=http://localhost:8000/v1
LLM_MODEL=qwen3-8b
LLM_API_KEY=your_key

# PM Automation (선택)
AUTO_PM_ENABLED=true
AUTO_PM_PROJECT_NUMBER=1
AUTO_PM_CREATE_MILESTONE=false

# Redis Lock (선택)
REDIS_URL=redis://localhost:6379
```

### 2. 실행 모드 선택

#### A. MCP 서버로 실행 (Claude Desktop, Cursor, Antigravity)
```bash
pnpm mcp
```

MCP 클라이언트(`claude_desktop_config.json` 등) 설정 예시:
```json
{
  "mcpServers": {
    "pr-guardian": {
      "command": "node",
      "args": [
        "--env-file=/srv/demo/pr-guardian/.env",
        "--import",
        "tsx",
        "/srv/demo/pr-guardian/src/mcp-server.ts"
      ]
    }
  }
}
```

#### B. GitHub Webhook 서비스로 실행
```bash
# 로컬 개발 모드
pnpm dev

# Docker Compose 프로덕션 구동
docker-compose up -d --build
```

---

## 테스트 및 품질 검증

PR Guardian은 엄격한 검증 기준을 따릅니다:

```bash
# 1. 전체 단위 및 E2E Mock 테스트 (Vitest)
pnpm test

# 2. TypeScript 타입 체크
pnpm lint

# 3. 프로덕션 빌드
pnpm build
```

---

## 관련 문서

- [시스템 아키텍처 명세서](file:///srv/demo/pr-guardian/architecture.md)
- [에이전트 작업 규칙](file:///srv/demo/pr-guardian/agents/rules.md)

---

## 라이선스

MIT License
