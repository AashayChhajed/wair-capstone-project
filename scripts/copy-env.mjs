// Copies .env.example -> backend/.env and frontend/.env if not already present.
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const root = process.cwd();
const pairs = [
  ["backend/.env", ".env.example"],
  ["frontend/.env", ".env.example"],
];

for (const [target, source] of pairs) {
  const targetPath = resolve(root, target);
  const sourcePath = resolve(root, source);
  if (existsSync(targetPath)) {
    console.log(`[copy-env] ${target} already exists, skipping.`);
    continue;
  }
  if (!existsSync(sourcePath)) {
    console.error(`[copy-env] Missing ${source}. Aborting.`);
    process.exit(1);
  }
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
  console.log(`[copy-env] Created ${target} from ${source}`);
}
