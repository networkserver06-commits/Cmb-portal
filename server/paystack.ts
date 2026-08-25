import crypto from "node:crypto";

const PAYSTACK_API = "https://api.paystack.co";

export async function getPaystackReadiness() {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  const publicKey = process.env.VITE_PAYSTACK_PUBLIC_KEY ?? "";
  const secretMode = secret.startsWith("sk_live_")
    ? "live"
    : secret.startsWith("sk_test_")
      ? "test"
      : "unknown";
  const publicMode = publicKey.startsWith("pk_live_")
    ? "live"
    : publicKey.startsWith("pk_test_")
      ? "test"
      : "unknown";
  const checks = {
    serverSecret: /^sk_(live|test)_[A-Za-z0-9_-]+$/.test(secret),
    publicKey: /^pk_(live|test)_[A-Za-z0-9_-]+$/.test(publicKey),
    modeMatch: secretMode !== "unknown" && secretMode === publicMode,
    hostedCheckout: true,
  };
  let apiReachable = false;
  let apiMessage = "Not checked";
  if (checks.serverSecret) {
    try {
      const response = await fetch(`${PAYSTACK_API}/balance`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(4000),
      });
      apiReachable = response.ok;
      apiMessage = response.ok
        ? "Paystack API reachable"
        : `Paystack API returned ${response.status}`;
    } catch (error) {
      apiMessage =
        error instanceof Error && error.name === "TimeoutError"
          ? "Paystack API check timed out"
          : "Paystack API unavailable";
    }
  }
  const ready = Object.values(checks).every(Boolean) && apiReachable;
  return {
    ready,
    mode: secretMode,
    publicMode,
    apiReachable,
    apiMessage,
    checks,
    checkedAt: new Date().toISOString(),
  } as const;
}

export function createPaymentReference(paperId: number, userId: number) {
  return `CBM-${paperId}-${userId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export function createWalletTopUpReference(userId: number) {
  return `WALLET-${userId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export function isValidPaystackSignature(
  rawBody: string,
  signature: string | undefined
) {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const digest = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature);
  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

type PaystackResponse = {
  status: boolean;
  message?: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    channel?: string;
    display_text?: string;
    authorization_url?: string;
  };
};

async function readPaystackResponse(
  response: Response,
  action: string
): Promise<PaystackResponse> {
  let payload: PaystackResponse | undefined;
  try {
    payload = (await response.json()) as PaystackResponse;
  } catch {
    throw new Error(
      `Paystack ${action} returned an invalid response (${response.status}).`
    );
  }
  if (!response.ok || payload.status !== true) {
    const providerMessage =
      payload.message?.trim() || payload.data?.display_text?.trim();
    throw new Error(
      providerMessage
        ? `Paystack ${action} failed: ${providerMessage}`
        : `Paystack ${action} failed with status ${response.status}.`
    );
  }
  return payload;
}

export async function verifyPaystackTransaction(reference: string) {
  const response = await fetch(
    `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    }
  );
  return readPaystackResponse(response, "verification") as Promise<
    PaystackResponse & {
      data?: {
        status?: string;
        reference?: string;
        amount?: number;
        currency?: string;
        channel?: string;
      };
    }
  >;
}

export async function initializePaystackCheckout(input: {
  email: string;
  amountKes: number;
  reference: string;
  callbackUrl: string;
}) {
  const response = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(input.amountKes * 100),
      email: input.email,
      currency: "KES",
      reference: input.reference,
      callback_url: input.callbackUrl,
    }),
  });
  const payload = await readPaystackResponse(
    response,
    "checkout initialization"
  );
  if (!payload.data?.authorization_url)
    throw new Error("Paystack did not return a checkout authorization URL.");
  return {
    reference: payload.data.reference ?? input.reference,
    authorizationUrl: payload.data.authorization_url,
  };
}

export function paymentMatchesOrder(
  data: { reference?: string; amount?: number; currency?: string },
  reference: string,
  amountKes: number
) {
  return (
    data.reference === reference &&
    data.currency === "KES" &&
    data.amount === Math.round(amountKes * 100)
  );
}

import { fulfillPayment } from "./mongoStore";

export async function fulfillSuccessfulPayment(
  reference: string,
  providerData: {
    reference?: string;
    amount?: number;
    currency?: string;
    channel?: string;
  },
  rawEvent: string
) {
  if (!providerData.reference) throw new Error("Payment reference unavailable");
  return fulfillPayment(reference, providerData, rawEvent);
}
