# 🧠 AI Agent Rules — pr-guardian

> 🚨 **[WHITELIST GATE]** 이 파일에 명시된 규칙 파일만 순서대로 로드할 것.
> `rules/` 디렉토리 내의 다른 파일을 자동 스캔하거나 임의로 읽는 것을 **엄격히 금지**한다.

---

## ✅ 반드시 읽어야 할 파일 (순서대로)

| 순서 | 파일 | 용도 |
|---|---|---|
| 1 | `agents/rules/L1-00-bootstream.md` | 에이전트 부트스트림 및 규칙 로딩 순서 규약 |
| 2 | `agents/rules/L2-00-common.md` | **[Git 격리]** 공통 행동 양식 및 퍼블릭 레포 보안 규칙 |
| 3 | `agents/rules/L2-02-pr-guardian.md` | **[Git 격리]** PR Guardian 개발 환경 및 CLI/빌드 가이드 |
| 4 | `agents/rules/L3-10-pr-guardian.md` | **[Git 격리]** GitHub Webhook 및 8대 체크리스트 도메인 규칙 |

---

## 🚫 로드 금지 (타 프로젝트 규칙 방지)

- 이 레포 외부의 어떠한 규칙 파일도 로드하지 않는다.
- `L2-*.md` 및 `L3-*.md` 파일은 Git 추적에서 제외(격리)되어 있으므로 로컬 개발 세션 외부로 유출을 금지한다.

---

## 📌 이전 세션 커서 처리

> 🚨 **[L0 ABSOLUTE OVERRIDE]** 이전 세션에서 넘겨받은 `EXECUTION CURSOR`가 존재하면, 재분석 없이 지정된 단 1개의 액션만 수행 후 다음 에이전트에 핸드오프한다.
