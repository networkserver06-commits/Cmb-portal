import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "MONGODB_URI",
  "JWT_SECRET",
  "LEETEC_API_KEY",
  "RESEND_API_KEY",
  "PASSWORD_RESET_FROM_EMAIL",
];
const missing = required.filter(key => !process.env[key]);
const mongoUriValid = /^mongodb(?:\+srv)?:\/\//.test(
  process.env.MONGODB_URI ?? ""
);
const mongoDatabaseValid = /^[A-Za-z0-9_-]{1,63}$/.test(
  process.env.MONGODB_DATABASE || "examvault"
);
const leetecBaseUrlValid = /^https:\/\//.test(
  process.env.LEETEC_BASE_URL || "https://leetec.online"
);
const grokProviderValid = ["auto", "xai", "groq"].includes(
  (process.env.GROK_PROVIDER || "auto").toLowerCase()
);
const grokKeyConfigured = Boolean(
  process.env.XAI_API_KEY || process.env.GROQ_API_KEY || process.env.GROK_API_KEY
);
const forbidden = readdirSync(process.cwd(), { withFileTypes: true })
  .filter(
    entry =>
      entry.isFile() &&
      (entry.name === ".env" || entry.name.startsWith(".env."))
  )
  .map(entry => entry.name);
const vercel = existsSync(resolve("vercel.json"));
if (missing.length) {
  console.error(
    `Missing required environment variables: ${missing.join(", ")}`
  );
  process.exitCode = 1;
}
if (!missing.includes("MONGODB_URI") && !mongoUriValid) {
  console.error("MONGODB_URI must use mongodb:// or mongodb+srv:// format");
  process.exitCode = 1;
}
if (!mongoDatabaseValid) {
  console.error(
    "MONGODB_DATABASE must contain only letters, numbers, underscores, or hyphens"
  );
  process.exitCode = 1;
}
if (!leetecBaseUrlValid) {
  console.error("LEETEC_BASE_URL must use HTTPS");
  process.exitCode = 1;
}
if (!grokProviderValid) {
  console.error("GROK_PROVIDER must be auto, xai, or groq");
  process.exitCode = 1;
}
if (!grokKeyConfigured) {
  console.error(
    "Configure at least one AI provider key: XAI_API_KEY, GROQ_API_KEY, or GROK_API_KEY"
  );
  process.exitCode = 1;
}
if (forbidden.length) {
  console.error(
    `Remove environment files before publishing: ${forbidden.join(", ")}`
  );
  process.exitCode = 1;
}
if (!vercel) {
  console.error("vercel.json is missing");
  process.exitCode = 1;
}
if (process.exitCode) process.exit(process.exitCode);
console.log(
  "Launch configuration names, Vercel configuration, and repository hygiene checks passed."
);
