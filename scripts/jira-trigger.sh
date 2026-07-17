#!/bin/bash
# 🎫 Jira Cloud 이슈 생성 스크립트
# Usage: ./jira-trigger.sh "이슈 제목" "이슈 상세 설명"

set -euo pipefail

# 프로젝트 루트의 .env 파일 로드
if [ -f "../.env" ]; then
  set -a
  source ../.env
  set +a
elif [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

# 필수 환경변수 확인
: "${JIRA_BASE_URL:?JIRA_BASE_URL을 설정하세요}"
: "${JIRA_EMAIL:?JIRA_EMAIL을 설정하세요}"
: "${JIRA_API_TOKEN:?JIRA_API_TOKEN을 설정하세요}"
: "${JIRA_PROJECT_KEY:?JIRA_PROJECT_KEY를 설정하세요}"
: "${JIRA_ISSUE_TYPE_ID:?JIRA_ISSUE_TYPE_ID를 설정하세요}"

JIRA_BASE_URL=${JIRA_BASE_URL%/}

SUMMARY=${1:-"GOVAIL PR Guardian 자동 리뷰 테스트"}
DESCRIPTION=${2:-"PR Guardian의 8대 체크리스트 파이프라인 검증을 위한 테스트 이슈입니다."}

# ADF (Atlassian Document Format) payload 구성
PAYLOAD=$(cat <<EOF
{
  "fields": {
    "project": {
      "key": "$JIRA_PROJECT_KEY"
    },
    "summary": "$SUMMARY",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "$DESCRIPTION"
            }
          ]
        }
      ]
    },
    "issuetype": {
      "id": "$JIRA_ISSUE_TYPE_ID"
    }
  }
}
EOF
)

AUTH=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)

echo "⏳ Jira 이슈 생성 요청 중..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  --request POST \
  --url "$JIRA_BASE_URL/rest/api/3/issue" \
  -H "Authorization: Basic $AUTH" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_STATUS" -eq 201 ]; then
  KEY=$(echo "$HTTP_BODY" | grep -o '"key":"[^"]*' | grep -o '[^"]*$')
  URL=$(echo "$HTTP_BODY" | grep -o '"self":"[^"]*' | grep -o '[^"]*$')
  echo "✅ Jira 이슈 생성 성공!"
  echo "🔑 이슈 키: $KEY"
  echo "🔗 API 주소: $URL"
  echo "🌐 브라우저 주소: $JIRA_BASE_URL/browse/$KEY"
else
  echo "❌ Jira 이슈 생성 실패 (HTTP $HTTP_STATUS)"
  echo "상세 에러:"
  echo "$HTTP_BODY"
  exit 1
fi
