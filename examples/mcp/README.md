# Drive LibreDraw with AI: a local MCP demo

English | [日本語](./README.ja.md)

Ask an AI agent in plain words, such as "split the parcel along the road", and watch the
map in your browser change. This demo connects Claude Code (or another MCP client) to a
LibreDraw map through MCP, so the agent edits the map with LibreDraw's public API instead
of the mouse.

Before you start, note what this demo is and is not:

- **It runs only on your own computer.** The MCP server and the map page both run locally,
  and nothing is exposed to the network.
- **It is not part of the npm package.** `npm install @sindicum/libre-draw` does not include
  it. You clone this repository and run it from there.
- **It is a demo, not a deployment template.** For connecting an agent to a real web
  application, see [In production](https://sindicum.github.io/libre-draw/guide/programmatic-api#in-production).

## What you need

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) (current LTS; the repository's CI uses Node.js 24)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (other MCP clients work
  too; see [Other MCP clients](#other-mcp-clients))
- A web browser, and an internet connection for the map tiles
- Two terminal windows: one keeps the map page running, the other runs Claude Code

## Try it

### 1. Get the code

```bash
git clone https://github.com/sindicum/libre-draw.git
cd libre-draw
npm install
cd examples/mcp && npm install && cd ../..
```

The first `npm install` sets up the library, the second one sets up the MCP server. You
only do this once.

### 2. Start the map page (terminal 1)

In the `libre-draw` folder:

```bash
npx vite examples/mcp
```

Open the printed URL (http://localhost:5173 by default). You see a map with a sample parcel
(a rectangle) and a road (a line across it), LibreDraw's toolbar, and a log panel on the
right. The panel says "waiting for the MCP server" for now. Leave this terminal running.

### 3. Register the server and start Claude Code (terminal 2)

Also in the `libre-draw` folder:

```bash
claude mcp add libredraw -- npx --prefix examples/mcp tsx examples/mcp/server/index.ts
claude
```

Always start `claude` from the `libre-draw` folder. The registration applies only to that
folder, and the command uses paths relative to it, so Claude Code started anywhere else
does not have the tools.

When Claude Code starts, it starts the MCP server, and the log panel in the browser changes
to "connected to the MCP server".

### 4. Check the connection

Ask Claude Code:

> Use the libredraw get_features tool to show the features on the map.

The answer lists the two features on the map, `parcel` and `road`. If you get
`{ "ok": false, "reason": "no-client" }` instead, the map page is not open; open the URL
from step 2.

### 5. Ask for an edit

> Split the parcel along the road.

The agent reads the road's coordinates with `get_features` and calls `split` with them. On
the map the parcel becomes two polygons, and the log panel shows the `split` event with the
`api` badge, meaning the change came from the agent. Then try:

> Undo that.

and the parcel is back in one piece. Other things to ask: "rotate the parcel by 30
degrees", "move the north edge of the parcel 20 m inward", or "split the parcel along the
road again, then merge the two pieces back".

If you draw or move something with the toolbar yourself, the log panel shows it with the
`user` badge. Every LibreDraw event carries this distinction in its `origin` field.

### 6. Clean up

Press `Ctrl+C` in terminal 1 to stop the map page, exit Claude Code, and remove the
registration if you no longer need it:

```bash
claude mcp remove libredraw
```

## Troubleshooting

- **Claude Code does not have the libredraw tools.** It was started outside the
  `libre-draw` folder, or before you ran `claude mcp add`. Exit and start `claude` again in
  the `libre-draw` folder. `claude mcp list` shows whether the server is registered.
- **Every tool returns `no-client`.** The map page is not open, or the browser tab was
  closed. Open the URL from step 2; the page reconnects on its own.
- **The log panel keeps saying "waiting for the MCP server".** Claude Code is not running,
  or the server could not start because port 8787 is in use (for example by another Claude
  Code session running this demo). Exit the other session, or change the port: set
  `LIBREDRAW_BRIDGE_PORT` for the server and `VITE_LIBREDRAW_BRIDGE_PORT` for the page to
  the same number.
- **A second browser tab does not connect.** Only one page can be connected at a time.
  Close the other tab.

## How it works

This section is for developers who want to understand or reuse the code.

```
MCP client ──stdio──▶ server/index.ts ──WebSocket──▶ browser page ──▶ LibreDraw (src/)
                      (14 tools)        127.0.0.1:8787   page/main.ts
```

The MCP client starts the Node server and talks to it over stdio. The server only relays:
each tool is one LibreDraw method, the arguments are passed through as they are, and the
return value (an `OperationResult` for the geometry operations) comes back untouched. All
geometry, validation, history, and events stay in LibreDraw, in the browser. The page
answers requests only, so changes you make with the toolbar are not pushed to the agent;
the agent reads the current state again with `get_features` before acting.

### Tools

| Tool             | LibreDraw call                                  | Returns                            |
| ---------------- | ----------------------------------------------- | ---------------------------------- |
| `get_features`   | `toGeoJSON()`                                   | FeatureCollection                  |
| `get_feature`    | `getFeatureById(id)`                            | Feature or `null`                  |
| `add_features`   | `addFeatures(features)`                         | `AddFeatureResult[]`               |
| `update_feature` | `updateFeature(id, { geometry, properties })`   | `OperationResult`                  |
| `delete_feature` | `deleteFeature(id)`                             | deleted Feature or `null`          |
| `split`          | `split(id, [start, end])`                       | `OperationResult`                  |
| `setback`        | `setback(id, { ring?, index }, distanceMeters)` | `OperationResult`                  |
| `rotate`         | `rotate(id, angleDeg)`                          | `OperationResult`                  |
| `union`          | `union(ids)`                                    | `OperationResult`                  |
| `cut`            | `cut(id, cutter)`                               | `OperationResult`                  |
| `reshape`        | `reshape(id, line)`                             | `OperationResult`                  |
| `select_feature` | `selectFeature(id)`                             | `{ ok: true }` or `{ ok, reason }` |
| `undo` / `redo`  | `undo()` / `redo()`                             | `boolean`                          |

### Failures

Failures are never exceptions, so the agent can read the reason and try again. A geometric
failure comes back as `{ ok: false, reason: 'invalid-intersection-count' }` and so on
(nothing on the map changes), an unknown id in `select_feature` as
`{ ok: false, reason: 'not-found' }`, an invalid feature in `add_features` as
`{ valid: false, reason: 'invalid-feature', message }` in its entry of the array (`reason`
is always a code; a validation failure puts the readable detail in `message`); and while
no page is connected every tool returns `{ ok: false, reason: 'no-client' }` right away
instead of waiting. LibreDraw itself only throws for misuse of the instance (see
[Programmatic API](https://sindicum.github.io/libre-draw/guide/programmatic-api)), which
the page's dispatch turns into `{ ok: false, reason: 'dispatch-error', message }` as a
safety net.

### Other MCP clients

Add this to the client's configuration, with `cwd` set to your clone:

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

### Limits

- One page at a time. A second page that connects is refused (`one page only`).
- No authentication and no remote access: the WebSocket server binds to `127.0.0.1` only
  (check with `lsof -nP -iTCP:8787 -sTCP:LISTEN`), so it is reachable from this machine
  and nowhere else. Browser connections are also checked by `Origin`: only pages served
  from `localhost`, `127.0.0.1` or `[::1]` are accepted (`local pages only`).
- stdio only. There is no HTTP / SSE transport.
- The server relays and does not validate GeoJSON; LibreDraw validates it and reports the
  reason.

### Layout

```
examples/mcp/
├── index.html            map + log panel
├── page/main.ts          wires the map, LibreDraw, the log panel and the bridge client
├── page/dispatch.ts      tool name → LibreDraw method (unit-tested from the root suite)
├── page/bridge-client.ts WebSocket client with reconnect
├── page/log-panel.ts     events tagged by origin, tool calls, connection state
├── page/sample.ts        the parcel and the road
├── server/index.ts       McpServer + stdio transport + WebSocket server
├── server/tools.ts       the 14 tool definitions (zod input schemas)
├── server/bridge-host.ts request / response broker with timeout (unit-tested)
└── server/origin.ts      Origin check for browser connections (unit-tested)
```

`npm run typecheck` inside this directory type-checks the server and the page.
