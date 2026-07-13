# PR Guardian Prompt & Guardrail Guide

PR Guardian의 규칙 파일들은 LLM의 정확한 인식을 위해 다음과 같은 구조화된 포맷을 권장합니다.

## 규칙 구조화 템플릿 (XML 태그 활용)

LLM의 컨텍스트 분리를 명확히 하기 위해 마크다운 헤더와 함께 XML 태그 형식을 혼용하는 것이 정확도 향상에 유리합니다.

```markdown
# [규칙 명칭]

<rule-context>
이 규칙이 검사하는 대상 도메인과 배경을 설명합니다.
</rule-context>

<detection-patterns>
- [ ] 위반 사례 1: 구체적인 코드 패턴 제시
- [ ] 위반 사례 2
</detection-patterns>

<recommendation>
위반 시 LLM이 반환해야 하는 해결 가이드라인 포맷을 지정합니다.
</recommendation>
```

## 예시: `guardrails/conventions/code-style.md` 고도화안
```markdown
# 코드 스타일 가이드

<rule-context>
TypeScript strict 모드 및 any 타입 금지를 모니터링합니다.
</rule-context>

<detection-patterns>
- `as any` 캐스팅 사용
- `let`으로 선언 후 변경되지 않는 변수 (const 권장)
- 타입 명시가 누락된 public 함수 시그니처
</detection-patterns>

<recommendation>
"TypeScript Strict Violation: any 대신 명확한 인터페이스 또는 unknown을 사용하세요."
</recommendation>
```
