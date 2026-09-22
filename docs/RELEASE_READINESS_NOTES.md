# Release Readiness Notes

## Documentation Verification

The Vercel and MongoDB deployment guide has been reviewed in the project workspace. It documents the serverless build settings, required production secrets, 250 MiB total upload boundary with 3.5 MiB Vercel-safe chunks, GridFS collection model, direct-route validation, and staged deployment checks.

The legacy-file migration runbook has also been reviewed. It preserves old `fileKey` fallback downloads until each GridFS file is linked and verified for an entitled user, and it defines a rollback path that does not require an application redeployment.

## Release Gate

The remaining release work is limited to type checking, the complete automated suite, a production-style build, Vercel configuration validation, and GitHub commit/push. No migration should delete a legacy object before the entitled-student download test passes for that record.

## Dependency Audit Exception

The production dependency audit reports one **moderate** transitive advisory: `mdast-util-to-hast@13.2.0`, brought in through `streamdown@2.6.0` via `rehype-raw` and `remark-rehype`. The patched version begins at `13.2.1`, but the current Streamdown dependency graph pins `13.2.0` and does not honor a compatible workspace override. The portal does not mount the optional `AIChatBox`/Streamdown component in any student, administrator, payment, account, upload, or download route. The component remains packaged only as an inactive template capability; no untrusted Markdown is rendered in the delivered portal workflows.

The mitigation is to keep Streamdown unused in production routes, retain the server-side input and file-validation controls, and re-run `pnpm audit --prod` whenever Streamdown publishes a release that updates the pinned transitive dependency. This is an accepted moderate dependency exception, not an unresolved application-code vulnerability.

## MongoDB verification note — 2026-08-25

The isolated MongoDB-backed account API, password-reset, and submission ownership/moderation flows passed against the configured deployment. The credential ping and payment-fulfilment replay probe intermittently timed out with `MongoServerSelectionError`/test timeout, indicating external Atlas reachability or network availability rather than an application assertion failure. The focused upload-security, admin authorization, dashboard, and production-build checks remain passing. Before release, run the MongoDB suite from the deployment network and require the credential/fulfilment probes to pass.
