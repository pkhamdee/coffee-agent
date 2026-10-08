# Coffee Agent — Issues & Improvements (review 2026-06-10)

## P1 — Correctness bugs

- [x] **Graph/connection rebuilt on every request** — graph, checkpointer, and LLM
      client now built once in the `ChatService` constructor; per-request state
      (`knownOrder`, `sessionStart`) is passed through LangGraph `configurable`.
- [x] **`userSaid` substring match too loose** — replaced with `userMentioned()` in
      `agent-utils.ts`: full-value substring OR first-word whole-word match, so `"2"`
      no longer validates `"2% Milk"`.
- [x] **Barista modal stuck on failed delivery** — `handleDeliver` now has
      try/catch/finally and shows an inline error message.
- [x] **Cryptic crash when MONGO_URI missing** — `app.module.ts` fails fast with a
      clear error pointing at the README; the module-level raw `MongoClient` is gone.
- [x] **Order de-dup could skip a real order** — the already-saved scan is now scoped
      to the current session (`slice(sessionStart, -1)`) instead of all history.
- [x] *(found during verification)* **Unparseable model output returned a 500** — the
      service now logs and returns a friendly "could you say it again?" reply.

## P2 — Robustness / API hygiene

- [x] **DTO validation** — `SendChatDto` with `@IsString` + `@IsNotEmpty` +
      `@MaxLength(500)`; verified 400s for empty and oversized queries.
- [x] **Soft delete for delivered orders** — `status: pending|delivered` field;
      endpoint changed from `DELETE /chats/orders/:id` to
      `PATCH /chats/orders/:id/deliver`; `getOrders` filters delivered.
- [x] **Single MongoDB connection** — checkpointer reuses
      `connection.getClient()` from the injected Mongoose connection.
- [x] **`sweeter` → `sweetener` rename** — schema, service, client types and
      dashboard. Note: pre-existing DB documents keep the old `sweeter` key; the
      dashboard shows "—" for them (acceptable for this demo; no migration written).

## P3 — Dead code & repo hygiene

- [x] Removed unused deps: `@langchain/community`, `@langchain/google-genai`,
      `@langchain/openai`, `@langchain/mongodb`, `langchain`.
- [x] Deleted unused `src/lib/schemas/orders.ts`; removed all unused
      `StructuredOutputParser` exports from `drinks.ts` (kept zod schemas/types,
      collapsed five identical option schemas into `MenuOptionSchema`).
- [x] Replaced "Hello World" scaffold with `GET /health`; deleted `AppService`.
- [x] package.json: name → `coffee-agent`, license → `MIT`, real description.
- [x] Removed npm lockfiles (root + client); project uses yarn.
- [x] Trimmed tutorial-comment noise in `src/lib/`.

## P4 — Improvements

- [x] Guard questions/suggestions (`buildQuestionMap`) now derived from
      `menu_data.ts` constants — no drift possible.
- [x] Pure helpers hoisted to `src/chats/agent-utils.ts` (module scope, not
      re-created per request).
- [x] Added `src/chats/agent-utils.spec.ts` — 24 tests covering JSON extraction,
      quantity clamping, name validation, user-mention matching, and the question
      map. `moduleNameMapper` added to jest config for `src/...` imports.
- [x] O(n²) history reparsing — analyzed: scans are bounded to the current order
      session (~10–15 messages) by `sessionStart`, so cost is constant per order.
      Caching parsed state in the checkpoint would add risk for no practical gain;
      deliberately not changed.

## Review

**Verification performed (2026-06-10):**
- `yarn lint`, `yarn build`, `yarn test` (24/24) pass; `client yarn build` (tsc + vite) passes.
- Live end-to-end test against MongoDB (docker) + Ollama `qwen2.5:7b`:
  full order flow (name guard → size → milk → declines + quantity → completion),
  order saved with `sweetener` + `status: pending`, no duplicate save on the next
  turn, `PATCH …/deliver` flips status and removes it from the queue, DTO rejects
  empty/oversized queries, `/health` returns ok.

**Operational finding:** the model currently set in `.env`
(`OLLAMA_MODEL=sorc/qwen3.5-instruct`) does not reliably honor Ollama JSON mode —
it intermittently echoes the prompt or emits non-JSON, which previously caused
500s (now a graceful retry message). The documented default `qwen2.5:7b` works
correctly. Recommend switching `.env` back to `qwen2.5:7b` or another
JSON-mode-compliant model.

**Breaking-change notes:**
- Delivery endpoint is now `PATCH /chats/orders/:id/deliver` (was `DELETE
  /chats/orders/:id`); client updated, README updated.
- Saved orders use `sweetener` (was `sweeter`); old documents are not migrated.

---

# Model setup page (2026-10-08)

Let the user set model base URL, model name, and access token from the UI
instead of editing `.env`.

- [x] Backend `src/settings/` module: in-memory overrides (user chose memory-only;
      lost on restart → falls back to `.env`),
      `GET /settings/model` (token masked, never returned), `PUT /settings/model`
      (validated DTO; empty token = keep existing), `POST /settings/model/test`
      (one-shot call to verify the config before saving).
- [x] Effective config = in-memory overrides, falling back to `MODEL_*` env vars.
- [x] `ChatService` builds the LLM from the effective config and rebuilds it when
      settings change (no restart needed).
- [x] Client `/setup` page (same look as Barista dashboard): form, "Test connection",
      "Save", shows token as "set / not set"; links to it from chat + barista headers.
- [x] Verify: lint, build, tests, client build; live: save via UI/API → chat uses new
      model; test endpoint reports failure on a bad token.

## Review (2026-10-08)

- `yarn lint`, `yarn build`, `yarn test` pass; `client yarn build` passes
  (client `yarn lint` can't run: eslint isn't installed in `client/` — pre-existing).
- Live against OpenRouter: GET shows `source: env` with token masked; invalid URL → 400;
  test with bad token → 400 "401 Missing Authentication header"; test does not change
  active config; PUT switches `source` to `setup-page` and keeps the env token when
  blank; chat then answers via the new config; saving a nonexistent model makes the
  next chat fail without restart (proves hot-swap).
- Not verified: clicking through `/setup` in a browser.
- Known: a bad saved model makes chat return a generic 500 (existing chat error
  path); OpenRouter 429s make chat slow because the client retries with backoff.

---

# Weather MCP server + client (2026-10-08)

Demo MCP: a standalone Weather MCP server (real data from Open-Meteo, no API key),
and the coffee agent connects to it as an MCP client to suggest iced/hot drinks
based on the weather at the shop (`SHOP_CITY`).

- [x] Server `src/mcp/weather/server.ts` (`@modelcontextprotocol/sdk`): tool
      `get_current_weather({ city })` → Open-Meteo geocoding + current weather;
      text + structured output. Transports: Streamable HTTP (`:3001/mcp`, default)
      and `--stdio` (Claude Desktop). Script `yarn start:mcp-weather`.
- [x] Client `src/mcp/weather/weather-client.service.ts` (Nest provider): connects to
      `MCP_WEATHER_URL`, calls the tool for `SHOP_CITY`, caches ~10 min, fails soft
      (agent keeps working with no weather line if the server is down).
- [x] Agent: inject one weather line + iced/hot guidance into the system prompt.
- [x] `.env` keys `SHOP_CITY`, `MCP_WEATHER_URL`; README section incl. Claude Desktop
      config + MCP Inspector command.
- [x] Verify: lint/build/tests; MCP Inspector CLI lists + calls the tool; chat mentions
      weather; chat still works with the MCP server stopped.

## Review — Weather MCP (2026-10-08)

- `yarn lint`, `yarn build`, `yarn test` (24/24) pass.
- MCP Inspector CLI: `tools/list` shows `get_current_weather` with input/output schemas;
  `tools/call` over HTTP (Bangkok) and stdio (Oslo) return live data; unknown city
  returns `isError: true`.
- End to end: chat → agent → MCP client → Weather MCP server → Open-Meteo. Log shows
  `Weather via MCP: {...Bangkok... feelsLikeC 29.7}`; agent replied "It's hot out
  today—would you like a cold drink like Cold Brew or Frappuccino…".
- Weather server stopped: backend logs "continuing without weather" and the first chat
  turn succeeded; the second turn hit an OpenRouter 429 (upstream rate limit, not the
  fallback). A clean retry was not run.
- Not verified: the Claude Desktop config (only the stdio transport it uses was tested).

---

# Containers + Kubernetes (2026-10-08)

Target: cloud cluster (amd64 likely) → multi-arch images (amd64+arm64) pushed to Docker Hub
`pkhamdee/*`; UI exposed with a LoadBalancer Service.

- [x] `Dockerfile` (backend; same image also runs the Weather MCP server) +
      `client/Dockerfile` (vite build → nginx, proxies `/api` to backend) + `.dockerignore`s
      (never ship `.env`).
- [x] `k8s/`: namespace, ConfigMap (model URL/name, SHOP_CITY, MCP URL), Secret template
      (MODEL_TOKEN, Mongo creds), MongoDB StatefulSet + PVC, backend, weather-mcp, and web
      Deployments/Services (web = LoadBalancer), probes + resource limits.
- [x] Build + smoke-test images locally (backend /health, weather tool call, nginx → /api).
- [x] Push multi-arch images; verify manifests list amd64 + arm64.
- [x] Validate YAML (`kubectl apply --dry-run=client`); README deploy section.

## Review — Containers + Kubernetes (2026-10-08)

- Images pushed: `pkhamdee/coffee-agent-backend:1.0.0`, `pkhamdee/coffee-agent-web:1.0.0`,
  both linux/amd64 + linux/arm64. `.env` confirmed absent from the image.
- Local smoke test (4 containers on one network): `/`, `/setup` (SPA fallback),
  `/api/health`, `/api/settings/model`, `/api/chats/orders` all OK through nginx; a chat
  turn used the Weather MCP server across containers (log + reply mention 31°C).
- amd64 variants start under emulation (backend runs as UID 1000; weather server listens).
- `k8s/` renders with `kubectl kustomize` and passes `kubeconform -strict` (11/11 valid).
- Fixes found along the way: client was missing `@types/node` (built only via the parent
  folder's node_modules); `USER node` → `USER 1000` for runAsNonRoot; web build stage uses
  `$BUILDPLATFORM` (esbuild crashed under QEMU).
- Not verified: an actual `kubectl apply` on a cluster (no kube context on this machine).

**Update (2026-10-08):** both Docker Hub repos (were public) deleted via Hub API and
confirmed 404 / not pullable; local copies removed. Rebuilt with `--no-cache` and re-pushed
`1.0.0` (amd64+arm64). Scan of pushed images: 0 `.env` files, 0 files with `sk-or-v1-` keys.
`MODEL_TOKEN` is now optional in the k8s Secret (user enters it on `/setup`); kubeconform 11/11.

---

# Weather MCP API key + MCP settings on /setup (2026-10-08)

The Weather MCP server will be hosted elsewhere and must require an API key.

- [x] Server: when `MCP_WEATHER_API_KEY` is set, require `Authorization: Bearer <key>`
      (constant-time compare, 401 otherwise); warn at startup when unset. stdio stays open.
- [x] Client: send the key as a Bearer header on every MCP call; config (URL, API key,
      city) = in-memory overrides → env fallback, same pattern as the model settings.
- [x] `GET/PUT /settings/mcp` (key masked, blank = keep) + `POST /settings/mcp/test`
      (calls the tool with the form values without applying them).
- [x] `/setup` page: second card "Weather MCP server" with URL, API key, city, Test, Save.
- [x] k8s: key in Secret (optional) for both weather-mcp and backend; README/docs.
- [x] Verify: lint/build/tests/client build; no key → 401, wrong key → 401, right key → OK;
      UI/API save → agent uses the new key; rebuild + push images as 1.1.0.

## Review — MCP API key (2026-10-08)

- lint, build, tests (24/24), client build pass; kubeconform 11/11.
- Server with key: no key → 401, wrong → 401, right → 200 (local build and pushed 1.1.0 image).
- `/settings/mcp`: GET masks key; test w/o key → "requires an API key (401)", wrong →
  "rejected the API key (401)", right key → live weather (Chiang Mai); test doesn't apply;
  save → `source: setup-page`; blank key keeps it; bad URL → 400.
- Agent used the saved key: log `Weather via MCP: {"city":"Chiang Mai",...}`. Chat replies
  then 500'd because `.env` MODEL_TOKEN is a 3-char placeholder (OpenRouter 401) — expected
  until the token is entered on /setup.
- Images 1.1.0 pushed (amd64+arm64), scanned: no .env, no keys.
- Not verified: /setup UI clicked through in a browser (build/typecheck only).
- Mistake: `pkill` stopped the user's running `yarn start:dev` + weather server.

---

# Docker Compose all-in-one (2026-10-08)

- [x] `docker-compose.yml` (root): mongodb (healthcheck, volume), weather-mcp, backend
      (waits for healthy Mongo), web on `${WEB_PORT:-8080}`; values from `.env` with defaults;
      `MCP_WEATHER_URL` pinned to the in-compose server.
- [x] Verified: `docker compose config` valid; `up -d` → all healthy; `/`, `/setup`,
      `/api/health`, `/api/chats/orders` OK on :8080; weather server "API key required";
      `/api/settings/mcp/test` with the `.env` key returns live Bangkok weather;
      `docker compose build` builds both images. README section added.

---

# Separate Weather MCP container (2026-10-08)

Split the MCP server out of the backend into its own project + image
`pkhamdee/coffee-agent-weather-mcp`, so it can be deployed independently.

- [x] `mcp-weather-server/`: own package.json (sdk, zod, dotenv only), tsconfig, `src/server.ts`
      (moved with git mv), Dockerfile, .dockerignore, short README.
- [x] Backend: drop the server file; exclude the folder from root tsconfig + .dockerignore;
      `yarn start:mcp-weather` runs the new project.
- [x] Compose + k8s use the new image (no `command:` override); docs updated.
- [x] Verify: both projects build/lint/test; image small; 401/200 with key; stdio works;
      compose stack works with the new image; push multi-arch `1.1.0`.

## Review — separate MCP container (2026-10-08)

- `mcp-weather-server/` builds under `strict` (added Open-Meteo response types); backend
  lint/build/tests (24/24) pass and `dist/` no longer contains the server.
- Image `pkhamdee/coffee-agent-weather-mcp:1.1.0` (271MB vs backend 430MB) pushed
  amd64+arm64; amd64 runs; no .env/keys; UID 1000. Auth: no key/wrong → 401, right → 200.
  stdio via Inspector returns live weather. Root `yarn start:mcp-weather` works.
- Compose stack switched to the new image; backend → MCP test returns live weather.
- kubeconform 11/11. Backend image on Docker Hub (1.1.0) still contains the old server
  file — harmless, gone on the next backend build.
- [x] Backend image rebuilt and re-pushed as `1.1.0` (amd64+arm64, no server file, no .env/keys); compose backend recreated from it and verified.
- [x] Compose: weather-mcp healthcheck (TCP 3001) + backend waits for it (was a startup race: first MCP call could hit a not-yet-listening server). Verified with `up -d --wait`.

---

# Self-signed LLM gateway (2026-10-08)

User's gateway `https://10.38.109.98/enterpriseai/gateway/v1` (model `test-public`) failed
with "Connection error." Root cause: self-signed cert (CN/SAN `nai.nutanixdev.local`) →
Node rejects with `DEPTH_ZERO_SELF_SIGNED_CERT`; curl only worked because of `-k`.
Gateway supports `response_format: json_object`.

- [x] `skipTlsVerify` model setting (`/setup` checkbox + `MODEL_TLS_INSECURE`): an undici
      Agent with `rejectUnauthorized: false` used only by that model client's fetch.
- [x] Base URL normalization: trailing `/` and pasted `/chat/completions` are stripped.
- [x] Test errors name the TLS code and point to the checkbox.
- [x] Verified on compose: TLS on → error with hint; skip → ok; full curl URL → ok; wrong
      token → gateway 401; MCP still verifies TLS; chat end to end on `test-public`
      (weather suggestion included). lint/build/tests 24/24, client build OK.
- Note: images on Docker Hub not rebuilt for this change yet (compose runs local build).

# Self-signed MCP gateway (2026-10-08)

`https://10.38.109.98/enterpriseai/gateway/mcp/wheather-mcp-server` → "MCP call failed: fetch failed".
Two causes: (1) same self-signed cert (`DEPTH_ZERO_SELF_SIGNED_CERT`); (2) the gateway returns
HTTP 503 "upstream connect error … Connection refused" even with curl -k — its upstream MCP
server is unreachable (infra side, not this app).

- [x] Shared `src/lib/http/insecure-fetch.ts` (opt-in undici agent + `tlsErrorCode`), used by
      the model client and now the MCP client (`skipTlsVerify`, `MCP_WEATHER_TLS_INSECURE`,
      checkbox on the MCP card). MCP test errors carry the TLS hint too.
- [x] Verified on compose: TLS on → cert error + hint; skip → gets through TLS and surfaces the
      gateway's 503; local MCP unchanged; tests 24/24; lint/build/client build OK.
- [ ] Blocked on gateway: its `wheather-mcp-server` upstream refuses connections.
- [x] Gateway upstream came back; "Bad Request" was the tool name: Envoy AI Gateway exposes
      it as `mcp-mcp-server__get_current_weather`. Client now resolves the tool via
      `tools/list` (exact or `__get_current_weather` suffix; clear error listing found tools).
      Verified: gateway test → live weather; local still OK; wrong key → 401 message; full chat
      with model + MCP both via the gateway.
