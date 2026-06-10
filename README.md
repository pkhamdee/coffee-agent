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
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5:7b
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

To use a different model, set `OLLAMA_MODEL` in your `.env`.

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
