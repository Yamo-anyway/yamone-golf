import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist");
const port = Number(process.env.PREVIEW_PORT ?? 4173);
const backend = process.env.PREVIEW_API_URL ?? "http://127.0.0.1:8787";
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = new Headers();
      for (const name of [
        "content-type",
        "authorization",
        "cookie",
        "origin",
      ]) {
        const value = req.headers[name];
        if (typeof value === "string") headers.set(name, value);
      }
      const upstream = await fetch(backend + url.pathname + url.search, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      });
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      res.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    const file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const bytes = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      });
      res.end(bytes);
    } catch {
      const html = await readFile(resolve(root, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    }
  } catch {
    if (!res.headersSent)
      res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "network" }));
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Preview: http://localhost:${port}`),
);
