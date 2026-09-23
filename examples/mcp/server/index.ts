import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { WebSocketServer } from 'ws';
import { BridgeHost } from './bridge-host';
import { isAllowedOrigin } from './origin';
import { TOOLS } from './tools';

// stdout carries the MCP frames: everything human-readable goes to stderr.
const log = (message: string): void => console.error(`[libredraw-mcp] ${message}`);

const port = Number(process.env.LIBREDRAW_BRIDGE_PORT ?? 8787);
// Loopback only: there is no authentication, so nothing outside this machine
// may reach the bridge. The page connects to the same address.
const BIND_HOST = '127.0.0.1';
const host = new BridgeHost({ log });

const wss = new WebSocketServer({ host: BIND_HOST, port });
wss.on('listening', () => log(`waiting for the map page on ws://${BIND_HOST}:${port}`));
wss.on('error', (error) => {
  log(`cannot listen on port ${port}: ${error.message}`);
  process.exit(1);
});
wss.on('connection', (socket, request) => {
  if (!isAllowedOrigin(request.headers.origin)) {
    log(`rejected a page from ${request.headers.origin}`);
    socket.close(1008, 'local pages only');
    return;
  }
  if (host.connected) {
    // One page only: a second page would make "the map" ambiguous.
    log('rejected a second page');
    socket.close(1013, 'one page only');
    return;
  }
  log('map page connected');
  host.attach({ send: (text) => socket.send(text), close: () => socket.close() });
  socket.on('message', (data) => host.handleMessage(data.toString()));
  socket.on('close', () => {
    log('map page disconnected');
    host.detach();
  });
});

const server = new McpServer({ name: 'libredraw', version: '0.1.0' });
for (const [name, tool] of Object.entries(TOOLS)) {
  server.registerTool(
    name,
    { description: tool.description, inputSchema: tool.inputSchema },
    async (params: unknown) => {
      const result = await host.call(name, params ?? {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );
}

await server.connect(new StdioServerTransport());
log('MCP server ready on stdio');
