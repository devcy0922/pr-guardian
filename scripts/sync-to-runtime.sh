#!/bin/bash
# 로컬 워크스테이션에서 실행 서버로 최신 소스를 동기화한다.

set -euo pipefail

: "${SYNC_SOURCE_DIR:?SYNC_SOURCE_DIR을 설정하세요}"
: "${SYNC_TARGET:?SYNC_TARGET을 설정하세요}"

echo "⏳ 실행 서버로 소스 코드 동기화 중..."
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='outputs' \
  --exclude='.gemini' \
  --exclude='*.log' \
  --exclude='server.log' \
  "${SYNC_SOURCE_DIR%/}/" \
  "${SYNC_TARGET%/}/"

echo "✅ 동기화 완료!"
