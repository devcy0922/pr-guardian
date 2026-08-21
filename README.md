# 🛡️ PR Guardian

> **개인화된 GitHub / Jira 워크플로우를 위한 딥 체킹 코드 리뷰 엔진 & MCP 서버**

PR Guardian은 단순한 diff 요약기를 넘어, 프로젝트 컨텍스트와 이슈 요구사항을 완벽하게 이해하고 GitHub Copilot 수준의 구체적인 코드 개선안(`suggestion`)을 도출하는 지능형 가드레일 시스템입니다.

---

## 🌟 주요 특징

1. **개인 맞춤형 워크플로우 (Personalized Workflow)**
   - 대규모 서비스화 대신 개인 개발 환경에 최적화된 **MCP(Model Context Protocol)** 도구 제공.
   - Claude, Cursor, Antigravity 등의 AI 환경에서 직접 호출하여 특정 레포지토리와 PR을 즉시 리뷰.

2. **1차/2차 다중 이슈 트래커 지원**
   - **1차 (GitHub Mode):** GitHub Issue 요구사항 ↔ PR 개발 계획 ↔ 실제 코드 변경점 삼각 추적 (`flevo` 등).
   - **2차 (Jira Mode):** Jira Issue AC ↔ 커밋/브랜치 ↔ 코드 변경점 추적 및 마일스톤/프로젝트 보드 자동 연동.

3. **Copilot 수준의 Actionable Code Suggestions**
   - 대용량 파일(`openapi.json`, `pnpm-lock.yaml`) 스마트 필터링.
   - GitHub UI에서 원클릭으로 커밋 가능한 `suggestion` 마크다운 코드 블록 자동 생성.

4. **제로 트러스트 보안 격리 (Zero-Trust Security)**
   - 모든 레포지토리 설정과 로컬 데이터는 `.gitignore` 처리된 `data/repositories.json`에 안전하게 격리되어 퍼블릭 레포 노출을 원천 차단합니다.

5. **초고속 vLLM 게이트웨이 풀링 & 복원력**
   - 2개 동시성 풀링(`runWithConcurrency`)으로 vLLM 큐 병목 해소.
   - 사고 과정(Thinking) 혼재 시에도 완벽하게 유효한 JSON을 찾아내는 다중 후보 파서 탑재.

---

## 🛠️ MCP 도구 명세

| 도구명 | 파라미터 | 설명 |
|---|---|---|
| `list_repositories` | 없음 | 등록된 관리 대상 레포지토리 목록 및 설정 조회 |
| `add_repository` | `owner`, `repo`, `issueTracker`, `defaultBranch` | 신규 레포지토리 등록 (GitHub/Jira 트래커 지정) |
| `remove_repository` | `owner`, `repo` | 등록된 레포지토리 삭제 |
| `run_review` | `owner`, `repo`, `pullNumber`, `publishComment` | 지정한 레포의 특정 PR 번호에 대해 즉시 딥 체킹 리뷰 실행 |
| `list_pull_requests` | `owner`, `repo`, `state`, `limit` | 대상 레포의 열려있는 PR 목록 및 메타데이터 조회 |

---

## 🚀 빠른 시작

### 1. 환경 변수 설정
```bash
cp .env.example .env
# .env 파일을 열어 GitHub Token, Jira Token, LLM Gateway URL 설정
```

### 2. MCP 서버 실행
```bash
# MCP Stdio 서버 실행
pnpm mcp
```

### 3. CLI 및 테스트 실행
```bash
# 전체 단위/통합 테스트 (Vitest)
pnpm test

# 빌드
pnpm build
```

---

## 📊 8대 체크리스트

| # | 검사 항목 | 판정 계층 | 동작 방식 |
|---|---|---|---|
| 1 | 비즈니스 의도 분석 | Layer 2 | Why / What / Timing 심층 요약 |
| 2 | 요구사항 추적성 (Traceability) | Layer 2 | 이슈 요구사항 vs PR 계획 vs 실제 코드 정합성 검증 |
| 3 | 보안성 위반 검증 | Layer 1 | 정적 시크릿 패턴 검사 + LLM 기반 오탐 필터링 |
| 4 | 컨벤션 준수 | Layer 1 | Conventional Commit 및 브랜치 규칙 검증 |
| 5 | 테스트 코드 존재 여부 | Layer 0 | 정적 테스트 경로 매핑 |
| 6 | 테스트 코드 품질 평가 | Layer 2 | 상태 전이, 경계값, Vitest 패턴 분석 및 등급(A~D) 부여 |
| 7 | 수정 파일 분류 & 통계 | Layer 0 | 파일 확장자 기반 도메인 분류 |
| 8 | 구체적 코드 개선 제안 | Layer 2 | GitHub 원클릭 커밋 가능한 `suggestion` 블록 생성 |

---

## 📄 라이선스

MIT License
