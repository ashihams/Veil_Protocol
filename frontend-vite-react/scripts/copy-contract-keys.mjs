/**
 * Cross-platform copy of managed zk artifacts into public/ (no mkdir -p / cp).
 */
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const feRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const repoRoot = join(feRoot, "..");

const pairs = [
  [join(repoRoot, "counter-contract/src/managed/counter/keys"), join(feRoot, "public/midnight/counter/keys")],
  [join(repoRoot, "counter-contract/src/managed/counter/zkir"), join(feRoot, "public/midnight/counter/zkir")],
  [join(repoRoot, "stealth-contract/src/managed/stealth/keys"), join(feRoot, "public/midnight/stealth/keys")],
  [join(repoRoot, "stealth-contract/src/managed/stealth/zkir"), join(feRoot, "public/midnight/stealth/zkir")],
];

for (const [src, dest] of pairs) {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true });
}
