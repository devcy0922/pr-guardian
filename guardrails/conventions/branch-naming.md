# 브랜치 네이밍 규칙

## 형식
```
<type>/<author>_<issue-id>-<description>
```

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
- 한글 브랜치명
