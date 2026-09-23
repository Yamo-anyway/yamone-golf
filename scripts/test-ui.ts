import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
async function main() {
  const apiPort = "8791",
    previewPort = "4181";
  const api = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/local-api.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        UI_API_PORT: apiPort,
        UI_PREVIEW_PORT: previewPort,
      },
    },
  );
  const preview = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/preview.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PREVIEW_PORT: previewPort,
        PREVIEW_API_URL: `http://127.0.0.1:${apiPort}`,
      },
    },
  );
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (api.exitCode !== null || preview.exitCode !== null)
        throw new Error("Test server exited");
      try {
        if ((await fetch(`http://localhost:${previewPort}/health`)).ok) {
          ready = true;
          break;
        }
      } catch {
        /* starting */
      }
      await setTimeout(200);
    }
    if (!ready) throw new Error("Test server startup timed out");
    for (const file of [
      "tests/identity-ui.ts",
      "tests/rounds-ui.ts",
      "tests/players-ui.ts",
    ]) {
      const code = await new Promise<number | null>((resolve, reject) => {
        const test = spawn(process.execPath, ["--import", "tsx", file], {
          stdio: "inherit",
          env: {
            ...process.env,
            PREVIEW_URL: `http://localhost:${previewPort}`,
          },
        });
        test.on("error", reject);
        test.on("exit", resolve);
      });
      if (code !== 0) throw new Error(`UI test exited ${code}`);
    }
  } finally {
    api.kill("SIGTERM");
    preview.kill("SIGTERM");
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
