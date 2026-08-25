import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const GITHUB_NOREPLY =
  /^(?:[0-9]+\+)?[A-Za-z0-9-]+@users\.noreply\.github\.com$/;
const TRUSTED_AUTOMATION_EMAIL = "dev-agent@manus.ai";

export function isValidGitHubEmail(email) {
  return typeof email === "string" && GITHUB_NOREPLY.test(email.trim());
}

export function validateGitEmail(email, expectedLogin = "") {
  const value = String(email ?? "").trim();
  if (!value) return "Git email is missing.";
  if (value === TRUSTED_AUTOMATION_EMAIL) return null;
  if (/[eE][+-][0-9]+/.test(value)) {
    return `Git email uses scientific notation and cannot be matched by GitHub: ${value}`;
  }
  if (!isValidGitHubEmail(value)) {
    return `Git email must use a GitHub noreply address: ${value}`;
  }
  if (expectedLogin) {
    const escaped = expectedLogin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expected = new RegExp(
      `^(?:[0-9]+\\+)?${escaped}@users\\.noreply\\.github\\.com$`
    );
    if (!expected.test(value)) {
      return `Git email does not match the expected GitHub login ${expectedLogin}: ${value}`;
    }
  }
  return null;
}

export function parsePrePushInput(input) {
  return String(input ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const [localRef, localSha, remoteRef, remoteSha] = line
        .trim()
        .split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function validateCommitRange(range, expectedLogin = "") {
  const commits = git(["log", "--format=%H%x09%ae", range])
    .split(/\r?\n/)
    .filter(Boolean);
  const errors = commits.flatMap(entry => {
    const [sha, email] = entry.split("\t");
    const error = validateGitEmail(email, expectedLogin);
    return error ? [`${error} (commit ${sha})`] : [];
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return commits.length;
}

export function validatePrePush(input, expectedLogin = "") {
  const zero = "0".repeat(40);
  const ranges = parsePrePushInput(input)
    .filter(update => update.localSha && update.localSha !== zero)
    .map(update =>
      update.remoteSha && update.remoteSha !== zero
        ? `${update.remoteSha}..${update.localSha}`
        : update.localSha
    );
  return ranges.reduce(
    (total, range) => total + validateCommitRange(range, expectedLogin),
    0
  );
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const expectedLogin = process.env.GIT_EXPECTED_GITHUB_LOGIN ?? "";
  if (process.argv.includes("--pre-push")) {
    const count = validatePrePush(await readStdin(), expectedLogin);
    const email = git(["config", "--get", "user.email"]);
    const error = validateGitEmail(email, expectedLogin);
    if (error) throw new Error(error);
    console.log(
      `Git pre-push validation passed for ${count} outgoing commit(s).`
    );
    return;
  }
  const rangeIndex = process.argv.indexOf("--range");
  if (rangeIndex !== -1 && process.argv[rangeIndex + 1]) {
    const count = validateCommitRange(
      process.argv[rangeIndex + 1],
      expectedLogin
    );
    console.log(
      `Git commit identity validation passed for ${count} commit(s).`
    );
    return;
  }
  const email = git(["config", "--get", "user.email"]);
  const error = validateGitEmail(email, expectedLogin);
  if (error) throw new Error(error);
  console.log(`Git configuration validation passed for ${email}.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(`Git configuration validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
