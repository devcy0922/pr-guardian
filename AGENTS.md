# AI Agent Rules Entry Point

이 프로젝트는 구조화된 AI 에이전트 규칙(Agent Rules)을 사용합니다. 
에이전트는 작업 분석 또는 수행을 시작하기 전에 반드시 아래의 가이드라인 진입점 파일을 최우선으로 로드하십시오.

## 📌 규칙 진입점 (Entry Point)

- **부트스트림 규칙**: [L1-00-bootstream.md](file:///Users/studio-server/srv/pr-guardian/agents/rules/L1-00-bootstream.md)
- **규칙 화이트리스트 인덱스**: [rules.md](file:///Users/studio-server/srv/pr-guardian/agents/rules/rules.md)

## 🚨 보안 및 격리 알림 (Security Alert)

- 이 레포지토리의 세부 로컬 개발 규칙(`L2-*.md`) 및 도메인 규칙(`L3-*.md`)은 개인 정보 및 환경 보안을 위해 Git 추적에서 격리(`.gitignore` 처리)되어 있습니다.
- 에이전트는 규칙 수정 또는 추가 작업 시 어떠한 민감 정보(사설 IP, API 키 등)도 퍼블릭 추적 대상 파일에 기록해서는 안 됩니다.
