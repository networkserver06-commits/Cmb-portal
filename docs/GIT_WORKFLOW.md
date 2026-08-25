# Git workflow safeguards

The repository validates Git identity before a push and again in GitHub Actions. This prevents deployment providers from receiving commits whose author email cannot be matched to the connected GitHub account.

## Local validation

After cloning the repository, run `pnpm install`. The package `prepare` script installs `.git/hooks/pre-push`. The hook checks the configured `user.email` and every outgoing commit. A malformed scientific-notation address, a non-GitHub address, or an address tied to another GitHub login blocks the push with a direct error.

You can run the same check manually with:

```bash
pnpm validate:git
```

To repair the configuration for this repository, use GitHub’s numeric account ID and login in the official noreply format:

```bash
git config user.name "YOUR_GITHUB_LOGIN"
git config user.email "YOUR_GITHUB_ID+YOUR_GITHUB_LOGIN@users.noreply.github.com"
pnpm validate:git
```

The exact numeric ID and login can be read without exposing credentials by running `gh api user --jq '.id, .login'` while authenticated with GitHub CLI.

## CI validation

`.github/workflows/git-config.yml` checks commit identities on pull requests and pushes to `main`. It uses the commit range associated with the event and does not require repository secrets. This is a second line of defense; it does not replace the local pre-push hook.
