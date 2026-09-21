# ScholarShelf Production Launch Checklist

Complete this checklist with test credentials before enabling live payments. The portal’s persistent records and uploaded document bytes are stored in MongoDB and GridFS; payment collection runs through LeeTec M-Pesa STK Push.

## Configuration Matrix

| Area       | Required action                                                                                                           | Validation                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Public URL | Set `APP_BASE_URL` to the canonical public HTTPS URL, without a trailing slash.                                           | Email links use the deployed domain.                                                                            |
| LeeTec     | Configure `LEETEC_BASE_URL` and the server-only `LEETEC_API_KEY` in Vercel.                                              | The administrator readiness view reports API reachability without exposing the key.                             |
| Reconciliation | Confirm LeeTec transaction history is available for the configured account.                                           | A successful transaction creates one entitlement or wallet credit; repeated polling does not duplicate fulfilment. |
| Database   | Configure `MONGODB_URI` and `MONGODB_DATABASE`.                                                                           | MongoDB connects, creates required indexes, and stores portal records plus GridFS `portal_files` data.          |
| Storage    | Upload only authorized documents through the administrator or student workflow.                                           | A validated file receives a GridFS ID and metadata record; an entitled account can download it.                 |
| Hosting    | Deploy from repository root with `vercel.json`, `pnpm build`, and `dist/public`.                                          | Direct navigation to application routes works; `/api/*` remains routed to the serverless function.              |
| Email      | Configure `RESEND_API_KEY` and `PASSWORD_RESET_FROM_EMAIL`.                                                               | Account verification and password-reset messages use the canonical public URL.                                  |
| GitHub     | Review the changed files and push only after all checks pass.                                                             | No `.env` files, secrets, or uploaded documents are present in the repository.                                  |

## Hosted Checkout Test

1. Create a priced paper and attach an authorized document through the administrator workspace.
2. Sign in as a student, select the paper, and start checkout.
3. Enter a valid Kenyan phone number and confirm the portal sends a LeeTec STK Push.
4. Approve the LeeTec test payment on the phone.
5. Confirm the verified reference, KES currency, and amount produce exactly one entitlement.
6. Return to the student library, download the paper, and confirm a download event is recorded.
7. Poll the same reference again and confirm it cannot create a duplicate entitlement or payment record.

## Wallet Test

1. Open **Wallet & funds**, enter a Kenyan phone number and valid KES amount, then start the LeeTec STK Push.
2. Approve the LeeTec test payment on the phone and return to the account page.
3. Confirm the wallet top-up becomes paid exactly once and the balance/ledger update without exposing any customer payment number.

## Release Gates

```bash
pnpm install --frozen-lockfile
pnpm verify:launch
pnpm test
pnpm check
pnpm build
```

Do not enable live payments until LeeTec STK Push, transaction-history reconciliation, account emails, protected download path, GridFS upload path, administrator authorization, and student authorization have passed. Only distribute examination materials that the operator is explicitly authorized to provide.
