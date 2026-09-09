#!/bin/bash
# nju-agent.sh — launchd 자동 실행 제어 (피드백 메시지 포함)
# 사용법:
#   bash scripts/nju-agent.sh start     # 자동 실행 시작
#   bash scripts/nju-agent.sh stop      # 자동 실행 중지 (등록 파일 유지)
#   bash scripts/nju-agent.sh remove    # 완전 제거 (등록 파일 삭제)
#   bash scripts/nju-agent.sh status    # 상태 확인
set -u

LABEL="com.personal.nju-ehall-sync"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/$LABEL.plist"
TEMPLATE="$PROJECT_DIR/launchd/agent.plist.example"

is_active() {
  launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1
}

ensure_plist() {
  if [ ! -f "$PLIST" ]; then
    mkdir -p "$PLIST_DIR"
    python3 - "$TEMPLATE" "$PLIST" "$PROJECT_DIR" <<'PY'
import sys, pathlib
template, out, proj = sys.argv[1], sys.argv[2], sys.argv[3]
pathlib.Path(out).write_text(pathlib.Path(template).read_text().replace('__PROJECT__', proj))
PY
    echo "  plist 생성됨: $PLIST"
  fi
}

cmd="${1:-status}"
case "$cmd" in
  start)
    ensure_plist
    if is_active; then
      echo "ℹ️  이미 자동 실행이 시작되어 있습니다 (매일 08:00 / 20:00 대기 중)."
    else
      launchctl bootstrap "gui/$(id -u)" "$PLIST"
      if is_active; then
        echo "✅ 자동 실행이 시작되었습니다. (매일 08:00 / 20:00, Mac 로컬 시간)"
      else
        echo "❌ 시작 실패 — 아래를 확인하세요:"
        echo "   launchctl print gui/$(id -u)/$LABEL"
        exit 1
      fi
    fi
    ;;
  stop)
    if is_active; then
      launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
      if ! is_active; then
        echo "🛑 자동 실행이 중지되었습니다. (등록 파일은 유지 — 다시 시작하려면: bash scripts/nju-agent.sh start)"
      else
        echo "❌ 중지 실패 — 아래를 확인하세요:"
        echo "   launchctl print gui/$(id -u)/$LABEL"
        exit 1
      fi
    else
      echo "ℹ️  이미 중지되어 있습니다. (실행 중이 아니었음)"
    fi
    ;;
  remove)
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
    rm -f "$PLIST"
    if is_active || [ -f "$PLIST" ]; then
      echo "❌ 제거 실패 — 남아 있는 항목 확인:"
      launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && echo "  (서비스가 아직 등록됨)"
      [ -f "$PLIST" ] && echo "  (plist 파일이 남아 있음: $PLIST)"
      exit 1
    else
      echo "🗑️  자동 실행이 완전히 제거되었습니다."
      echo "   (로컬 PRIVATE DB·Keychain·GitHub 데이터는 그대로 유지됩니다)"
    fi
    ;;
  status)
    if is_active; then
      echo "▶️  자동 실행 상태: 켜짐 (active) — 매일 08:00 / 20:00에 실행 예정"
    else
      if [ -f "$PLIST" ]; then
        echo "⏸️  자동 실행 상태: 중지됨 (등록 파일은 존재 — bash scripts/nju-agent.sh start 로 시작 가능)"
      else
        echo "❌ 자동 실행 상태: 제거됨 (등록 파일 없음)"
      fi
    fi
    ;;
  *)
    echo "사용법: bash scripts/nju-agent.sh {start|stop|remove|status}"
    exit 1
    ;;
esac
