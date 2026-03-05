---
name: terminal-runner
description: 'Use this skill whenever the user wants to run terminal commands, execute scripts, render/run a page or project, start/stop processes, run build tools, test runners, compilers, linters, servers, or any shell-based task — including multi-service projects like frontend + backend. Triggers on: "run this", "execute", "start the server", "render the page", "run tests", "build", "start the app", or any request implying shell execution. MANDATORY: Execute every terminal command step via the Bash tool (never run_terminal_cmd or alternatives). Always use this skill so commands are planned, tracked, and properly terminated at end of conversation.'
---
# *Terminal Runner Skill*

*Manages terminal command execution with cleanup, validation, phased startup.*

## *Core Rules*

1. ***Bash tool only** — every shell command goes through the Bash tool, no exceptions*
2. ***nohup + disown for all servers** —* `nohup bash -c '...' >> service.log 2>&1 & disown`
3. ***Split install and run** — never combine in one bash call (2-min timeout risk)*
4. ***Never assume ports** — always read config files, package.json, or ask the user*
5. ***Port conflict = use next free port** — never kill existing processes; find an available port instead. Do not detect ports upfront for scripts; run the command directly. Port detection applies only when starting servers; seek a free port only when a conflict occurs.*
6. ***Ask for workspace + remote_host** — never guess these*

---

## *Required Parameters*

- ***workspace**: Absolute path to the project (ask if not provided)*
- ***remote_host**: IP/hostname the user's browser uses to reach services (ask if not provided)*

---

## *Phase 0 — Detect Ports & Check Conflicts*

***Phase 0 applies only when starting servers** (frontend/backend). For script execution (e.g. `run scripts/foo.py`, `run deploy.sh`), skip Phase 0 — run the command directly. If a server fails due to port conflict, then seek a free port and retry.*

### *Frontend Port Detection*

```bash
# Vite config
PORT_FROM_VITE=$(grep -oP "(?<=port: )\d+" vite.config.* 2>/dev/null | head -1)

# package.json scripts
PORT_FROM_PKG=$(node -e "
  const p = require('./package.json');
  const s = Object.values(p.scripts||{}).join(' ');
  const m = s.match(/--port[= ](\d+)/);
  console.log(m ? m[1] : '');
" 2>/dev/null)

# .env
PORT_FROM_ENV=$(grep -oP "(?<=PORT=)\d+" .env 2>/dev/null | head -1)

FRONTEND_PORT=${PORT_FROM_VITE:-${PORT_FROM_PKG:-${PORT_FROM_ENV:-"unknown"}}}
echo "Detected frontend port: $FRONTEND_PORT"
```

### *Backend Port Detection*

*Never assume* `8000`*. Detect from framework config files, source code, and environment — in priority order:*

```bash
cd $WORKSPACE/backend

# --- .env / .env.* files ---
PORT_FROM_ENV=$(grep -oP "(?<=(PORT|APP_PORT|SERVER_PORT|BACKEND_PORT)=)\d+" \
  .env .env.local .env.production 2>/dev/null | head -1)

# --- Python: uvicorn CLI args in start scripts or Makefile ---
PORT_FROM_UVICORN=$(grep -rhoP "(?<=--port )\d+" Makefile *.sh start* run* 2>/dev/null | head -1)

# --- Python: uvicorn.run() call inside source ---
PORT_FROM_UVICORN_RUN=$(grep -rhoP "(?<=port=)\d+" . --include="*.py" 2>/dev/null | head -1)

# --- Python: Flask app.run() ---
PORT_FROM_FLASK=$(grep -rhoP "(?<=app\.run\([^)]*port=)\d+" . --include="*.py" 2>/dev/null | head -1)

# --- Python: settings/config files (Django, FastAPI, etc.) ---
PORT_FROM_SETTINGS=$(grep -rhoP "(?<=(PORT|SERVER_PORT)\s*=\s*)\d+" \
  settings.py config.py core/settings.py 2>/dev/null | head -1)

# --- Node.js: app.listen() in source ---
PORT_FROM_NODE=$(grep -rhoP "(?<=\.listen\()\d+" . --include="*.js" --include="*.ts" 2>/dev/null | head -1)

# --- Node.js: package.json scripts ---
PORT_FROM_NODE_PKG=$(node -e "
  const p = require('./package.json');
  const s = Object.values(p.scripts||{}).join(' ');
  const m = s.match(/--port[= ](\d+)/);
  console.log(m ? m[1] : '');
" 2>/dev/null)

# --- Ruby on Rails: config/puma.rb or Procfile ---
PORT_FROM_PUMA=$(grep -oP "(?<=port\s)\d+" config/puma.rb Procfile 2>/dev/null | head -1)

# --- Go: common pattern :PORT or ":8080" ---
PORT_FROM_GO=$(grep -rhoP '(?<=:)\d{4,5}(?=")' . --include="*.go" 2>/dev/null | head -1)

# --- Docker / docker-compose ---
PORT_FROM_DOCKER=$(grep -oP "(?<=- \")\d+(?=:\d+\")" docker-compose.yml docker-compose.yaml 2>/dev/null | head -1)

# Resolve in priority order
BACKEND_PORT=${PORT_FROM_ENV:-${PORT_FROM_UVICORN:-${PORT_FROM_UVICORN_RUN:-\
${PORT_FROM_FLASK:-${PORT_FROM_SETTINGS:-${PORT_FROM_NODE:-${PORT_FROM_NODE_PKG:-\
${PORT_FROM_PUMA:-${PORT_FROM_GO:-${PORT_FROM_DOCKER:-"unknown"}}}}}}}}}}

echo "Detected backend port: $BACKEND_PORT"

# If still unknown, ask the user — never fall back to a hardcoded guess
[ "$BACKEND_PORT" = "unknown" ] && echo "⚠ Could not detect backend port. Please specify it."
```

### *Free Port Resolution (both frontend & backend)*

```bash
find_free_port() {
  local port=$1
  while lsof -iTCP:$port -sTCP:LISTEN -t >/dev/null 2>&1; do
    echo "Port $port occupied, trying $((port+1))..." >&2
    port=$((port + 1))
  done
  echo $port
}

FREE_BACKEND=$(find_free_port $BACKEND_PORT)
FREE_FRONTEND=$(find_free_port $FRONTEND_PORT)

echo "✓ Backend  → port $FREE_BACKEND  (detected: $BACKEND_PORT)"
echo "✓ Frontend → port $FREE_FRONTEND  (detected: $FRONTEND_PORT)"
```

### *Backend Port Detection Coverage*


| *Source*                 | *Variables Checked*                                     | *Frameworks*            |
| ------------------------ | ------------------------------------------------------- | ----------------------- |
| `.env` */* `.env.`*      | `PORT`*,* `APP_PORT`*,* `SERVER_PORT`*,* `BACKEND_PORT` | *All*                   |
| *Python source*          | `uvicorn.run(port=)`*,* `app.run(port=)`                | *FastAPI, Flask*        |
| *CLI / scripts*          | `--port \d+` *in Makefile,* `.sh`*, start scripts*      | *uvicorn, gunicorn*     |
| *Settings files*         | `settings.py`*,* `config.py`*,* `core/settings.py`      | *Django, FastAPI*       |
| *Node.js source*         | `.listen(\d+)`                                          | *Express, Fastify, Koa* |
| `package.json` *scripts* | `--port \d+`                                            | *Any Node server*       |
| *Ruby config*            | `config/puma.rb`*,* `Procfile`                          | *Rails, Sinatra*        |
| *Go source*              | `":\d+"` *string literals*                              | *net/http, Gin, Echo*   |
| *Docker Compose*         | `ports:` *host mapping*                                 | *Any containerized app* |


> ***Rule:** If detection returns* `"unknown"` *after exhausting all sources, stop and ask the user. Never silently fall back to* `8000`*,* `3000`*, or any other hardcoded default.*

---

## *Remote Host Whitelist Handling*

*Some dev servers (Vite, webpack-dev-server) reject requests from non-localhost origins. Detect and fix:*

```bash
# Vite: add allowedHosts or set host to 0.0.0.0
if grep -q "allowedHosts" vite.config.* 2>/dev/null; then
  echo "✓ allowedHosts already configured"
else
  echo "⚠ Vite may block remote access. Passing --host 0.0.0.0 flag..."
fi
```

***Run-time flags by framework:***


| *Framework*          | *Command addition*                                              |
| -------------------- | --------------------------------------------------------------- |
| *Vite*               | `--host 0.0.0.0`                                                |
| *Next.js*            | `-H 0.0.0.0`                                                    |
| *CRA (webpack)*      | `HOST=0.0.0.0` *env prefix*                                     |
| *webpack-dev-server* | `--allowed-hosts all`                                           |
| *FastAPI/uvicorn*    | `--host 0.0.0.0`                                                |
| *Flask*              | `--host=0.0.0.0`                                                |
| *Express*            | *Bind* `app.listen(port, '0.0.0.0')` *— warn user if hardcoded* |


---

## *Phase 1 — Validate*

*Validation is task-dependent. For scripts: validate workspace, script path, and required runner (python3, node, bash, etc.). Do not assume Python. For servers: validate workspace, deps, and runtime.*

```bash
[ -d "$WORKSPACE" ] && echo "✓ workspace" || echo "✗ not found: $WORKSPACE"
# For full-stack/backend:
[ -f "$WORKSPACE/backend/requirements.txt" ] && echo "✓ requirements.txt" || echo "✗ missing"
command -v uvicorn && echo "✓ uvicorn" || echo "✗ uvicorn not found"
command -v node && echo "✓ node" || echo "✗ node not found"
command -v python3 && echo "✓ python3" || echo "✗ python3 not found"
```

---

## *Phase 2 — Install (separate bash call per service)*

```bash
# Backend
nohup bash -c 'cd /path/backend && source venv/bin/activate && pip install -q -r requirements.txt' >> backend_install.log 2>&1 &
disown; timeout 120 tail -f backend_install.log

# Frontend (separate call)
nohup bash -c 'cd /path/frontend && npm install --silent' >> frontend_install.log 2>&1 &
disown; timeout 120 tail -f frontend_install.log
```

***Python venv lookup order** (from service dir):* `../.venv`*,* `../venv`*,* `../env`*,* `.venv`*,* `venv`*,* `env`

---

## *Phase 3 — Start Services (separate bash call per service)*

```bash
# FastAPI / uvicorn backend
nohup bash -c 'cd /path/backend && source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port $FREE_BACKEND' >> backend.log 2>&1 &
disown; echo "backend started on port $FREE_BACKEND"

# Vite frontend
nohup bash -c 'cd /path/frontend && npm run dev -- --host 0.0.0.0 --port $FREE_FRONTEND' >> frontend.log 2>&1 &
disown; echo "frontend started on port $FREE_FRONTEND"

# Next.js frontend
nohup bash -c 'cd /path/frontend && npm run dev -- -H 0.0.0.0 -p $FREE_FRONTEND' >> frontend.log 2>&1 &
disown; echo "frontend started on port $FREE_FRONTEND"

# CRA (webpack)
nohup bash -c 'cd /path/frontend && HOST=0.0.0.0 PORT=$FREE_FRONTEND npm start' >> frontend.log 2>&1 &
disown; echo "frontend started on port $FREE_FRONTEND"
```

*⚠️ If a command cannot accept* `--host 0.0.0.0` *(e.g. hardcoded Express), warn the user and suggest they modify their* `app.listen` *call.*

---

## *Phase 4 — Monitor Logs*

```bash
sleep 3
timeout 8 tail -f backend.log
timeout 8 tail -f frontend.log
```

*Look for success indicators:* `"Uvicorn running"`*,* `"Ready in Xms"`*,* `"Local: http://"`*,* `"running on"`*. If errors appear, stop and report.*

---

## *Phase 5 — Verify Reachability (up to 10 retries)*

```bash
sleep 8
for i in $(seq 1 10); do
  code=$(curl -s --max-time 3 -o /dev/null -w "%{http_code}" "http://$REMOTE_HOST:$FREE_BACKEND")
  echo "$code" | grep -qE "^[23]" && echo "✓ reachable (attempt $i)" && break
  # 403/blocked = likely host whitelist issue, not a crash
  [ "$code" = "403" ] && echo "⚠ HTTP 403: possible host whitelist rejection. Check framework config." && break
  echo "attempt $i: HTTP $code, retrying..."
  sleep 2
done
```

***If verification fails after all retries, check:***

- *Logs for "startup complete" (server running = firewall/whitelist issue, not a crash)*
- *Host whitelist config (Vite* `allowedHosts`*, webpack* `--allowed-hosts all`*)*
- *Firewall rules (*`ufw allow PORT`*, AWS security groups, GCP ingress)*
- *Service bound to* `0.0.0.0`*, not* `127.0.0.1`

---

## *Few-Shot Examples*

### *Example A — Run a Script (language-agnostic)*

> *User: "Run* `scripts/process_data.py` *in my project"* *or* *"Run* `scripts/setup.sh`*"*

*Do not assume Python. Choose runner from script extension: `.py` → python3, `.sh` → bash, `.js` → node, `.rb` → ruby, etc. Use venv only for Python scripts when a venv exists.*

```bash
# Phase 1: Validate
SCRIPT="$WORKSPACE/scripts/process_data.py"   # or whatever script path
[ -f "$SCRIPT" ] && echo "✓ script found" || { echo "✗ missing"; exit 1; }

# Determine runner from extension (no Python assumption)
case "$SCRIPT" in
  *.py) RUNNER="python3";;
  *.sh) RUNNER="bash"; [ -x "$SCRIPT" ] || chmod +x "$SCRIPT";;
  *.js) RUNNER="node";;
  *.rb) RUNNER="ruby";;
  *) RUNNER="bash";;  # fallback
esac
command -v $RUNNER && echo "✓ $RUNNER" || { echo "✗ $RUNNER not found"; exit 1; }

# Phase 3: Run (Python only: optionally activate venv if present, inside nohup)
CMD="cd $WORKSPACE && $RUNNER $SCRIPT"
if [ "$RUNNER" = "python3" ]; then
  for v in "$WORKSPACE/.venv" "$WORKSPACE/venv" "$WORKSPACE/env"; do
    [ -f "$v/bin/activate" ] && { CMD="cd $WORKSPACE && source $v/bin/activate && python3 $SCRIPT"; break; }
  done
fi
nohup bash -c "$CMD" >> script.log 2>&1 &
disown; echo "script started"

# Phase 4: Monitor
timeout 15 tail -f script.log
```

---

### *Example B — Run a Shell Script*

> *User: "Run* `deploy.sh` *from the project root"*

```bash
# Phase 1: Validate
[ -f "$WORKSPACE/deploy.sh" ] && echo "✓ deploy.sh found" || echo "✗ missing"
[ -x "$WORKSPACE/deploy.sh" ] || chmod +x "$WORKSPACE/deploy.sh" && echo "✓ executable"

# Phase 3: Run
nohup bash -c 'cd /workspace && bash deploy.sh' >> deploy.log 2>&1 &
disown; echo "deploy.sh started"

# Phase 4: Monitor
timeout 30 tail -f deploy.log
```

---

### *Example C — Python Flask App (not uvicorn)*

> *User: "Start my Flask app at* `app.py`*"*

```bash
# Detect port from app.py
FLASK_PORT=$(grep -oP "(?<=port=)\d+" $WORKSPACE/app.py 2>/dev/null)
[ -z "$FLASK_PORT" ] && FLASK_PORT=$(grep -oP "(?<=PORT=)\d+" $WORKSPACE/.env 2>/dev/null)
[ -z "$FLASK_PORT" ] && echo "⚠ Could not detect Flask port. Please specify." && exit 1

FREE_PORT=$FLASK_PORT
while lsof -iTCP:$FREE_PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
  FREE_PORT=$((FREE_PORT+1))
done
echo "Using port: $FREE_PORT"

# Start
nohup bash -c "cd $WORKSPACE && source venv/bin/activate && flask run --host=0.0.0.0 --port=$FREE_PORT" >> flask.log 2>&1 &
disown; echo "Flask started on $FREE_PORT"

timeout 8 tail -f flask.log
```

---

### *Example D — Node.js Express Server*

> *User: "Start my Express server at* `server.js`*"*

```bash
# Detect port
EXPRESS_PORT=$(grep -rhoP "(?<=\.listen\()\d+" $WORKSPACE/server.js 2>/dev/null | head -1)
[ -z "$EXPRESS_PORT" ] && EXPRESS_PORT=$(grep -oP "(?<=PORT=)\d+" $WORKSPACE/.env 2>/dev/null | head -1)
[ -z "$EXPRESS_PORT" ] && echo "⚠ Could not detect Express port. Please specify." && exit 1

FREE_PORT=$EXPRESS_PORT
while lsof -iTCP:$FREE_PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
  FREE_PORT=$((FREE_PORT+1))
done

# Warn if host is hardcoded to localhost in server.js
grep -q "localhost\|127.0.0.1" $WORKSPACE/server.js && \
  echo "⚠ server.js may bind to localhost. Remote access will fail — update app.listen to use '0.0.0.0'"

nohup bash -c "cd $WORKSPACE && PORT=$FREE_PORT node server.js" >> express.log 2>&1 &
disown; echo "Express started on $FREE_PORT"

timeout 8 tail -f express.log
```

---

### *Example E — Full Stack (FastAPI + Vite)*

> *User: "Start both the backend and frontend"*

```bash
# Detect backend port
BACK_PORT=$(grep -oP "(?<=(PORT|APP_PORT|SERVER_PORT)=)\d+" $WORKSPACE/backend/.env 2>/dev/null | head -1)
BACK_PORT=${BACK_PORT:-$(grep -rhoP "(?<=port=)\d+" $WORKSPACE/backend --include="*.py" 2>/dev/null | head -1)}
[ -z "$BACK_PORT" ] && echo "⚠ Could not detect backend port. Please specify." && exit 1

# Detect frontend port
VITE_PORT=$(grep -oP "(?<=port: )\d+" $WORKSPACE/frontend/vite.config.* 2>/dev/null | head -1)
[ -z "$VITE_PORT" ] && echo "⚠ Could not detect frontend port. Please specify." && exit 1

# Find free ports (increment, never kill)
FREE_BACK=$BACK_PORT
while lsof -iTCP:$FREE_BACK -sTCP:LISTEN -t >/dev/null 2>&1; do FREE_BACK=$((FREE_BACK+1)); done

FREE_FRONT=$VITE_PORT
while lsof -iTCP:$FREE_FRONT -sTCP:LISTEN -t >/dev/null 2>&1; do FREE_FRONT=$((FREE_FRONT+1)); done

# Backend
nohup bash -c "cd $WORKSPACE/backend && source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port $FREE_BACK" >> backend.log 2>&1 &
disown

# Frontend
nohup bash -c "cd $WORKSPACE/frontend && npm run dev -- --host 0.0.0.0 --port $FREE_FRONT" >> frontend.log 2>&1 &
disown

sleep 3; timeout 8 tail -f backend.log; timeout 8 tail -f frontend.log
```

---

## *Output Format*

```
PHASE 0: DETECT PORTS        ✓ frontend=5174 (5173 occupied, incremented), backend=8001 (8000 occupied, incremented)
PHASE 1: VALIDATE            ✓ all checks passed
PHASE 2: INSTALL             ✓ backend deps, ✓ frontend deps
PHASE 3: START               ✓ backend (PID 1234), ✓ frontend (PID 5678)
PHASE 4: MONITOR             ✓ Uvicorn running on :8001, ✓ Vite ready on :5174
PHASE 5: VERIFY              ✓ :8001 reachable, ✓ :5174 reachable

SERVICE    PORT   URL
backend    8001   http://<remote_host>:8001 ✓
frontend   5174   http://<remote_host>:5174 ✓

⚠ If you see 403 errors, the dev server may be blocking your remote host.
  Fix: add `--host 0.0.0.0` or configure allowedHosts in vite.config.

Type "terminate" to stop all services.
```

