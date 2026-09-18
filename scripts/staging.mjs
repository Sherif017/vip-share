import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { childEnvironment, validateEnvironment } from "./staging-env.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
if (!["dev", "shell", "check", "build"].includes(mode) || process.argv.length !== 3) {
  console.error("Usage: npm run dev:staging | shell:staging | check:staging | build:staging");
  process.exit(1);
}

let staging;
try {
  // Parse data only: no shell evaluation and no variable interpolation.
  staging = parseEnv(readFileSync(new URL("../.env.staging.local", import.meta.url), "utf8"));
} catch {
  console.error(".env.staging.local: ABSENT ou illisible");
  process.exit(1);
}
const errors = validateEnvironment(staging);
if (errors.length) {
  console.error(errors.join("\n"));
  console.error("STAGING LOCAL ENVIRONMENT NEEDS CONFIGURATION");
  process.exit(1);
}
console.log("STAGING LOCAL ENVIRONMENT READY");
if (mode !== "check") {
  const env = childEnvironment(staging, process.env);
  // Next's production compilation mode is independent of the Supabase target.
  // All credentials above still come exclusively from the validated Staging file.
  if (mode === "build") env.NODE_ENV = "production";
  if (mode === "shell") {
    console.log('Shell Staging — psql "$STAGING_DATABASE_URL" ; exit pour quitter.');
    env.PROMPT = "[VIP STAGING] %~ %# ";
  }
  // -f skips user startup files that could overwrite the validated environment.
  const args = mode === "build" ? ["run", "build", "--", "--webpack"]
    : mode === "dev" ? ["run", "dev"] : ["-f", "-i"];
  const child = spawn(mode === "shell" ? "/bin/zsh" : "npm", args,
    { cwd: root, env, stdio: "inherit" });
  child.on("error", () => {
    console.error("Impossible de lancer la commande Staging.");
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  });
}
