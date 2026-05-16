/**
 * Windows-safe build: no rm/cp/shx — pure Node + one npx tsc spawn.
 */
import { copyFile, cp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const dist = join(pkgRoot, "dist");

await rm(dist, { recursive: true, force: true });

const tsc = spawnSync("npx", ["tsc", "--project", "tsconfig.build.json"], {
  cwd: pkgRoot,
  stdio: "inherit",
  shell: true,
});
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

for (const name of ["identity", "reputation", "validation"]) {
  await cp(
    join(pkgRoot, "src", "managed", name),
    join(dist, "managed", name),
    { recursive: true },
  );
  await copyFile(
    join(pkgRoot, "src", `${name}.compact`),
    join(dist, `${name}.compact`),
  );
}
