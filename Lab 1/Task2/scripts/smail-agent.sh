#!/bin/bash
# smail-agent.sh — Task2 launchd 자동 실행 제어 + 데이터 삭제 (피드백 메시지 포함)
# 사용법:
#   bash scripts/smail-agent.sh start     # 매시간 자동 실행 시작
#   bash scripts/smail-agent.sh stop      # 자동 실행 중지 (등록 파일 유지)
#   bash scripts/smail-agent.sh remove    # 자동 실행 완전 제거 (등록 파일 삭제)
#   bash scripts/smail-agent.sh status    # 상태 확인
#   bash scripts/smail-agent.sh purge     # ⚠️ 로컬 PRIVATE 데이터(메일·초안·원장·로그) 전부 삭제
# (npm 별칭: npm run mail:agent -- <cmd>)
set -u

LABEL="com.personal.nju-smail-sync"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/$LABEL.plist"
TEMPLATE="$PROJECT_DIR/launchd/agent.plist.example"
DATA_HOME="${NJU_SMAIL_DATA_HOME:-$HOME/Library/Application Support/NJUSmail}"

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
      echo "ℹ️  이미 자동 실행 중입니다 (매시간 대기)."
    else
      launchctl bootstrap "gui/$(id -u)" "$PLIST"
      if is_active; then
        echo "✅ 자동 실행 시작 — 매시간 mail:sync (fetch·아카이빙·초안 생성). 발송은 절대 자동으로 하지 않습니다."
      else
        echo "❌ 시작 실패 — 확인: launchctl print gui/$(id -u)/$LABEL"
        exit 1
      fi
    fi
    ;;
  stop)
    if is_active; then
      launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
      if ! is_active; then
        echo "🛑 자동 실행 중지 (등록 파일 유지 — 재시작: bash scripts/smail-agent.sh start)"
      else
        echo "❌ 중지 실패 — 확인: launchctl print gui/$(id -u)/$LABEL"
        exit 1
      fi
    else
      echo "ℹ️  이미 중지 상태입니다."
    fi
    ;;
  remove)
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
    rm -f "$PLIST"
    if is_active || [ -f "$PLIST" ]; then
      echo "❌ 제거 실패 — 남은 항목 확인:"
      is_active && echo "  (서비스가 아직 등록됨)"
      [ -f "$PLIST" ] && echo "  (plist 남음: $PLIST)"
      exit 1
    else
      echo "🗑️  자동 실행 완전 제거됨. (로컬 데이터·Keychain은 그대로 — 지우려면: purge)"
    fi
    ;;
  status)
    if is_active; then
      echo "▶️  자동 실행: 켜짐 (매시간)"
    elif [ -f "$PLIST" ]; then
      echo "⏸️  자동 실행: 중지됨 (등록 파일 존재 — start 로 재개)"
    else
      echo "❌ 자동 실행: 제거됨 (등록 파일 없음)"
    fi
    echo "   데이터 홈: $DATA_HOME $( [ -d "$DATA_HOME" ] && echo '(존재)' || echo '(없음)' )"
    ;;
  purge)
    # 되돌릴 수 없는 삭제 — 명시적 확인 요구. 자동 실행은 먼저 멈춘다.
    echo "⚠️  다음 로컬 PRIVATE 데이터를 '전부' 삭제합니다 (되돌릴 수 없음):"
    echo "     $DATA_HOME"
    echo "     → 아카이브된 메일 원문, 초안, 원장(ledger), 상태, 로그, usage 기록"
    echo "   (Keychain 자격증명과 서버(smail)의 메일·Drafts는 삭제하지 않습니다.)"
    if [ ! -d "$DATA_HOME" ]; then
      echo "ℹ️  데이터 홈이 이미 없습니다. 할 일 없음."
      exit 0
    fi
    printf "정말 삭제하려면 정확히 'DELETE' 를 입력하세요: "
    read -r ans
    if [ "$ans" != "DELETE" ]; then
      echo "취소됨 — 아무것도 지우지 않았습니다."
      exit 1
    fi
    if is_active; then
      launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
      echo "  (자동 실행을 먼저 중지했습니다)"
    fi
    rm -rf "$DATA_HOME"
    if [ -d "$DATA_HOME" ]; then
      echo "❌ 삭제 실패 — 남아 있음: $DATA_HOME"
      exit 1
    fi
    echo "🗑️  로컬 데이터 전부 삭제됨: $DATA_HOME"
    echo "   다음 mail:sync는 first-run(커서 초기화만, 백필 없음)으로 다시 시작합니다."
    ;;
  *)
    echo "사용법: bash scripts/smail-agent.sh {start|stop|remove|status|purge}"
    exit 1
    ;;
esac
