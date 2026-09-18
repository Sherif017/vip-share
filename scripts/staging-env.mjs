export const requiredVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STAGING_DATABASE_URL",
];

const project = "okplunqjwklzpfacuskd";
const target = `https://${project}.supabase.co`;

export function validateEnvironment(env) {
  const errors = [];
  for (const name of requiredVariables) {
    if (!env[name]?.trim()) errors.push(`${name}: ABSENT`);
  }
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]) {
    if (env[name] !== target) errors.push(`${name}: WRONG TARGET`);
  }
  if (!env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    errors.push("STRIPE_SECRET_KEY: NOT TEST MODE");
  }
  if (env.STAGING_DATABASE_URL?.trim()) {
    try {
      const url = new URL(env.STAGING_DATABASE_URL);
      const direct = url.hostname === `db.${project}.supabase.co`;
      const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)
        && decodeURIComponent(url.username) === `postgres.${project}`;
      // Reject libpq query parameters that could override the destination.
      const allowedParameters = new Set([
        "sslmode", "connect_timeout", "application_name", "channel_binding",
      ]);
      if (!["postgres:", "postgresql:"].includes(url.protocol)
        || !(direct || pooler)
        || [...url.searchParams.keys()].some((key) => !allowedParameters.has(key))) {
        errors.push("STAGING_DATABASE_URL: WRONG TARGET");
      }
    } catch {
      errors.push("STAGING_DATABASE_URL: WRONG TARGET");
    }
  }
  return errors;
}

export function childEnvironment(staging, inherited) {
  // Inherit only terminal/OS settings, never application credentials.
  const env = {};
  for (const name of [
    "PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "TERM", "COLORTERM",
    "LANG", "LC_ALL", "LC_CTYPE", "TZ", "SystemRoot",
  ]) {
    if (inherited[name] !== undefined) env[name] = inherited[name];
  }
  for (const name of requiredVariables) env[name] = staging[name];
  // Explicitly prevent Next.js from filling this optional credential from .env.local.
  env.CRON_SECRET = staging.CRON_SECRET ?? "";
  env.NODE_ENV = "development";
  env.HISTFILE = "/dev/null";
  env.PSQL_HISTORY = "/dev/null";
  return env;
}
