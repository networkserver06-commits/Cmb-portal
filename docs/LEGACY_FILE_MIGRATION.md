# Legacy File Migration Runbook

## Safe Migration Principle

The upgraded portal keeps legacy `fileKey` values readable until each linked paper or submission has been verified in GridFS. No legacy object should be deleted during the initial migration. The production route first uses `fileId` for GridFS and otherwise retains the legacy signed-download fallback, enabling a phased transition without breaking a learner’s library.

## Record-by-Record Migration

| Stage         | Administrator action                                                                                                                     | Verification required                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Inventory     | Export all `papers` and `submissions` that contain `fileKey` but no `fileId`.                                                            | Count inventory by record type and preserve the original key in the migration worksheet. |
| Retrieve      | Obtain the file through the existing protected legacy download mechanism.                                                                | Confirm filename, MIME type, and byte size match the source record.                      |
| Upload        | Use the administrator uploader to submit the document to GridFS.                                                                         | The interface returns a successful secure-upload state with visible progress completion. |
| Link          | Replace the original paper file through **Replace protected paper file**, or approve the matching submission after it has been uploaded. | Confirm the new `fileId`, `file_metadata` record, and a `linked` lifecycle state.        |
| Download test | Open the paper from an entitled student library account.                                                                                 | The protected `/api/papers/:paperId/download` route streams the GridFS document.         |
| Audit         | Review the administrator storage workspace and operational records.                                                                      | The file must be `protected` or `linked`, not an orphan cleanup candidate.               |

## Cutover Rules

The migration is complete for a record only when the linked GridFS file downloads successfully for an entitled student and the original paper metadata includes `fileId`. Keep the legacy `fileKey` for a documented rollback window. Remove an old object only after a second administrator verifies the record and a current backup exists.

## Rollback

If a migrated document fails validation or download, restore the record to its preserved `fileKey`, remove the unreferenced GridFS file from the storage workspace after the retention window, and record the incident in the operational log. Because the legacy fallback remains active, this rollback does not require a code deployment.
