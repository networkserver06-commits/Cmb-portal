import { chmod, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

const hook = `#!/bin/sh
set -eu
REPO_ROOT="$(git rev-parse --show-toplevel)"
exec node "$REPO_ROOT/scripts/validate-git-config.mjs" --pre-push
`;

export function getGitRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

export async function installPrePushHook(gitRoot = getGitRoot()) {
  if (!gitRoot) return false;
  const hookPath = join(gitRoot, ".git", "hooks", "pre-push");
  await mkdir(dirname(hookPath), { recursive: true });
  await writeFile(hookPath, hook, { encoding: "utf8", mode: 0o755 });
  await chmod(hookPath, 0o755);
  return hookPath;
}

if (process.argv[1]?.endsWith("install-git-hooks.mjs")) {
  installPrePushHook().then(result => {
    if (result)
      console.log(`Installed Git pre-push validation hook at ${result}`);
  });
}
