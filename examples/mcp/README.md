# LibreDraw MCP bridge (reference implementation)

An MCP server that lets an AI agent (Claude Code, or any MCP client) read and edit the
features on a LibreDraw map through the public API, without touching the pointer or the
toolbar. It is the working example for the `OperationResult` / `origin` contract:

```
MCP client ──stdio──▶ server/index.ts ──WebSocket──▶ browser page ──▶ LibreDraw (src/)
                      (12 tools)        localhost:8787   page/main.ts
```

The Node server only relays: each tool is one LibreDraw method, the arguments are passed
through as they are, and the return value (an `OperationResult` for the geometry
operations) comes back untouched. All geometry, validation, history, and events stay in
LibreDraw, in the browser.

## What you get

| Tool             | LibreDraw call                                  | Returns                            |
| ---------------- | ----------------------------------------------- | ---------------------------------- |
| `get_features`   | `toGeoJSON()`                                   | FeatureCollection                  |
| `get_feature`    | `getFeatureById(id)`                            | Feature or `null`                  |
| `add_features`   | `addFeatures(features, { strict })`             | `AddFeatureResult[]`               |
| `update_feature` | `updateFeature(id, { geometry, properties })`   | `OperationResult`                  |
| `delete_feature` | `deleteFeature(id)`                             | deleted Feature or `null`          |
| `split`          | `split(id, [start, end])`                       | `OperationResult`                  |
| `setback`        | `setback(id, { ring?, index }, distanceMeters)` | `OperationResult`                  |
| `rotate`         | `rotate(id, angleDeg)`                          | `OperationResult`                  |
| `union`          | `union(ids)`                                    | `OperationResult`                  |
| `select_feature` | `selectFeature(id)`                             | `{ ok: true }` or `{ ok, reason }` |
| `undo` / `redo`  | `undo()` / `redo()`                             | `boolean`                          |

Failures are never exceptions. A geometric failure comes back as
`{ ok: false, reason: 'invalid-intersection-count' }` and so on; a thrown
`LibreDrawError` (for example `select_feature` with an unknown id) becomes
`{ ok: false, reason: <message> }`; and while no page is connected every tool returns
`{ ok: false, reason: 'no-client' }` right away instead of waiting.

## Setup

Run these from the repository root.

```bash
# 1. Library dependencies (once per clone)
npm install

# 2. Server dependencies, kept inside this example
cd examples/mcp && npm install && cd ../..

# 3. The map page (uses the repository's Vite and the source in src/)
npx vite examples/mcp
```

Open the printed URL (http://localhost:5173 by default). The page shows a map with a
sample parcel and a road, LibreDraw's toolbar, and a log panel on the right. The panel
says "waiting for the MCP server" until the server is up.

### Register the server with Claude Code

```bash
claude mcp add libredraw -- npx --prefix examples/mcp tsx examples/mcp/server/index.ts
```

Or add it to any MCP client's configuration:

```json
{
  "mcpServers": {
    "libredraw": {
      "command": "npx",
      "args": ["--prefix", "examples/mcp", "tsx", "examples/mcp/server/index.ts"],
      "cwd": "/path/to/libre-draw"
    }
  }
}
```

The server listens for the page on `ws://127.0.0.1:8787` (loopback only) (change it with the
`LIBREDRAW_BRIDGE_PORT` environment variable on the server and
`VITE_LIBREDRAW_BRIDGE_PORT` on the page). The page reconnects on its own, so the order in
which you start the two does not matter.

### First check

Ask the client to call `get_features`. With the page open you get the sample
FeatureCollection with the features `parcel` and `road`; with the page closed you get
`{ "ok": false, "reason": "no-client" }`.

## Demo: "split this parcel along the road"

The sample data has one parcel polygon and one road line that crosses it. Ask the agent:

> Split the parcel along the road.

A capable agent will:

1. call `get_features` and read the coordinates of `road`;
2. pick two points on the road that span the parcel (the road's end points work);
3. call `split` with `{ "id": "parcel", "line": [[139.76, 35.6825], [139.774, 35.6865]] }`.

On the map the parcel becomes two polygons, the log panel shows the `split` event with the
`api` badge (a change made through the API), and `undo` puts the parcel back. If the agent
picks a line that does not cross the parcel exactly twice, the result is
`{ "ok": false, "reason": "invalid-intersection-count" }` and it can try again; nothing
on the map changes on a failure.

Draw or move something with the toolbar while the agent works and the same events show up
with the `user` badge. That distinction is the `origin` field on every LibreDraw event.

## Limits

- One page at a time. A second page that connects is refused (`one page only`).
- No authentication and no remote access: the WebSocket server binds to `127.0.0.1` only
  (check with `lsof -nP -iTCP:8787 -sTCP:LISTEN`), so it is reachable from this machine
  and nowhere else. It is meant for a local agent talking to a local browser.
  Browser connections are also checked by `Origin`: only pages served from `localhost` /
  `127.0.0.1` are accepted (`local pages only`).
- stdio only. There is no HTTP / SSE transport.
- The server relays and does not validate GeoJSON; LibreDraw validates it and reports the
  reason.

## Layout

```
examples/mcp/
├── index.html            map + log panel
├── page/main.ts          wires the map, LibreDraw, the log panel and the bridge client
├── page/dispatch.ts      tool name → LibreDraw method (unit-tested from the root suite)
├── page/bridge-client.ts WebSocket client with reconnect
├── page/log-panel.ts     events tagged by origin, tool calls, connection state
├── page/sample.ts        the parcel and the road
├── server/index.ts       McpServer + stdio transport + WebSocket server
├── server/tools.ts       the 12 tool definitions (zod input schemas)
├── server/bridge-host.ts request / response broker with timeout (unit-tested)
└── server/origin.ts      Origin check for browser connections (unit-tested)
```

`npm run typecheck` inside this directory type-checks the server and the page.
