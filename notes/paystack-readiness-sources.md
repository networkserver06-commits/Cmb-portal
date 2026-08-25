# Paystack Readiness Sources

Official Paystack authentication documentation: https://paystack.com/docs/api/authentication/

Paystack documents that API requests use a server-side secret key in the Bearer Authorization header, public keys are for frontend initiation, and secret keys must not be committed or exposed client-side. Test and live environments have separate key pairs; test keys use `pk_test_`/`sk_test_`, while live keys use `pk_live_`/`sk_live_`. Live transactions involve real money.

Official verification documentation: https://paystack.com/docs/payments/verify-payments/

Paystack identifies webhooks as preferred for successful payment confirmation and recommends server-side transaction verification, with transaction status read from `data.status` rather than the top-level API response status. The portal already validates signed webhooks, verifies transaction references and amounts, and uses idempotent fulfilment.

Official payment channels documentation: https://paystack.com/docs/payments/payment-channels/

Paystack notes that supported payment channels depend on account and country availability, and Charge API calls are made from the server using the secret key. The admin readiness panel therefore reports configuration and connectivity state without displaying any secret values or initiating a live charge.

## Wallet top-up reference

Official Paystack support states that Pay with M-PESA lets Kenyan customers pay Kenya-based businesses using an M-PESA-enabled phone number; the customer receives a prompt on that device and authorizes with an OTP and PIN. Paystack’s support guidance also states a maximum of KES 150,000 per M-PESA transaction and that Mobile Money must be enabled in Paystack Preferences. Sources: https://support.paystack.com/en/articles/2128322 and https://paystack.com/docs/payments/payment-channels/ (retrieved 2026-08-23).

## Charge payload correction — 2026-08-23

The Charge API requires the phone-based `mpesa` flow and Till-based `mptill` flow to use distinct payloads. Wallet top-ups now send `{ provider: "mpesa", phone }`; paper Till checkout sends `{ provider: "mptill", account: "5704906" }` without a phone. The adapter also rejects JSON responses with a false top-level `status` even when the HTTP response is 200, preventing a false-success polling state. Sources: https://paystack.com/docs/payments/payment-channels/ and https://paystack.com/docs/api/charge/ (retrieved 2026-08-23).
