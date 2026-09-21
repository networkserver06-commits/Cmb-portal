# ScholarShelf Portal

ScholarShelf is a role-based examination-paper platform for authorized learning materials. It retains the public catalogue, protected student library, submission workflow, wallet, LeeTec payment records, administrator workspace, MongoDB/GridFS storage, and server-side access checks that protect every download and management action.

## Core Workflows

| Area                  | Delivered capability                                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue and library | Students browse free and paid papers, claim free resources, complete payment, and access only entitlement-protected downloads.                                                                        |
| Accounts and roles    | Email/password and supported OAuth sessions resolve into one MongoDB-backed user model. Administrator access is enforced by server-side procedures, not by client visibility.                         |
| Payments and wallet   | Paper purchases and wallet funding create server-side pending records, send a **LeeTec M-Pesa STK Push**, poll LeeTec transaction history, then fulfil access or wallet balance idempotently. |
| Files and submissions | Authenticated uploads are validated server-side, stored in MongoDB GridFS, linked through file metadata, and downloadable only after owner, reviewer, or entitlement checks.                          |
| Grok study assistant | Signed-in students can ask study questions and summarize unlocked documents through switchable xAI Grok or Groq providers. Each student receives 100 requests per UTC day; failed requests are refunded. |
| Administration        | Administrators manage papers, users, records, payments, submissions, operational events, storage lifecycle, and portal settings.                                                                      |

## LeeTec M-Pesa STK Push

The portal uses `LEETEC_API_KEY` server-side to send a payment prompt to a Kenyan mobile number through `POST /api/v1/stkpush`. Customers enter a phone number at checkout or wallet top-up. The server checks `GET /api/v1/transactions` as the source of truth and verifies the exact LeeTec account reference, KES currency, and amount before granting access or crediting a wallet. The public LeeTec documentation describes optional webhooks but does not publish a signed payload contract, so fulfilment uses authenticated transaction-history polling.

## Grok Student Assistant

The Home page and signed-in student dashboard include a Grok study assistant. Students can ask general study questions, ask questions about an unlocked paper, or request a structured summary containing key concepts, definitions, exam points, and revision questions. Set `GROK_PROVIDER=xai` to force xAI Grok, `GROK_PROVIDER=groq` to force Groq, or leave it as `auto` to prefer xAI when `XAI_API_KEY` is present and automatically fail over to Groq when xAI is unavailable. In auto mode, Groq is used when only `GROQ_API_KEY` is configured; forced modes never silently switch providers. xAI uses its Files API for private document-aware responses; Groq uses the portal’s local PDF, office, and text extraction before sending document context to chat. Students do not pay for requests directly; the portal owner funds the selected provider. The application enforces 100 requests per user per UTC day in MongoDB and resets the allowance automatically at 00:00 UTC.

## Required Environment Variables

| Variable                    | Scope       | Purpose                                                                                                                |
| --------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `APP_BASE_URL`              | Server-only | Canonical public HTTPS URL for email verification/reset links. Do not include a trailing slash. |
| `MONGODB_URI`               | Server-only | MongoDB Atlas connection string for portal records and GridFS.                                                         |
| `MONGODB_DATABASE`          | Server-only | MongoDB database name; defaults to `examvault`.                                                                        |
| `JWT_SECRET`                | Server-only | Session-cookie signing secret.                                                                                         |
| `LEETEC_BASE_URL`           | Server-only | LeeTec API origin; defaults to `https://leetec.online`.                                                               |
| `LEETEC_API_KEY`            | Server-only | LeeTec STK Push and transaction-history authentication.                                                                |
| `GROK_PROVIDER`             | Server-only | `auto`, `xai`, or `groq`; defaults to `auto`.                                                                          |
| `XAI_API_KEY`               | Server-only | xAI API key for the Grok 4.6 provider. Use this when `GROK_PROVIDER=xai` or as the preferred key in `auto` mode.       |
| `GROQ_API_KEY`              | Server-only | Groq API key. Use this when `GROK_PROVIDER=groq` or as the fallback in `auto` mode.                                   |
| `GROK_API_KEY`              | Server-only | Optional compatibility alias for `GROQ_API_KEY`.                                                                      |
| `XAI_MODEL`                 | Server-only | Optional xAI model override; defaults to `grok-4.6`.                                                                  |
| `GROQ_MODEL`                | Server-only | Optional Groq primary model; defaults to `openai/gpt-oss-20b`.                                                        |
| `GROQ_FALLBACK_MODEL`       | Server-only | Optional additional Groq model tried before the built-in fallbacks.                                                   |
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

The production release also requires a LeeTec test STK Push, authenticated upload/download verification, administrator workflow review, and direct navigation checks for `/account`, `/login`, `/create-account`, `/reset-password`, `/verify-email`, and `/admin`.

## Vercel Deployment

Deploy from the repository root, using the provided `vercel.json`, build command `pnpm build`, and output directory `dist/public`. The Vercel function in `api/index.ts` serves tRPC, LeeTec payment initiation and reconciliation, protected downloads, GridFS uploads, OAuth routes, and the health endpoint. Direct client routes are rewritten to the Vite application while `/api/*` remains reserved for server endpoints.

Configure every required server secret in Vercel for the relevant environment, then deploy a Preview build before Production. Detailed setup and migration guidance lives in [`docs/VERCEL_MONGODB_DEPLOYMENT.md`](docs/VERCEL_MONGODB_DEPLOYMENT.md) and [`docs/LEGACY_FILE_MIGRATION.md`](docs/LEGACY_FILE_MIGRATION.md).

## References

[1]: https://leetec.online/docs "LeeTec Engine API documentation"
