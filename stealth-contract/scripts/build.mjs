/**
 * Windows-safe build: no rm/cp/shx — pure Node + one npx tsc spawn.
 */
import { copyFile, cp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const dist = join(pkgRoot, "dist");
const managedSrc = join(pkgRoot, "src", "managed");
const managedDest = join(dist, "managed");
const compactSrc = join(pkgRoot, "src", "stealth.compact");
const compactDest = join(dist, "stealth.compact");

await rm(dist, { recursive: true, force: true });

const tsc = spawnSync("npx", ["tsc", "--project", "tsconfig.build.json"], {
  cwd: pkgRoot,
  stdio: "inherit",
  shell: true,
});
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

await cp(managedSrc, managedDest, { recursive: true });
await copyFile(compactSrc, compactDest);
