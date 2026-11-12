import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * For standalone scripts only (Next.js loads .env.local by itself).
 * Reads .env.local into process.env. Variables already set in the shell win.
 * Returns true if a file was loaded.
 */
export function loadLocalEnv(path: string = resolve(process.cwd(), ".env.local")): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}
