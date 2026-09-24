import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout } from "node:timers/promises";
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
}
async function main() {
  const apiPort = "8791",
    previewPort = "4181";
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
    const requested = process.argv.slice(2);
    for (const file of requested.length
      ? requested
      : [
          "tests/identity-ui.ts",
          "tests/rounds-ui.ts",
          "tests/players-ui.ts",
          "tests/scores-ui.ts",
          "tests/offline-ui.ts",
          "tests/ending-ui.ts",
          "tests/records-ui.ts",
          "tests/personal-ui.ts",
          "tests/peoria-ui.ts",
          ...(process.env.EXPO_PUBLIC_ADS_BANNER_FIXTURE === "1"
            ? ["tests/ads-ui.ts"]
            : []),
        ]) {
      // Each suite owns its D1 and rate-limit buckets. Production limits stay intact.
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
      try {
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          if (api.exitCode !== null || preview.exitCode !== null)
            throw Error("Test server exited");
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
        if (!ready) throw Error("Test server startup timed out");
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
        if (code !== 0) throw Error(`UI test exited ${code}: ${file}`);
      } finally {
        await stop(api);
      }
    }
  } finally {
    await stop(preview);
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
