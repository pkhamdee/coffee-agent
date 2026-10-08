# Lessons

## Editing `.env` (2026-10-08)
- **Mistake:** appended to `.env` with `>>` when the file had no trailing newline, then
  ran `sed '$d'` to "remove the last line" — it deleted the `MODEL_TOKEN` line, and the
  `tail` used to inspect it printed the secret.
- **Rule:** never `tail`/`cat` `.env` unmasked; mask secrets in every read
  (`sed 's/\(TOKEN=\).*/\1***/'`). Edit `.env` with a targeted replace (Python/Edit),
  never with line-position deletes, and make sure a newline precedes appended keys.

## Ports in use (2026-10-08)
- **Mistake:** ran `pkill -f "nest start"` / weather server to free ports 3000/3001 for a
  test and killed the user's own dev servers.
- **Rule:** before killing anything, check who started it (`ps -o lstart`). If it's the
  user's process, test on other ports (`PORT=13000`, `MCP_WEATHER_PORT=13001`) instead.
