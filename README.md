# Coffee Agent

A full-stack conversational AI application for coffee shop ordering. Powered by a LangGraph state machine, Ollama (local LLM), and MongoDB for persistent conversation state.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           React + Vite (client/ — port 5173)           │ │
│  │  Chat UI · Order Sidebar · Suggestions Bar             │ │
│  └───────────────────┬────────────────────────────────────┘ │
└──────────────────────│──────────────────────────────────────┘
                       │ HTTP /chats/message/:threadId
                       │ (Vite proxy → localhost:3000)
┌──────────────────────▼──────────────────────────────────────┐
│              NestJS Backend (src/ — port 3000)              │
│                                                             │
│  ChatsController  ──►  ChatsService                        │
│                           │                                 │
│                    ┌──────▼──────────┐                      │
│                    │  LangGraph      │                      │
│                    │  State Machine  │                      │
│                    │                 │                      │
│                    │  START → [agent] → END                 │
│                    │                                        │
│                    └────────────────────────────────────────┘
│                              │ saves completed order
└──────────────────────────────│─────────────────────────────┘
                               │
          ┌────────────────────▼─┐    ┌──────────────────────┐
          │  Ollama               │    │  MongoDB             │
          │  port 11434           │    │  port 27017          │
          │  model: qwen2.5:7b   │    │  · orders collection │
          │  (configurable)       │    │  · LangGraph         │
          └───────────────────────┘    │    checkpoints       │
                                       └──────────────────────┘
```

### Conversation Flow

1. User sends a message via the chat UI with a thread ID (stored in `localStorage`).
2. NestJS passes the message to the LangGraph agent.
3. The `agent` node calls Ollama with the full menu context and conversation history. It collects the customer's name first, then the drink and customisation details one field at a time.
4. Server-side guards validate completeness — the order cannot be marked done until at minimum a **customer name** and **drink** are collected.
5. Once the customer confirms, the service saves the order directly to MongoDB.
6. LangGraph checkpoints the full conversation state to MongoDB so context survives across requests.
7. The structured response (`message`, `current_order`, `suggestions`, `progress`) is returned to the frontend.

---

## Components

| Component | Path | Responsibility |
|-----------|------|---------------|
| `ChatsController` | `src/chats/chats.controller.ts` | `POST /chats/message/:thread` endpoint |
| `ChatsService` | `src/chats/chats.service.ts` | LangGraph graph, LLM setup, tool definition, output parsing |
| `Order Schema` | `src/chats/schemas/order.schema.ts` | Mongoose model for persisted orders |
| `Zod Schemas` | `src/lib/schemas/` | Runtime validation for orders and drink menu types |
| `Menu Data` | `src/lib/utils/constants/menu_data.ts` | Hardcoded drinks, sizes, milks, syrups, sweeteners, toppings |
| `Menu Summaries` | `src/lib/summaries/index.ts` | Converts menu data to LLM-readable text |
| `App.tsx` | `client/src/App.tsx` | Main chat interface, thread/state management |
| `OrderSidebar` | `client/src/components/OrderSidebar.tsx` | Live order status panel |
| `MessageBubble` | `client/src/components/MessageBubble.tsx` | User / assistant message display |
| `InputBar` | `client/src/components/InputBar.tsx` | Chat textarea with send button |
| `SuggestionsBar` | `client/src/components/SuggestionsBar.tsx` | Quick-reply suggestion chips |

### Menu

| Category | Options |
|----------|---------|
| Drinks | Espresso, Latte, Cappuccino, Cold Brew, Frappuccino |
| Sizes | Tall (12 oz), Grande (16 oz), Venti (20/24 oz), Trenta (31 oz) |
| Milks | Whole, 2%, Nonfat, Oat, Soy, Almond, Coconut |
| Syrups | Vanilla, Caramel, Hazelnut, Mocha, Pumpkin Spice |
| Sweeteners | Classic Syrup, Raw Sugar, Stevia, Honey, Splenda |
| Toppings | Whipped Cream, Caramel Drizzle, Mocha Drizzle, Cinnamon, Vanilla Bean Powder, Caramel Crunch |

---

## Tech Stack

### Backend
| Library | Version | Purpose |
|---------|---------|---------|
| NestJS | 10 | HTTP server framework |
| LangChain | 0.3 | LLM abstraction layer |
| LangGraph | 0.4 | Stateful agent orchestration |
| @langchain/ollama | 0.2 | Ollama LLM integration |
| @langchain/langgraph-checkpoint-mongodb | 0.1 | Conversation state persistence |
| Mongoose | 8 | MongoDB ODM |
| Zod | 4 | Schema validation for AI outputs |
| TypeScript | 5.1 | Language |

### Frontend
| Library | Version | Purpose |
|---------|---------|---------|
| React | 19 | UI framework |
| Vite | 5 | Dev server & bundler |
| Tailwind CSS | 4 | Utility-first styling |
| TypeScript | 5.8 | Language |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Ollama | Runs the configured LLM locally (default: `qwen2.5:7b`) |
| MongoDB | Order storage + LangGraph checkpoints |
| Docker Compose | MongoDB container orchestration |

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Yarn](https://yarnpkg.com/) or npm
- [Docker](https://www.docker.com/) (for MongoDB)
- [Ollama](https://ollama.com/) with your chosen model (default: `qwen2.5:7b`)

---

## Running the Project

### 1. Clone & install dependencies

```bash
git clone <repo-url>
cd coffee-agent

# Backend
yarn install        # or: npm install

# Frontend
cd client
yarn install        # or: npm install
cd ..
```

### 2. Start MongoDB

```bash
cd mongodb
docker compose up -d
cd ..
```

MongoDB will be available at `localhost:27017` with credentials from `mongodb/.env`:

```
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=password123
```

### 3. Configure environment variables

Create a `.env` file in the project root (copy from the example below):

```env
MONGO_URI=mongodb://admin:password123@localhost:27017/?retryWrites=true&w=majority
MODEL_BASE_URL=http://localhost:11434/v1   # any OpenAI-compatible endpoint (Ollama, OpenRouter, ...)
MODEL_NAME=qwen2.5:7b
MODEL_TOKEN=                               # API key; leave empty for local Ollama
MODEL_TLS_INSECURE=false                   # true = accept self-signed certs (like curl -k)
SHOP_CITY=Bangkok                          # weather location (optional, see "Weather MCP")
MCP_WEATHER_URL=http://localhost:3001/mcp  # Weather MCP server endpoint
MCP_WEATHER_API_KEY=                       # key the MCP server requires (optional locally)
MCP_WEATHER_TLS_INSECURE=false             # true = accept self-signed certs for MCP calls
```

### 4. Start Ollama and pull the model

```bash
# Start the Ollama server (if not already running)
ollama serve

# In a separate terminal, pull the model (first run only)
ollama pull qwen2.5:7b
```

Verify it works:

```bash
ollama run qwen2.5:7b "Hello"
```

To use a different model, set `MODEL_NAME` in your `.env`.

### 5. Start the backend

```bash
# Development (watch mode)
yarn start:dev

# Production
yarn build && yarn start:prod
```

The API is available at `http://localhost:3000`.

### 6. Start the frontend

```bash
cd client
yarn dev
```

The UI is available at `http://localhost:5173`. Vite proxies all `/api/*` requests to the backend at `http://localhost:3000`.

---

## Weather MCP

A demo of the [Model Context Protocol](https://modelcontextprotocol.io): a standalone
**Weather MCP server** (its own project and image, [`mcp-weather-server/`](mcp-weather-server/)) exposes one tool,
`get_current_weather({ city })`, backed by the free [Open-Meteo](https://open-meteo.com) API
(no key needed). The coffee agent is an **MCP client** of that server
(`src/mcp/weather/weather-client.service.ts`): while the customer is choosing a drink, it
fetches the weather for `SHOP_CITY` and suggests cold drinks when it's hot and hot drinks
when it's cool or rainy.

```bash
yarn start:mcp-weather   # Streamable HTTP on http://localhost:3001/mcp
```

**API key.** When `MCP_WEATHER_API_KEY` is set on the server, every HTTP request must send
`Authorization: Bearer <key>` (otherwise `401`). The coffee agent sends the key from
`MCP_WEATHER_API_KEY` in its own environment, or the one entered on the `/setup` page, where
you can also change the MCP server URL and shop city and run **Test connection**.
stdio mode is local-only and needs no key.

**Run the MCP server somewhere else** (standalone image, no backend or database needed):

```bash
docker run -d -p 3001:3001 -e MCP_WEATHER_API_KEY=$(openssl rand -hex 24) \
  docker.io/pkhamdee/coffee-agent-weather-mcp:1.1.0
```

Put it behind HTTPS (reverse proxy or ingress) so the key isn't sent in clear text.

If the server isn't running, the agent logs a warning and works without weather.
Results are cached for 10 minutes (failures for 30 s).

**Try it in MCP Inspector:**

```bash
npx @modelcontextprotocol/inspector   # connect to http://localhost:3001/mcp (Streamable HTTP),
                                      # add header Authorization: Bearer <key>
```

**Use it from Claude Desktop** (stdio): run `yarn --cwd mcp-weather-server install && yarn --cwd mcp-weather-server build`, then add this to
`claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["/absolute/path/to/coffee-agent/mcp-weather-server/dist/server.js", "--stdio"]
    }
  }
}
```

**Claude Code:** `claude mcp add --transport http weather http://localhost:3001/mcp --header "Authorization: Bearer <key>"`

## Run everything with Docker Compose (no Kubernetes)

`docker-compose.yml` runs MongoDB, the Weather MCP server, the backend, and the UI:

```bash
docker compose up -d             # pulls the published images
docker compose up -d --build     # or build from this checkout
open http://localhost:8080       # /, /barista, /setup
docker compose down              # stop (add -v to also delete the MongoDB data)
```

It reads `MODEL_BASE_URL`, `MODEL_NAME`, `MODEL_TOKEN`, `SHOP_CITY` and `MCP_WEATHER_API_KEY`
from `.env` (all optional; the token can be entered on `/setup`). Optional extras:
`MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD` (default `admin` / `password123`) and
`WEB_PORT` (default `8080`). MongoDB and the MCP server aren't exposed on the host, so this
doesn't clash with `mongodb/docker-compose.yml`.

## Deploy to Kubernetes

Images (multi-arch amd64 + arm64) on Docker Hub:

| Image | Runs |
|---|---|
| `pkhamdee/coffee-agent-backend:1.1.0` | backend (`:3000`) |
| `pkhamdee/coffee-agent-weather-mcp:1.1.0` | Weather MCP server (`:3001/mcp`), deployable on its own |
| `pkhamdee/coffee-agent-web:1.1.0` | UI on nginx (`:8080`), proxies `/api/*` to the backend |

Manifests are in `k8s/` (namespace `coffee-agent`): MongoDB StatefulSet (5Gi PVC),
`weather-mcp`, `backend`, and `web` (a `LoadBalancer` Service on port 80).

```bash
cp k8s/secret.example.yaml k8s/secret.yaml   # Mongo password + MCP API key (git-ignored); MODEL_TOKEN optional
# optional: edit k8s/config.yaml (MODEL_BASE_URL, MODEL_NAME, SHOP_CITY)
kubectl apply -k k8s/
kubectl -n coffee-agent get pods
kubectl -n coffee-agent get svc web          # EXTERNAL-IP → http://<ip>/, /barista, /setup
```

The images contain no credentials. Enter the model token on `http://<ip>/setup`, or put
`MODEL_TOKEN` in `k8s/secret.yaml` so it survives backend restarts.

Notes: `backend` must stay at 1 replica (the `/setup` page keeps settings in pod memory).
The cluster needs a default StorageClass for the MongoDB volume.

**Rebuild and push** (bump the tag, then update it in `k8s/*.yaml`):

```bash
docker buildx create --name coffee-multiarch --driver docker-container   # once
docker buildx build --builder coffee-multiarch --platform linux/amd64,linux/arm64 \
  -t docker.io/pkhamdee/coffee-agent-backend:1.1.1 --push .
docker buildx build --builder coffee-multiarch --platform linux/amd64,linux/arm64 \
  -t docker.io/pkhamdee/coffee-agent-web:1.1.1 --push client
docker buildx build --builder coffee-multiarch --platform linux/amd64,linux/arm64 \
  -t docker.io/pkhamdee/coffee-agent-weather-mcp:1.1.1 --push mcp-weather-server
```

## API Reference

### `POST /chats/message/:threadId`

Start or continue a conversation. The `threadId` identifies the session — reuse the same ID to maintain conversation history.

**Request**

```json
{
  "query": "I'd like a large latte with oat milk"
}
```

**Response**

```json
{
  "message": "Great choice! Would you like any syrup or toppings with your Oat Milk Latte?",
  "current_order": {
    "name": "Alex",
    "drink": "Latte",
    "size": "Venti",
    "milk": "Oat Milk",
    "syrup": null,
    "sweeteners": null,
    "toppings": null,
    "quantity": 1
  },
  "suggestions": ["Add vanilla syrup", "Add whipped cream", "No thanks, place the order"],
  "progress": "in_progress"
}
```

`progress` is either `"in_progress"` or `"completed"`.

### `GET /chats/orders`

Returns all undelivered orders (newest first). Each order includes `name`, `drink`, `size`, `milk`, `syrup`, `sweetener`, `toppings`, `quantity`, and `status` (`"pending"` or `"delivered"`).

### `PATCH /chats/orders/:id/deliver`

Marks an order as delivered. Delivered orders are kept in the database (soft delete) but no longer appear in `GET /chats/orders`.

### `GET /health`

Liveness check — returns `{ "status": "ok" }`.

---

## Project Structure

```
coffee-agent/
├── src/                          # NestJS backend
│   ├── main.ts
│   ├── app.module.ts
│   ├── chats/
│   │   ├── chats.controller.ts
│   │   ├── chats.service.ts      # Core agent logic
│   │   ├── chats.module.ts
│   │   ├── dtos/
│   │   └── schemas/
│   └── lib/
│       ├── schemas/              # Zod schemas (orders, drinks)
│       ├── summaries/            # Menu → LLM text helpers
│       └── utils/constants/      # Menu data
├── client/                       # React + Vite frontend
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── types.ts
│       └── components/
├── mongodb/                      # Docker Compose for MongoDB
│   ├── docker-compose.yml
│   └── .env
├── dist/                         # Compiled backend (generated)
├── .env                          # Root environment variables
├── package.json
└── tsconfig.json
```

---

## Development Scripts

| Command | Description |
|---------|-------------|
| `yarn start:dev` | Backend in watch mode |
| `yarn start:prod` | Run compiled backend |
| `yarn build` | Compile backend to `dist/` |
| `yarn test` | Run Jest unit tests |
| `yarn test:cov` | Test with coverage report |
| `cd client && yarn dev` | Frontend dev server |
| `cd client && yarn build` | Build frontend for production |

---

## License

MIT
