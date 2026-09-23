// UI-test API: actual Worker code + Miniflare/D1, with a fresh in-memory DB.
// This performs no Cloudflare account access or remote deployment.
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
async function main() {
  await mkdir("yamone-golf-cloudflare/.tmp", { recursive: true });
  await build({
    entryPoints: ["yamone-golf-cloudflare/src/index.ts"],
    outfile: "yamone-golf-cloudflare/.tmp/ui-worker.mjs",
    bundle: true,
    format: "esm",
    platform: "neutral",
  });
  const port = Number(process.env.UI_API_PORT ?? 8787);
  const previewPort = process.env.UI_PREVIEW_PORT ?? "4173";
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "yamone-golf-cloudflare/.tmp/ui-worker.mjs",
      compatibilityDate: "2026-09-23",
      d1Databases: ["DB"],
      bindings: {
        ENVIRONMENT: "ui-test",
        ALLOWED_ORIGINS: `http://localhost:${previewPort},http://127.0.0.1:${previewPort}`,
      },
    }),
  );
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir("yamone-golf-cloudflare/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      "yamone-golf-cloudflare/migrations/" + file,
      "utf8",
    );
    await db.batch(
      sql
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  }
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === "string") headers.set(key, value);
      const response = await mf.dispatchFetch(
        `http://localhost:${port}` + req.url,
        {
          method: req.method,
          headers,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        },
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "server_error" }));
    }
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Isolated UI-test Worker/D1: http://localhost:${port}`),
  );
  async function close() {
    server.close();
    await mf.dispose();
    process.exit(0);
  }
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
