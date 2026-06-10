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
