#!/bin/bash
# Local (M1 Max) -> Mac mini 최신 소스 및 설정 동기화 스크립트

echo "⏳ Mac mini 서버로 소스 코드 동기화 중..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='outputs' \
  --exclude='.gemini' \
  --exclude='*.log' \
  --exclude='server.log' \
  /Users/studio-server/srv/pr-guardian/ \
  macmini:~/srv/pr-guardian/

echo "✅ 동기화 완료!"
