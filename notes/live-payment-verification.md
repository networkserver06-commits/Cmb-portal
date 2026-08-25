# Live Paystack verification findings

On the authenticated production account route at https://portal.leetec.online/account, the student workspace and Wallet & funds route load successfully. The account session used the supplied test account. Earlier authorized KES 10 attempts with 0116553618 and 254723617436 both returned `Paystack charge failed: Invalid phone number format` before any M-Pesa prompt; the displayed wallet balance remained KES 0 and no debit was observed.

The local fix canonicalizes Kenyan numbers to Paystack’s documented `+254...` format. It was pushed to GitHub main at commit `2e25a07`. The production route currently does not expose `/__manus__/version.json` and returned a normal 404, so the live deployment version cannot be verified from that endpoint. A fresh Vercel deployment is required before another charge attempt can prove the fix in production.
