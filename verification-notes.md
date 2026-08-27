# Verification notes

- Authenticated administrator session: `leeplug48@gmail.com` successfully opened `/admin` and `/admin/papers`.
- The admin Paper inventory shows a `View document` action for every populated paper row.
- The compact catalogue upload station also shows `View` alongside the Live/Paused control for uploaded papers.
- The operations moderation queue shows `View document` for a pending submission with a file, while rejected/purged submissions correctly have no file action.
- Opening a Paper inventory View document link rendered the protected PDF in the browser viewer and recorded protected view activity in the admin dashboard.
- Existing admin hide control remains visible as `Live` / `Paused` and is wired to the protected availability mutation.

## Additional validation

- The first browser upload exposed a stale server process plus a real contract bug: Free access sent `priceKes: 0` to `admin.createPaper`, which still required a positive price.
- The server validator now accepts zero only for `mode: "free"`, keeps positive-price enforcement for paid papers, and the admin form passes the selected mode.
- After restarting the development service, the authenticated admin Paper inventory still shows View document links for all populated rows, and the corrected retry is ready with University + Free access selected.

## Final authenticated verification

On 26 August 2026, the authenticated administrator session uploaded `admin-browser-probe-1787774368041.txt` through the same-origin GridFS endpoint and received HTTP 201. The administrator createPaper procedure then returned success for `Admin browser proof 1787774382047` with `priceKes: 0`, `accessMode: "free"`, `postMode: "free"`, `isAvailable: true`, and paper legacy ID 97. Opening `/api/files/6a8f45a0a03b6f9e28282bb3/view` rendered the uploaded text inline. The temporary paper and file were removed afterward.

The refreshed administrator Papers workspace showed a protected `View document` action for every displayed uploaded resource. The redesigned upload station was reviewed at the browser's narrow responsive layout: it presents the secure station header, education-level and access guidance, compact metadata fields, document upload state, and recent catalogue files with View document and Live/Paused actions. The mobile screenshot runner itself captured the unauthenticated loading skeleton, while the authenticated browser review confirmed the resolved content at the project's responsive breakpoint.

- After reauthentication, the live `/admin/papers` route resolved successfully and displayed `Admin browser proof 1787774382047` plus the other catalogue resources. Every populated Paper inventory row exposed a visible `View document` link, and the redesigned upload station loaded with compact responsive fields and recent catalogue file actions.

- End-to-end visible form verification: The authenticated administrator form successfully published `Admin form verification 2026-08-26` with University + Free access. The resource appeared immediately in the inventory with a working `View document` link. The temporary paper (legacy ID 105) and its GridFS file were then permanently deleted through the guarded administrator mutation, and subsequent checks confirmed the paper is unlisted and the file route returns 404.

- Final validation pass: the authenticated admin Papers route loaded with the empty Free-access form state and the existing Paper inventory View document actions. The form is ready for negative-path checks without creating another document.

- The authenticated admin paper form exposes explicit negative-path messages: `Choose a document before saving this resource.`, `Choose an education level before saving this resource.`, and the server-side paid/free price rules remain enforced. The empty-form browser submission focused the required price control without creating a paper.

- Authenticated negative-path check passed: with Free access selected and no document attached, the visible admin form blocked submission and displayed `Choose a document before saving this resource.` No new catalogue record was created.

- The live form’s explicit missing-document validation is confirmed. The browser session currently exposes four hidden file inputs because the page also renders replacement controls; the upload helper did not accept the raw DOM index, so the next retry will activate the visible picker label first.

- Authenticated paper negative-path check passed: with valid metadata, a READY document, Free access, and no education level, the visible form blocked submission and displayed `Choose an education level before saving this resource.` No catalogue paper was created.

- Authenticated pricing check passed: with Paystack checkout selected and price `0`, the visible paper form blocked submission and displayed `Enter a positive price in KES.` Free access automatically hides the price field and submits with zero KES, so the UI does not permit a non-zero free price.

- Authenticated post negative-path check passed: after switching the same visible station to `Catalogue post with document`, removing the selected file, and pressing `Publish catalogue post`, the form blocked submission and displayed `Choose a document before saving this resource.` No post was created.

- Authenticated post missing-education check passed: with a valid title/course/cycle/unit/paper type, a ready document, and `Choose education level` selected, pressing `Publish catalogue post` blocked submission and displayed `Choose an education level before saving this resource.` No new catalogue resource appeared.

- Authenticated post paid-pricing check passed: after selecting University and Paystack checkout while leaving the price at `0`, pressing `Publish catalogue post` blocked submission and displayed `Enter a positive price in KES.` The catalogue list remained unchanged and no post was created.

- Authenticated Free-access design check passed in the same station: selecting Free access hides the price control, the UI labels the resource as free, and existing verified free resources display `Free access · KES 0`; the earlier successful upload persisted `priceKes: 0` with `accessMode: free`.

- Public browser verification: the signed-out catalogue rendered `View free paper` links, and selecting one navigated to `/paper/117` without an account prompt. The branded reader rendered the paper metadata, `Free access` badge, `Full paper preview`, `No account required to read this resource.`, and `Open document` link. Chromium reported `Failed to load PDF document` because the temporary runtime fixture intentionally contains only a PDF signature rather than a complete renderable PDF; the route returned the expected inline response.
- Public reader validation with existing resource `/paper/97`: Chromium rendered the full text document inside the `Full paper preview` frame, with no sign-in prompt. The page showed the `Free access` badge, metadata, `Open document`, and `No account required to read this resource.`
