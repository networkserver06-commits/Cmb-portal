# MongoDB, GridFS, and Vercel Architecture

## Design Decision

All new persistent portal records and uploaded file bytes will reside in MongoDB. Structured records remain in purpose-specific collections, while binary document bytes are stored in the `portal_files.files` and `portal_files.chunks` GridFS collections. A separate `file_metadata` collection provides authorization-friendly references, lifecycle state, ownership, and business links without exposing raw GridFS identifiers in every workflow.

| Concern                 | Design                                                                                                                                                                                     | Compatibility outcome                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| User identity and roles | Retain the existing `users` and account collections. Apply the existing authenticated request resolver to all file endpoints and continue to enforce administrator procedures server-side. | Existing password, Manus-session, student, and administrator journeys remain available.                        |
| Uploaded bytes          | Store validated binaries in a `portal_files` GridFS bucket. Store SHA-256, name, MIME type, byte count, owner, purpose, and lifecycle state in GridFS metadata and `file_metadata`.        | File bytes and metadata are stored in MongoDB while remaining streamable for controlled downloads.             |
| File validation         | Limit uploads to PDF, DOC, DOCX, PPT, PPTX, TXT, and CSV, verify extension/MIME consistency, inspect PDF signatures, normalize filenames, and reject payloads larger than 4 MiB.           | Both client and server reject unsafe or unsupported files with readable errors.                                |
| Upload transport        | Use an authenticated raw-binary HTTP endpoint with XMLHttpRequest progress reporting. Do not send base64 through tRPC.                                                                     | Progress is visible, payload bloat is removed, and server validation occurs before GridFS writes.              |
| Vercel compatibility    | Keep raw upload bodies below 4 MiB because Vercel Functions reject request bodies above 4.5 MB. Cache the MongoDB client and GridFS bucket at module scope for warm invocations.           | Uploads remain within the serverless request limit and avoid per-request connection churn.                     |
| Protected download      | Resolve the authenticated user, then apply the existing entitlement, ownership, and administrator checks before streaming the GridFS file through the Express response.                    | The existing paid-library and submission-review security model is retained without external storage redirects. |
| Business records        | Preserve `papers`, `orders`, `payments`, `entitlements`, `downloads`, `announcements`, `submissions`, `wallet_topups`, and analytics data; add `workflows` and `operational_records`.      | Existing public catalogue, payment, wallet, library, and moderation flows remain compatible.                   |
| File lifecycle          | Mark files as pending, linked, rejected, archived, or deleted. Administration can audit, unlink, and delete only unreferenced files, with all actions recorded.                            | The administrator storage workspace gains reliable GridFS cleanup rather than metadata-only cleanup.           |

## Collections and Indexes

| Collection or bucket                        | Responsibility                                                                           | Key indexes                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `users`, `accounts`                         | Account identity, roles, verification, and sessions.                                     | Existing unique email and identity indexes.                                                   |
| `submissions`                               | User-provided document metadata and moderation state.                                    | `{ userId: 1, createdAt: -1 }`, `{ status: 1, updatedAt: -1 }`.                               |
| `workflows`                                 | Durable workflow state for file publication, moderation, and migration.                  | `{ entityType: 1, entityId: 1 }`, `{ status: 1, updatedAt: -1 }`.                             |
| `operational_records`                       | Audit events for uploads, downloads, review decisions, file deletion, and admin actions. | `{ actorId: 1, createdAt: -1 }`, `{ eventType: 1, createdAt: -1 }`.                           |
| `file_metadata`                             | Owner, purpose, name, size, digest, GridFS reference, links, and lifecycle status.       | Unique `{ gridFsId: 1 }`, `{ ownerId: 1, createdAt: -1 }`, `{ lifecycle: 1, updatedAt: -1 }`. |
| `portal_files.files`, `portal_files.chunks` | Native GridFS file metadata and binary chunks.                                           | GridFS driver-managed indexes.                                                                |

## Vercel Upload Boundary

> Vercel Functions limit request and response payloads to **4.5 MB**. The portal therefore accepts files up to **4 MiB**, leaving margin for request framing and avoiding a platform-level 413 error. [1]

GridFS natively partitions stored bytes into chunks and maintains file metadata, which makes it appropriate for portal files that must stay in the same MongoDB persistence boundary as access records. [2]

| Supported request             | Limit                                                  | Server response                                                                       |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Authenticated document upload | 4 MiB                                                  | JSON file metadata and a stable file identifier.                                      |
| Client-side progress          | Byte progress via XMLHttpRequest                       | Determinate percentage and accessible status messaging.                               |
| Direct file download          | Streamed from GridFS after entitlement/ownership check | `Content-Disposition: attachment` with the validated filename.                        |
| Large legacy file             | Not accepted through Vercel upload endpoint            | Admin migration guidance requires an offline migration path or a reduced source file. |

## Legacy Storage Migration

The old `fileKey` records identify externally stored objects. The runtime will prefer `fileId`/`gridFsId` fields. A migration script will copy each authorized legacy object into GridFS, calculate its digest, write the new metadata record, update the linked paper or submission atomically at the record level, and log a migration event. The old key is preserved only as a migration reference until a manual verification window closes; it is not used for new uploads.

## References

[1]: https://vercel.com/docs/functions/limitations "Vercel Functions Limits"
[2]: https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/ "MongoDB Node.js Driver: Store Large Files with GridFS"
