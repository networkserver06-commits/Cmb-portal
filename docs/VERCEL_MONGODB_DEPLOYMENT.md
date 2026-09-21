# Vercel and MongoDB Deployment Guide

## Purpose

This guide deploys the upgraded ScholarShelf portal on Vercel while keeping MongoDB as the persistent system of record for portal data and GridFS as the store for new document bytes. The supplied `api/index.ts` Vercel function builds the Express application, and `vercel.json` routes `/api/*` traffic to that function while preserving client-side routing for direct visits.

> The portal accepts document uploads up to **4 MiB**. This intentionally stays below Vercel Functions’ 4.5 MB request/response payload boundary and avoids platform-level request-size failures. [1]

## Required Vercel Project Settings

| Setting          | Required value                    | Rationale                                                                        |
| ---------------- | --------------------------------- | -------------------------------------------------------------------------------- |
| Framework preset | Other / Vite                      | The project builds a Vite client and a Vercel function.                          |
| Install command  | `pnpm install --frozen-lockfile`  | Uses the committed lockfile for repeatable deployment builds.                    |
| Build command    | `pnpm build`                      | Produces the static client bundle and serverless API entry.                      |
| Output directory | `dist/public`                     | Matches the existing Vercel configuration.                                       |
| Root directory   | Repository root                   | Ensures `api/index.ts`, `vercel.json`, and `package.json` are deployed together. |
| Node.js runtime  | Current Vercel-supported Node LTS | Matches the project’s ESM/TypeScript build tooling.                              |

## Environment Variables

Enter each secret in **Vercel → Project Settings → Environment Variables** for the Production, Preview, and Development environments that require the workflow. Vercel keeps configured variables encrypted at rest and injects them into builds/functions according to their selected environments. [2]

| Variable                                   | Scope                  | Required for                                                                           |
| ------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------- |
| `MONGODB_URI`                              | Server only            | MongoDB collections, operational records, and the `portal_files` GridFS bucket.        |
| `MONGODB_DATABASE`                         | Server only            | Database name; use `examvault` unless an alternate name is deliberately chosen.        |
| `APP_BASE_URL`                             | Server only            | Canonical public HTTPS URL used for account-email links.                               |
| `JWT_SECRET`                               | Server only            | Account-session signing.                                                               |
| `LEETEC_BASE_URL`                          | Server only            | LeeTec API origin; use `https://leetec.online` unless deliberately overridden.         |
| `LEETEC_API_KEY`                            | Server only            | LeeTec STK Push and transaction-history authentication.                                 |
| `RESEND_API_KEY`                           | Server only            | Email verification and password-reset delivery.                                        |
| `PASSWORD_RESET_FROM_EMAIL`                | Server only            | A sender identity verified with Resend.                                                |
| OAuth variables already used by the portal | Server/client as named | Existing Manus/OAuth session compatibility, where applicable.                          |

Never prefix a secret with `VITE_`. LeeTec credentials must remain server-only.

## LeeTec STK Push and Reconciliation

The server creates a pending order or wallet top-up, collects a Kenyan phone number, and sends a LeeTec STK Push through `POST /api/v1/stkpush`. It then polls authenticated `GET /api/v1/transactions` and independently verifies the account reference, KES currency, and exact amount before granting a paper entitlement or wallet credit. LeeTec’s public documentation describes optional webhooks but does not publish a signed payload contract; the portal therefore does not invent webhook verification logic.

## MongoDB Atlas Setup

Create a dedicated Atlas database user with least-privilege read/write access limited to the portal database. Add Vercel’s network access method permitted by the Atlas project, then set `MONGODB_URI` with an encoded password and the target database name. The application initializes indexes for orders, entitlements, wallet records, submissions, `file_metadata`, workflows, and operational records when it first connects.

GridFS stores bytes in `portal_files.files` and `portal_files.chunks`; the portal’s `file_metadata` collection retains authorization-relevant ownership, file type, size, SHA-256 digest, lifecycle state, and references. MongoDB’s Node.js driver provides the GridFS bucket interface used for this storage pattern. [3]

## Deployment Sequence

| Step | Action                                                              | Expected result                                                                                                 |
| ---- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1    | Import the GitHub repository into Vercel.                           | Vercel reads `vercel.json` and recognizes the API entry point.                                                  |
| 2    | Configure every required environment variable above.                | The function can authenticate, connect to MongoDB, and deliver payment/email workflows.                         |
| 3    | Deploy a Preview environment first.                                 | Validate direct routes such as `/account`, `/admin`, `/admin/storage`, and an API request under `/api/trpc`.    |
| 4    | Sign in with a test student account.                                | Check profile update, library visibility, submission status, activity view, and wallet records.                 |
| 5    | Sign in with an administrator account.                              | Check GridFS upload progress, paper replacement, submission moderation, storage audit, and operational records. |
| 6    | Promote to Production only after the verification checklist passes. | The public deployment is ready for normal use.                                                                  |

## Upload and Download Behavior

The browser sends raw document bytes to `POST /api/files/upload` after authentication. The function validates the file name, extension, MIME type, PDF signature where applicable, and byte length before writing to GridFS. The browser receives determinate upload progress through `XMLHttpRequest`; tRPC receives only the resulting GridFS file identifier. This prevents base64 request inflation and keeps documents out of browser-trusted payload fields.

Protected paper downloads continue to use the existing `/api/papers/:paperId/download` route. When a record has been migrated to GridFS, the route performs the entitlement check and streams the GridFS document. Until migration is complete, a legacy `fileKey` still follows the signed legacy download fallback, preserving access for previously published papers.

## References

[1]: https://vercel.com/docs/functions/limitations "Vercel Functions Limits"
[2]: https://vercel.com/docs/projects/environment-variables "Vercel Environment Variables"
[3]: https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/ "MongoDB Node.js Driver: Store Large Files with GridFS"
[4]: https://leetec.online/docs "LeeTec Engine API documentation"
