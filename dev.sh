#!/usr/bin/env bash
# Avvia database (porta 5433), backend (8081) e frontend (5174) in locale.
# Ctrl+C chiude backend e frontend; il database resta su: docker compose down per fermarlo.
set -euo pipefail
set -m

root="$(cd "$(dirname "$0")" && pwd)"
backend_pid=""
frontend_pid=""

stop() {
  [[ -n "$backend_pid" ]] && kill -TERM -"$backend_pid" 2>/dev/null || true
  [[ -n "$frontend_pid" ]] && kill -TERM -"$frontend_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap stop EXIT INT TERM

# Meglio fermarsi subito con un messaggio chiaro che far partire solo metà dello stack
for porta in 8081 5174; do
  if pid="$(lsof -tiTCP:"$porta" -sTCP:LISTEN 2>/dev/null | head -1)" && [[ -n "$pid" ]]; then
    echo "Porta $porta occupata da: $(ps -o command= -p "$pid" | cut -c1-80)" >&2
    echo "Fermalo con: kill $pid" >&2
    exit 1
  fi
done

(cd "$root/edodoc-backend" && docker compose up -d --wait db)
[[ -d "$root/edodoc-frontend/node_modules" ]] || (cd "$root/edodoc-frontend" && npm install)

echo "Backend  → http://localhost:8081"
echo "Frontend → http://localhost:5174"
echo "Accesso  → edoardo@edodoc.it / 0000 (solo in locale)"
echo "Ctrl+C per fermare."
echo

(cd "$root/edodoc-backend" && ./mvnw spring-boot:run) &
backend_pid=$!

(cd "$root/edodoc-frontend" && npm run dev) &
frontend_pid=$!

wait
