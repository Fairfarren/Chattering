import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteDevServer } from "vite";
import { prepareChat, safeReply } from "./chat.ts";
import type { ChatInput } from "./chat.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 3000);
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const apiKey = process.env.OLLAMA_API_KEY;
const maxBodyBytes = 4 * 1024 * 1024;
const requestTimeoutMs = 120_000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<ChatInput> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > maxBodyBytes) {
      throw new Error("请求内容过大");
    }
  }
  try {
    return JSON.parse(raw) as ChatInput;
  } catch {
    throw new Error("请求必须是有效 JSON");
  }
}

async function ollamaRequest(
  endpoint: string,
  options: RequestInit,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(new URL(endpoint, ollamaBaseUrl), {
    ...options,
    headers,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Ollama 请求失败（${response.status}）`);
  }
  return response.json();
}

async function listModels() {
  const data = (await ollamaRequest("/api/tags", { method: "GET" })) as {
    models?: { name: string; remote_model?: string }[];
  };
  if (!Array.isArray(data.models)) {
    throw new Error("Ollama 模型列表格式无效");
  }
  return data.models
    .map((model) => ({
      name: model.name,
      remote: Boolean(model.remote_model),
    }))
    .filter((model) => typeof model.name === "string");
}

async function handleApi(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "GET" && request.url === "/api/models") {
    try {
      sendJson(response, 200, { models: await listModels() });
    } catch (error) {
      sendJson(response, 503, {
        error: `无法连接 Ollama：${errorMessage(error)}`,
      });
    }
    return true;
  }

  if (request.method === "POST" && request.url === "/api/chat") {
    let prepared;
    try {
      prepared = prepareChat(await readBody(request));
    } catch (error) {
      sendJson(response, 400, { error: errorMessage(error) });
      return true;
    }

    if (prepared.kind !== "model") {
      sendJson(response, 200, prepared);
      return true;
    }

    try {
      const models = await listModels();
      if (!models.some((model) => model.name === prepared.body.model)) {
        sendJson(response, 400, { error: "所选模型在 Ollama 中不存在" });
        return true;
      }
      const result = (await ollamaRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify(prepared.body),
      })) as { message?: { content?: string } };
      sendJson(response, 200, {
        kind: "text",
        text: safeReply(result.message?.content),
      });
    } catch (error) {
      sendJson(response, 503, { error: `聊天失败：${errorMessage(error)}` });
    }
    return true;
  }

  if (request.url?.startsWith("/api/")) {
    sendJson(response, 404, { error: "接口不存在" });
    return true;
  }
  return false;
}

function contentType(filename: string) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };
  return (
    types[path.extname(filename) as keyof typeof types] ||
    "application/octet-stream"
  );
}

async function serveStatic(request: IncomingMessage, response: ServerResponse) {
  const pathname = decodeURIComponent(
    new URL(request.url || "/", "http://localhost").pathname,
  );
  const base = path.join(root, "dist");
  const filename = path.resolve(base, `.${pathname}`);
  if (filename !== base && !filename.startsWith(`${base}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }
  let target = filename;
  try {
    if (!(await stat(target)).isFile()) {
      target = path.join(base, "index.html");
    }
  } catch {
    target = path.join(base, "index.html");
  }
  try {
    response.writeHead(200, { "Content-Type": contentType(target) });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404).end("页面不存在");
  }
}

let vite: ViteDevServer | undefined;
if (process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
}

http
  .createServer(async (request, response) => {
    if (await handleApi(request, response)) {
      return;
    }
    if (vite) {
      vite.middlewares(request, response);
      return;
    }
    await serveStatic(request, response);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`絮语已启动：http://127.0.0.1:${port}`);
  });
