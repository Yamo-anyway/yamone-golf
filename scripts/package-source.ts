// Reproducible source + local Git history, without dependency caches, .env,
// tokens, worker state, exported bundles or unrelated untracked files.
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  copyFile,
  mkdir,
  stat,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";

async function main() {
  if (
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
  )
    throw Error("Commit/review the working tree before packaging.");
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const output = process.argv[2];
  if (!output?.endsWith(".zip")) throw Error("Provide an output .zip path.");
  const destination = resolve(output);
  const exists = await stat(destination).then(
    () => true,
    (error) => {
      if (error.code === "ENOENT") return false;
      throw error;
    },
  );
  if (exists) throw Error("Refusing to overwrite an existing source archive.");
  const staging = await mkdtemp(join(tmpdir(), "yamone-golf-source-"));
  const rootName = "yamone-golf-v" + pkg.version;
  const root = join(staging, rootName);
  const tar = join(staging, "source.tar");
  execFileSync("git", [
    "archive",
    "--format=tar",
    "--prefix=" + rootName + "/",
    "HEAD",
    "-o",
    tar,
  ]);
  execFileSync("tar", ["-xf", tar, "-C", staging]);
  execFileSync("git", [
    "bundle",
    "create",
    join(root, "repository-history.bundle"),
    "--all",
  ]);
  for (const stage of await readdir("qa", { withFileTypes: true })) {
    if (!stage.isDirectory()) continue;
    const target = join(root, "qa", stage.name);
    await mkdir(target, { recursive: true });
    for (const file of await readdir(join("qa", stage.name), {
      withFileTypes: true,
    })) {
      if (file.isFile() && /\.(png|json)$/.test(file.name))
        await copyFile(
          join("qa", stage.name, file.name),
          join(target, file.name),
        );
    }
  }
  await mkdir(dirname(destination), { recursive: true });
  execFileSync("zip", ["-q", "-r", destination, rootName], { cwd: staging });
  console.log(destination);
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
