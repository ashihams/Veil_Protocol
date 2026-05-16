import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
await rm(join(pkgRoot, "dist"), { recursive: true, force: true });

const tsc = spawnSync("npx", ["tsc", "--project", "tsconfig.build.json"], {
  cwd: pkgRoot, stdio: "inherit", shell: true,
});
if (tsc.status !== 0) process.exit(tsc.status ?? 1);
