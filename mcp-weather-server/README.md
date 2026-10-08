# Weather MCP server

Standalone [MCP](https://modelcontextprotocol.io) server with one tool,
`get_current_weather({ city })`, backed by [Open-Meteo](https://open-meteo.com) (no
weather API key needed). Used by the coffee agent, but deployable on its own.

| Env var | Default | |
|---|---|---|
| `MCP_WEATHER_API_KEY` | — | When set, HTTP clients must send `Authorization: Bearer <key>` (else 401). |
| `MCP_WEATHER_PORT` | `3001` | HTTP port. Endpoint: `/mcp` (Streamable HTTP, stateless). |

```bash
# Docker
docker run -d -p 3001:3001 -e MCP_WEATHER_API_KEY=$(openssl rand -hex 24) \
  docker.io/pkhamdee/coffee-agent-weather-mcp:1.1.0

# From source
yarn install && yarn build
yarn start          # HTTP on :3001/mcp
yarn start:stdio    # stdio (Claude Desktop); no key needed
```

Serve it over HTTPS (reverse proxy / ingress) so the key isn't sent in clear text.
Build and push (multi-arch):

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t docker.io/pkhamdee/coffee-agent-weather-mcp:1.1.0 --push .
```
