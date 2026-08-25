# ScholarShelf Production Launch Checklist

Complete this checklist with test credentials before enabling live payments. The portal’s persistent records and uploaded document bytes are stored in MongoDB and GridFS; payment collection runs on Paystack-hosted checkout.

## Configuration Matrix

| Area       | Required action                                                                                                           | Validation                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Public URL | Set `APP_BASE_URL` to the canonical public HTTPS URL, without a trailing slash.                                           | Email links and Paystack return links use the deployed domain.                                                  |
| Paystack   | Configure matching `PAYSTACK_SECRET_KEY` and `VITE_PAYSTACK_PUBLIC_KEY` values for the intended test or live environment. | The administrator readiness view reports matching modes without exposing a key.                                 |
| Webhook    | Set `https://YOUR_PUBLIC_DOMAIN/api/paystack/webhook` in Paystack.                                                        | A signed successful event creates one entitlement or wallet credit; replaying it does not duplicate fulfilment. |
| Database   | Configure `MONGODB_URI` and `MONGODB_DATABASE`.                                                                           | MongoDB connects, creates required indexes, and stores portal records plus GridFS `portal_files` data.          |
| Storage    | Upload only authorized documents through the administrator or student workflow.                                           | A validated file receives a GridFS ID and metadata record; an entitled account can download it.                 |
| Hosting    | Deploy from repository root with `vercel.json`, `pnpm build`, and `dist/public`.                                          | Direct navigation to application routes works; `/api/*` remains routed to the serverless function.              |
| Email      | Configure `RESEND_API_KEY` and `PASSWORD_RESET_FROM_EMAIL`.                                                               | Account verification and password-reset messages use the canonical public URL.                                  |
| GitHub     | Review the changed files and push only after all checks pass.                                                             | No `.env` files, secrets, or uploaded documents are present in the repository.                                  |

## Hosted Checkout Test

1. Create a priced paper and attach an authorized document through the administrator workspace.
2. Sign in as a student, select the paper, and start checkout.
3. Confirm the portal redirects to a Paystack-hosted authorization URL without asking for custom payer contact or merchant identifiers.
4. Complete a Paystack test payment with an enabled method.
5. Confirm the verified reference, KES currency, and amount produce exactly one entitlement.
6. Return to the student library, download the paper, and confirm a download event is recorded.
7. Repeat the signed webhook event and confirm it cannot create a duplicate entitlement or payment record.

## Wallet Test

1. Open **Wallet & funds**, enter a valid KES amount, and continue to Paystack-hosted checkout.
2. Complete a Paystack test payment, then return to the account URL.
3. Confirm the wallet top-up becomes paid exactly once and the balance/ledger update without exposing any customer payment number.

## Release Gates

```bash
pnpm install --frozen-lockfile
pnpm verify:launch
pnpm test
pnpm check
pnpm build
```

Do not enable live payments until the webhook, account emails, protected download path, GridFS upload path, administrator authorization, student authorization, and both Paystack test flows have passed. Only distribute examination materials that the operator is explicitly authorized to provide.
