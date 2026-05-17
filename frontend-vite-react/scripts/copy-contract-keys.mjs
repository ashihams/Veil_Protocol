/**
 * Cross-platform copy of managed zk artifacts into public/ (stealth only).
 */
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const feRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const repoRoot = join(feRoot, "..");

const pairs = [
  [join(repoRoot, "stealth-contract/src/managed/stealth/keys"), join(feRoot, "public/midnight/stealth/keys")],
  [join(repoRoot, "stealth-contract/src/managed/stealth/zkir"), join(feRoot, "public/midnight/stealth/zkir")],
];

for (const [src, dest] of pairs) {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
}
