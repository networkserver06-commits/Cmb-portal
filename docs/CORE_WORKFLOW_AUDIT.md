# Core Workflow Audit

## Preservation Baseline

The portal currently operates as an examination-paper library. Its core experience combines a public catalogue with authenticated student access, administrator operations, payment-gated resources, free resource sharing, and account support. The upgrade must retain these outcomes while replacing the current object-storage and inline-base64 upload path with authenticated MongoDB/GridFS storage.

| Area                     | Existing workflow that must remain available                                                                                                                  | Preservation decision                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Public catalogue         | Visitors browse live MongoDB-backed papers and announcements, then select free or paid resources.                                                             | Retain routes, catalogue queries, availability controls, and empty states.                                   |
| Account and roles        | Users create or verify accounts, sign in, recover passwords, access student resources, and reach the administrator workspace only when their role is `admin`. | Retain both account and Manus-session resolution; enforce roles server-side for all privileged operations.   |
| Purchases and library    | Paid papers use Paystack, server-side verification, idempotent fulfilment, entitlement records, and protected downloads.                                      | Preserve payment references, entitlement checks, purchase history, and audit events.                         |
| Free resources           | Users can claim free resources and add them to their protected library without a payment.                                                                     | Retain entitlement creation and library access without introducing a payment requirement.                    |
| Student submissions      | Authenticated users submit authorized papers, then track pending, approved, rejected, or published status.                                                    | Replace base64 mutation uploads with secure GridFS uploads while retaining metadata and moderation statuses. |
| Wallet                   | Users initiate wallet top-ups through hosted checkout, receive an asynchronous payment state, and see confirmed balance and ledger history.                   | Preserve server-side payment confirmation and idempotent ledger updates.                                     |
| Administrator workspace  | Administrators manage papers, posts, users, payments, submissions, announcements, analytics, maintenance controls, and storage records.                       | Preserve each destination while upgrading file records, activity trails, and status controls.                |
| Direct Vercel navigation | Client routes such as account, login, verification, reset, library, and admin must resolve after a direct visit or browser refresh.                           | Keep API rewrites distinct from the SPA fallback and cover them with launch checks.                          |

## Upload Baseline and Required Change

The existing server accepts file bytes through tRPC inputs as base64 and forwards them to an object-storage adapter. That design has weak progress reporting, inflates payload size, and cannot satisfy the requested MongoDB/GridFS storage boundary. The upgraded flow will use authenticated HTTP upload endpoints, server-side MIME and byte validation, GridFS binary storage, a `file_metadata` collection, and owner/admin authorization for retrieval.

## Collections to Preserve and Extend

Existing collection semantics for `users`, `papers`, `orders`, `payments`, `entitlements`, `downloads`, `announcements`, `submissions`, `wallet_topups`, and analytics events will remain. The upgrade will introduce clear index-backed persistence for `file_metadata`, `workflows`, and `operational_records`, while GridFS manages file bytes in its native files and chunks collections.

## Compatibility Constraints

The Vercel adapter creates the Express application lazily and reuses it across warm invocations. MongoDB connections and GridFS buckets must therefore be cached safely at module scope, upload routes must use streaming-compatible request handling, and no long-lived worker or local filesystem dependency may be introduced.
