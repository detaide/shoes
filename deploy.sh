#!/usr/bin/env bash
# ═══════════════════════════════════════════
# shoes — Linux 一键部署脚本(前端 + 后端)
#
# 用法:
#   ./deploy.sh           # 安装依赖 + 编译 + 打包到 dist/ + 安装生产依赖
#   ./deploy.sh build     # 仅编译前后端
#   ./deploy.sh start     # 启动已部署的后端(前台)
#   ./deploy.sh stop      # 停止后台运行的后端
#   DASHSCOPE_API_KEY=sk-xxx ./deploy.sh   # 部署时注入密钥到 dist/server/.env
#
# 产物:
#   dist/server/  后端(已装生产依赖,可直接 node dist/index.js)
#   dist/client/  前端静态站点
# ═══════════════════════════════════════════

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT="$ROOT/client"
SERVER="$ROOT/server"
OUT="$ROOT/dist"
PID_FILE="$OUT/server/.run.pid"
ACTION="${1:-deploy}"

c_ok()   { printf "\033[32m✔ %s\033[0m\n" "$1"; }
c_info() { printf "\033[36m▶ %s\033[0m\n" "$1"; }
c_err()  { printf "\033[31m✖ %s\033[0m\n" "$1" >&2; }

require() {
  command -v "$1" >/dev/null 2>&1 || { c_err "缺少依赖:$1,请先安装"; exit 1; }
}

step_install() {
  c_info "安装依赖"
  [ -d "$CLIENT/node_modules" ] || (cd "$CLIENT" && npm install)
  [ -d "$SERVER/node_modules" ] || (cd "$SERVER" && npm install)
  c_ok "依赖就绪"
}

step_build() {
  c_info "编译前端"
  (cd "$CLIENT" && npm run build)
  c_info "编译后端"
  (cd "$SERVER" && npm run build)
  c_ok "编译完成"
}

rmrf() { rm -rf -- "$1"; }

copy_tree() {
  # copy_tree <src> <dest>  (跳过 node_modules / .vite)
  local src="$1" dest="$2"
  mkdir -p "$dest"
  local entry s d
  for entry in "$src"/* "$src"/.*; do
    [ -e "$entry" ] || continue
    local base; base="$(basename "$entry")"
    case "$base" in
      node_modules|.vite|.|..) continue ;;
    esac
    s="$entry"; d="$dest/$base"
    if [ -d "$s" ]; then cp -r "$s" "$d"; else cp "$s" "$d"; fi
  done
}

step_deploy() {
  step_install
  step_build

  c_info "打包部署产物到 dist/"
  rmrf "$OUT"
  mkdir -p "$OUT/server" "$OUT/client"

  # 后端:编译产物 + package.json + .env
  copy_tree "$SERVER/dist" "$OUT/server/dist"
  cp "$SERVER/package.json" "$OUT/server/package.json"
  [ -f "$SERVER/.env.example" ] && cp "$SERVER/.env.example" "$OUT/server/.env.example"

  # 注入密钥(若提供)
  if [ -n "${DASHSCOPE_API_KEY:-}" ]; then
    {
      echo "PORT=${PORT:-3001}"
      echo "DASHSCOPE_API_KEY=$DASHSCOPE_API_KEY"
      echo "DASHSCOPE_BASE_URL=${DASHSCOPE_BASE_URL:-https://dashscope.aliyuncs.com}"
    } > "$OUT/server/.env"
    c_ok "已写入 dist/server/.env(含 DASHSCOPE_API_KEY)"
  elif [ ! -f "$OUT/server/.env" ]; then
    cp "$OUT/server/.env.example" "$OUT/server/.env" 2>/dev/null || true
    c_err "提示:未提供 DASHSCOPE_API_KEY,请编辑 dist/server/.env"
  fi

  # 前端:静态站点
  copy_tree "$CLIENT/dist" "$OUT/client"

  # 后端生产依赖
  c_info "安装后端生产依赖(--omit=dev)"
  (cd "$OUT/server" && npm install --omit=dev)

  cat > "$OUT/README.md" <<'EOF'
# shoes 部署产物

## 后端
  cd server && node dist/index.js        # http://localhost:3001
  (确保 .env 已配置 DASHSCOPE_API_KEY)

## 前端
  client/ 为静态站点。
  生产同源部署时,把 client/ 内容交由 nginx 托管,并把 /api 反代到后端;
  或用任意静态服务器(如 `npx serve client`)。

## 顺序:先后端,再前端。
EOF

  c_ok "部署完成 → $OUT"
  echo
  echo "  启动后端:  cd \"$OUT/server\" && node dist/index.js"
  echo "  托管前端:  npx serve \"$OUT/client\"  (或 nginx)"
  echo "  注入密钥:  DASHSCOPE_API_KEY=sk-xxx $0"
}

step_start() {
  [ -d "$OUT/server/dist" ] || { c_err "未找到 $OUT/server/dist,请先 $0 deploy"; exit 1; }
  c_info "后台启动后端 → http://localhost:${PORT:-3001}"
  (
    cd "$OUT/server"
    [ -f .env ] || { c_err "缺少 .env,请先配置 DASHSCOPE_API_KEY"; exit 1; }
    nohup node dist/index.js > server.log 2>&1 &
    echo $! > "$PID_FILE"
  )
  sleep 1
  c_ok "已启动(PID $(cat "$PID_FILE")),日志:$OUT/server/server.log"
}

step_stop() {
  if [ -f "$PID_FILE" ]; then
    local pid; pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && c_ok "已停止后端(PID $pid)"
    else
      c_err "进程 $pid 已不存在"
    fi
    rm -f "$PID_FILE"
  else
    c_err "未找到 PID 文件($PID_FILE)"
  fi
}

require node
require npm

case "$ACTION" in
  install)  step_install ;;
  build)    step_build ;;
  deploy)   step_deploy ;;
  start)    step_start ;;
  stop)     step_stop ;;
  *) c_err "未知动作:$ACTION"; echo "用法:$0 [install|build|deploy|start|stop]"; exit 1 ;;
esac
