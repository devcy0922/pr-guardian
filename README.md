# PR Guardian

GitHub PR 생성 시 웹훅으로 트리거되어, LLM 기반 자동 코드 리뷰를 실행하고 결과를 PR 코멘트로 작성하는 서비스.

## 아키텍처

```
GitHub ──webhook──▶ PR Guardian ──▶ govail-gateway ──▶ vLLM/MLX
                         │
                         └──▶ GitHub API (코멘트 작성)
```

### 파이프라인

```
collect → analyze → assemble → validate → publish
                       ↑            ↓ fail
                       └── retry (max 1)
```

## 8가지 체크리스트

| # | 항목 | 계층 | LLM |
|---|---|---|---|
| 1 | 작업 요약 | Layer 2 | ✅ |
| 2 | 컨벤션 준수 | Layer 1 | 조건부 |
| 3 | 보안성 위반 | Layer 1 | 조건부 |
| 4 | 플랜 문서 존재 | Layer 0 | ❌ |
| 5 | 테스트 코드 존재 | Layer 0 | ❌ |
| 6 | 테스트 코드 평가 | Layer 2 | ✅ |
| 7 | 수정 파일 분류 | Layer 0 | ❌ |
| 8 | 플랜 ↔ 작업 일치 | Layer 2 | ✅ |

- **Layer 0**: 정규식/패턴 — LLM 호출 0회
- **Layer 1**: 정규식 먼저, 필요 시 LLM — 0~1회
- **Layer 2**: LLM 필수 — 각 1회, 최대 512 토큰

## 설치

```bash
pnpm install
```

## 개발

```bash
# .env 설정
cp .env.example .env
# 편집하여 실제 값 입력

# 개발 서버
pnpm dev

# 테스트
pnpm test

# 빌드
pnpm build
```

## 환경 변수

| 변수 | 설명 | 예시 |
|---|---|---|
| `GITHUB_WEBHOOK_SECRET` | GitHub 웹훅 시크릿 | `your_secret` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_...` |
| `LLM_GATEWAY_URL` | LLM 게이트웨이 URL | `http://<YOUR_GATEWAY_IP>:4000` |
| `LLM_MODEL` | 사용할 모델 | `qwen3-8b` |
| `LLM_API_KEY` | 게이트웨이 API 키 | `your_key` |
| `PORT` | 서버 포트 | `3000` |

## Docker 배포

```bash
docker compose up -d
```

## 가드레일

`guardrails/` 디렉토리에서 리뷰 기준을 관리합니다:

- `conventions/` — 커밋 메시지, 브랜치 네이밍, 코드 스타일
- `skills/` — PR 본문 작성, 테스트 커버리지, 보안 체크

가드레일 파일을 수정하면 다음 리뷰부터 자동 반영됩니다.

## 라이선스

MIT
