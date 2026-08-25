# ExamVault Portal

ExamVault is a role-based examination-paper platform for authorized learning materials. It retains the public catalogue, protected student library, submission workflow, wallet, Paystack payment records, administrator workspace, MongoDB/GridFS storage, and server-side access checks that protect every download and management action.

## Core Workflows

| Area                  | Delivered capability                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue and library | Students browse free and paid papers, claim free resources, complete payment, and access only entitlement-protected downloads.                                                                        |
| Accounts and roles    | Email/password and supported OAuth sessions resolve into one MongoDB-backed user model. Administrator access is enforced by server-side procedures, not by client visibility.                         |
| Payments and wallet   | Paper purchases and wallet funding create server-side pending records, redirect to **Paystack-hosted checkout**, verify the completed transaction, then fulfil access or wallet balance idempotently. |
| Files and submissions | Authenticated uploads are validated server-side, stored in MongoDB GridFS, linked through file metadata, and downloadable only after owner, reviewer, or entitlement checks.                          |
| Administration        | Administrators manage papers, users, records, payments, submissions, operational events, storage lifecycle, and portal settings.                                                                      |

## Paystack-Hosted Checkout

The portal uses `PAYSTACK_SECRET_KEY` server-side to initialize a hosted checkout transaction and redirect the customer to Paystack’s authorization URL. There is no hard-coded merchant identifier and no custom collection of a customer phone number. Paystack displays payment methods that are enabled for the connected Paystack business account. The server verifies the payment reference, currency, and amount through Paystack before granting access or crediting a wallet; webhook fulfilment is signed and idempotent. [1] [2]

Set the Paystack webhook to:

```text
https://YOUR_PUBLIC_DOMAIN/api/paystack/webhook
```

## Required Environment Variables

| Variable                    | Scope       | Purpose                                                                                                                |
| --------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `APP_BASE_URL`              | Server-only | Canonical public HTTPS URL for Paystack callbacks and email verification/reset links. Do not include a trailing slash. |
| `MONGODB_URI`               | Server-only | MongoDB Atlas connection string for portal records and GridFS.                                                         |
| `MONGODB_DATABASE`          | Server-only | MongoDB database name; defaults to `examvault`.                                                                        |
| `JWT_SECRET`                | Server-only | Session-cookie signing secret.                                                                                         |
| `PAYSTACK_SECRET_KEY`       | Server-only | Hosted checkout initialization, transaction verification, and webhook signature validation.                            |
| `VITE_PAYSTACK_PUBLIC_KEY`  | Client-safe | Paystack public key used only for payment readiness status.                                                            |
| `RESEND_API_KEY`            | Server-only | Account verification and password-reset emails.                                                                        |
| `PASSWORD_RESET_FROM_EMAIL` | Server-only | Verified Resend sender identity.                                                                                       |

Never commit `.env` files, payment secrets, database credentials, or user-uploaded documents.

## Local Verification

```bash
pnpm install
pnpm test
pnpm check
pnpm build
```

The production release also requires a Paystack test transaction, authenticated upload/download verification, administrator workflow review, and direct navigation checks for `/account`, `/login`, `/create-account`, `/reset-password`, `/verify-email`, and `/admin`.

## Vercel Deployment

Deploy from the repository root, using the provided `vercel.json`, build command `pnpm build`, and output directory `dist/public`. The Vercel function in `api/index.ts` serves tRPC, payment webhooks, protected downloads, GridFS uploads, OAuth routes, and the health endpoint. Direct client routes are rewritten to the Vite application while `/api/*` remains reserved for server endpoints.

Configure every required server secret in Vercel for the relevant environment, then deploy a Preview build before Production. Detailed setup and migration guidance lives in [`docs/VERCEL_MONGODB_DEPLOYMENT.md`](docs/VERCEL_MONGODB_DEPLOYMENT.md) and [`docs/LEGACY_FILE_MIGRATION.md`](docs/LEGACY_FILE_MIGRATION.md).

## References

[1]: https://paystack.com/docs/payments/accept-payments/ "Paystack: Accept Payments"
[2]: https://paystack.com/docs/payments/webhooks/ "Paystack: Webhooks"
