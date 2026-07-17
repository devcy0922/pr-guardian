# 브랜치 네이밍 규칙

## 형식
```
<type>/<author>_<issue-id>-<description>
```

## 구성 요소 및 규격
- `<type>`: 아래 허용 타입 중 하나 선택 (`feature`, `hotfix`, `bugfix`, `release`)
- `<author>`: 작업자 영문 명 (예: `john`, `jane`)
- `<issue-id>`: **Jira 이슈 ID 필수 (대문자 알파벳 + 대시 + 숫자 형식, 예: `GA-1234`)**
- `<description>`: 간단한 작업 요약 (하이픈 `-` 구분)

## 허용 타입
- `feature/` : 새 기능 개발
- `hotfix/` : 긴급 수정
- `bugfix/` : 일반 버그 수정
- `release/` : 릴리즈 준비

## 예시
- `feature/john_GA-1234-add-health-check`
- `hotfix/jane_GA-5678-fix-auth-crash`

## 금지
- `main`, `develop`, `master` 직접 작업
- 타입 prefix 없는 브랜치명
- Jira 이슈 ID (`<issue-id>`) 누락 혹은 형식 불일치 (예: `GA1234` 또는 `ga-1234`로 기재 시 자동 검증 실패)
- 한글 브랜치명
