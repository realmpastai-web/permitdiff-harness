import net from "node:net";
import { clientOutcome, type ClientPolicy } from "../classify";
import { performEffect, type RunContext } from "../effects";
import { lookupCell, type Fixture } from "../fixture";
import type { ScenarioDef } from "../scenarios/types";

export const MOCK_APPROVAL_PROMPT = "MOCK_APPROVAL_PROMPT: approval required before touch";

export type TrialEventType =
  | "session_start"
  | "tool_call"
  | "approval_prompt"
  | "permission_request"
  | "permission_response"
  | "side_effect";

export interface TrialEvent {
  type: TrialEventType;
  at: number;
  detail?: Record<string, unknown>;
}

interface RpcMessage {
  jsonrpc?: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

class NdjsonPeer {
  private buf = "";
  private nextId: number;
  private pending = new Map<number, (msg: RpcMessage) => void>();
  private onRequest: (msg: RpcMessage) => Promise<unknown> = async () => ({});
  private onNote: (msg: RpcMessage) => void = () => undefined;

  constructor(
    private socket: net.Socket,
    idBase: number,
  ) {
    this.nextId = idBase;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buf += chunk;
      let nl = this.buf.indexOf("\n");
      while (nl >= 0) {
        const line = this.buf.slice(0, nl);
        this.buf = this.buf.slice(nl + 1);
        if (line.trim()) this.dispatch(JSON.parse(line) as RpcMessage);
        nl = this.buf.indexOf("\n");
      }
    });
  }

  setHandlers(handlers: {
    onRequest: (msg: RpcMessage) => Promise<unknown>;
    onNote: (msg: RpcMessage) => void;
  }): void {
    this.onRequest = handlers.onRequest;
    this.onNote = handlers.onNote;
  }

  send(msg: RpcMessage): void {
    this.socket.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const pending = new Promise<RpcMessage>((resolve) => {
      this.pending.set(id, resolve);
    });
    this.send({ id, method, params });
    return pending.then((msg) => {
      if (msg.error) throw new Error(msg.error.message ?? "rpc error");
      return msg.result;
    });
  }

  private dispatch(msg: RpcMessage): void {
    if (msg.method && msg.id !== undefined) {
      void this.onRequest(msg)
        .then((result) => this.send({ id: msg.id, result }))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.send({ id: msg.id, error: { message } });
        });
      return;
    }
    if (msg.id !== undefined && msg.method === undefined) {
      const waiter = this.pending.get(msg.id);
      if (waiter) {
        this.pending.delete(msg.id);
        waiter(msg);
      }
      return;
    }
    if (msg.method) this.onNote(msg);
  }
}

function updateOf(msg: RpcMessage): Record<string, unknown> | undefined {
  const params = msg.params;
  if (!params || typeof params !== "object") return undefined;
  const record = params as Record<string, unknown>;
  const update = record.update;
  if (update && typeof update === "object") return update as Record<string, unknown>;
  return record;
}

export interface MockSessionResult {
  events: TrialEvent[];
  sessionCopilotVersion: string;
}

export async function runMockSession(opts: {
  copilotVersion: string;
  fixture: Fixture;
  scenario: ScenarioDef;
  version: string;
  ctx: RunContext;
  policy: ClientPolicy;
}): Promise<MockSessionResult> {
  const events: TrialEvent[] = [];
  let tick = 0;
  const stamp = (): number => {
    tick += 1;
    return tick;
  };
  let sessionCopilotVersion = "";

  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    const peer = new NdjsonPeer(socket, 100_000);
    let sessionId = "";
    peer.setHandlers({
      onRequest: async (msg) => {
        if (msg.method === "initialize") {
          return { protocolVersion: 1, serverInfo: { name: "fake-acp", version: "mock" } };
        }
        if (msg.method === "session/new") {
          sessionId = "sess-1";
          peer.send({
            method: "session.start",
            params: { copilotVersion: opts.copilotVersion, sessionId },
          });
          return { sessionId };
        }
        if (msg.method === "session/prompt") {
          await performPrompt(peer, sessionId);
          return { stopReason: "done" };
        }
        throw new Error(`unexpected method ${msg.method ?? ""}`);
      },
      onNote: () => undefined,
    });

    async function performPrompt(active: NdjsonPeer, sid: string): Promise<void> {
      const row = lookupCell(opts.fixture, opts.scenario.id, opts.version);
      if (row?.verdict === "INCONCLUSIVE") return;

      const calls = opts.scenario.effect === "parallel-writes" ? 2 : 1;
      for (let i = 0; i < calls; i += 1) {
        active.send({
          method: "session/update",
          params: {
            sessionId: sid,
            update: {
              sessionUpdate: "tool_call",
              toolCallId: `call-${i + 1}`,
              title: opts.scenario.id,
              status: "pending",
              rawInput: opts.scenario.rawInput(opts.ctx),
            },
          },
        });
      }

      if (opts.scenario.id === "S7") {
        active.send({
          method: "session/update",
          params: {
            sessionId: sid,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: MOCK_APPROVAL_PROMPT },
            },
          },
        });
      }

      const gated = row?.verdict === "GATED";
      if (gated) {
        const result = (await active.request("session/request_permission", {
          sessionId: sid,
          toolCallId: "call-1",
          options: [clientOutcome("reject_once"), clientOutcome("approve")],
        })) as { outcome?: string };
        if (result.outcome === "approve") {
          await performEffect(opts.scenario.effect, opts.ctx);
          active.send({
            method: "session/update",
            params: { sessionId: sid, update: { sessionUpdate: "side_effect" } },
          });
        }
        return;
      }

      await performEffect(opts.scenario.effect, opts.ctx);
      active.send({
        method: "session/update",
        params: { sessionId: sid, update: { sessionUpdate: "side_effect" } },
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("fake ACP server failed to bind");
  }

  const socket = net.connect({ host: "127.0.0.1", port: addr.port });
  socket.on("error", () => undefined);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", reject);
  });

  const client = new NdjsonPeer(socket, 1);
  client.setHandlers({
    onRequest: async (msg) => {
      if (msg.method !== "session/request_permission") {
        throw new Error(`client refused unexpected method ${msg.method ?? ""}`);
      }
      events.push({ type: "permission_request", at: stamp() });
      const outcome = clientOutcome(opts.policy);
      events.push({ type: "permission_response", at: stamp(), detail: { outcome } });
      return { outcome };
    },
    onNote: (msg) => {
      if (msg.method === "session.start") {
        const params = msg.params as { copilotVersion?: string } | undefined;
        sessionCopilotVersion = params?.copilotVersion ?? "";
        events.push({
          type: "session_start",
          at: stamp(),
          detail: { copilotVersion: sessionCopilotVersion },
        });
        return;
      }
      const update = updateOf(msg);
      const kind = update?.sessionUpdate;
      if (kind === "tool_call") {
        events.push({ type: "tool_call", at: stamp(), detail: { rawInput: update?.rawInput } });
        return;
      }
      if (kind === "agent_message_chunk") {
        const content = update?.content as { text?: string } | undefined;
        events.push({ type: "approval_prompt", at: stamp(), detail: { text: content?.text } });
        return;
      }
      if (kind === "side_effect") {
        events.push({ type: "side_effect", at: stamp() });
      }
    },
  });

  try {
    await withTimeout(client.request("initialize", { clientInfo: { name: "permitdiff-harness" } }), "initialize");
    const created = (await withTimeout(
      client.request("session/new", { cwd: opts.ctx.workdir }),
      "session/new",
    )) as { sessionId: string };
    await withTimeout(
      client.request("session/prompt", {
        sessionId: created.sessionId,
        prompt: opts.scenario.prompt(opts.ctx),
      }),
      "session/prompt",
    );
  } finally {
    socket.end();
    for (const open of sockets) open.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  return { events, sessionCopilotVersion };
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`fake ACP timeout during ${label}`)), 5_000);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
