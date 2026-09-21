const DEFAULT_LEETEC_BASE_URL = "https://leetec.online";
export const MIN_LEETEC_AMOUNT_KES = 100;

export type LeetecTransaction = {
  status?: string;
  reference?: string;
  accountReference?: string;
  account_reference?: string;
  amount?: number | string;
  currency?: string;
  channel?: string;
  transactionId?: string;
  transaction_id?: string;
  [key: string]: unknown;
};

type LeetecResponse = {
  status?: boolean;
  message?: string;
  data?: unknown;
  transactions?: unknown;
  collections?: unknown;
  [key: string]: unknown;
};

function baseUrl() {
  return (process.env.LEETEC_BASE_URL || DEFAULT_LEETEC_BASE_URL).replace(
    /\/+$/,
    ""
  );
}

function apiKey() {
  return process.env.LEETEC_API_KEY ?? "";
}

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
  };
}

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function transactionReference(transaction: LeetecTransaction) {
  return String(
    transaction.accountReference ??
      transaction.account_reference ??
      transaction.reference ??
      ""
  );
}

function transactionRows(payload: LeetecResponse): LeetecTransaction[] {
  const candidates = [payload.transactions, payload.collections, payload.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as LeetecTransaction[];
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      for (const key of ["transactions", "collections", "data", "results"])
        if (Array.isArray(nested[key])) return nested[key] as LeetecTransaction[];
    }
  }
  if (Array.isArray(payload)) return payload as unknown as LeetecTransaction[];
  return [];
}

async function readResponse(response: Response, action: string) {
  let payload: LeetecResponse;
  try {
    payload = (await response.json()) as LeetecResponse;
  } catch {
    throw new Error(`LeeTec ${action} returned an invalid response (${response.status}).`);
  }
  const rawMessage =
    payload.message ?? payload.error ?? payload.detail ?? payload.reason ?? "";
  const message =
    typeof rawMessage === "string"
      ? rawMessage.trim()
      : JSON.stringify(rawMessage);
  const rejected =
    !response.ok ||
    payload.status === false ||
    payload.success === false ||
    payload.accepted === false;
  if (rejected) {
    console.error(`[LeeTec] ${action} rejected`, {
      httpStatus: response.status,
      providerStatus: payload.status ?? null,
      accepted: payload.accepted ?? null,
      message: message || null,
    });
    const actionableMessage =
      message ===
      "The STK request was not accepted and no payment record was created. Correct the error and retry."
        ? "LeeTec rejected the STK Push with HTTP 400 but gave no specific reason. Check that this API key belongs to the LeeTec workspace with an active M-Pesa destination, use an eligible Kenyan M-Pesa number, and retry with an amount of at least KES 100."
        : message;
    throw new Error(
      actionableMessage
        ? `LeeTec ${action} failed: ${actionableMessage}`
        : `LeeTec ${action} failed with status ${response.status}.`
    );
  }
  return payload;
}

export function normalizeKenyanPhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const withoutPlus = compact.startsWith("+") ? compact.slice(1) : compact;
  const normalized = withoutPlus.startsWith("00")
    ? withoutPlus.slice(2)
    : withoutPlus;
  const withCountryCode = normalized.startsWith("254")
    ? normalized
    : normalized.startsWith("0")
      ? `254${normalized.slice(1)}`
      : /^[17]\d{8}$/.test(normalized)
        ? `254${normalized}`
        : normalized;
  if (!/^254(?:1|7)\d{8}$/.test(withCountryCode))
    throw new Error("Enter a valid Kenyan mobile number, for example 0712345678.");
  return withCountryCode;
}

export function createPaymentReference(paperId: number, userId: number) {
  void paperId;
  void userId;
  return `CBM${Date.now().toString(36)}${cryptoRandomSuffix().slice(0, 8)}`;
}

export function createWalletTopUpReference(userId: number) {
  void userId;
  return `WAL${Date.now().toString(36)}${cryptoRandomSuffix().slice(0, 8)}`;
}

function cryptoRandomSuffix() {
  const bytes = new Uint8Array(8);
  globalThis.crypto?.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function getLeetecReadiness() {
  const key = apiKey();
  const checks = {
    serverKey: /^sk_(live|test)_[A-Za-z0-9_-]+$/.test(key),
    stkPush: true,
    transactionHistory: true,
  };
  let apiReachable = false;
  let apiMessage = "Not checked";
  if (checks.serverKey) {
    try {
      const response = await fetch(`${baseUrl()}/api/v1/transactions`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(4000),
      });
      apiReachable = response.ok;
      apiMessage = response.ok
        ? "LeeTec API reachable"
        : `LeeTec API returned ${response.status}`;
    } catch (error) {
      apiMessage =
        error instanceof Error && error.name === "TimeoutError"
          ? "LeeTec API check timed out"
          : "LeeTec API unavailable";
    }
  }
  return {
    ready: Object.values(checks).every(Boolean) && apiReachable,
    apiReachable,
    apiMessage,
    checks,
    checkedAt: new Date().toISOString(),
  } as const;
}

export async function initializeLeetecStkPush(input: {
  phoneNumber: string;
  amountKes: number;
  accountReference: string;
}) {
  if (!/^sk_(live|test)_[A-Za-z0-9_-]+$/.test(apiKey()))
    throw new Error(
      "LeeTec API key is missing or invalid. Set the server-only LEETEC_API_KEY in Vercel."
    );
  if (input.amountKes < MIN_LEETEC_AMOUNT_KES)
    throw new Error(
      `LeeTec STK Push amounts must be at least KES ${MIN_LEETEC_AMOUNT_KES}.`
    );
  const phoneNumber = normalizeKenyanPhone(input.phoneNumber);
  const response = await fetch(`${baseUrl()}/api/v1/stkpush`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      phoneNumber,
      amount: Math.round(input.amountKes),
      accountReference: input.accountReference,
    }),
  });
  const payload = await readResponse(response, "STK Push");
  return { phoneNumber, payload };
}

export async function findLeetecTransaction(reference: string) {
  const response = await fetch(`${baseUrl()}/api/v1/transactions`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  const payload = await readResponse(response, "transaction history");
  const transaction = transactionRows(payload).find(
    row => transactionReference(row) === reference
  );
  return transaction ?? null;
}

export function paymentMatchesOrder(
  transaction: LeetecTransaction | null,
  reference: string,
  amountKes: number
) {
  if (!transaction) return false;
  const amount = Number(transaction.amount);
  const currency = String(transaction.currency ?? "KES").toUpperCase();
  return (
    transactionReference(transaction) === reference &&
    currency === "KES" &&
    Number.isFinite(amount) &&
    amount === Math.round(amountKes)
  );
}

export function paymentStatus(transaction: LeetecTransaction | null) {
  const status = normalizeStatus(transaction?.status);
  if (status === "success") return "paid" as const;
  if (["failed", "cancelled"].includes(status)) return "failed" as const;
  return "pending" as const;
}

export function ledgerPaymentData(transaction: LeetecTransaction) {
  return {
    ...transaction,
    reference: transactionReference(transaction),
    currency: String(transaction.currency ?? "KES").toUpperCase(),
    amount: Math.round(Number(transaction.amount) * 100),
  };
}

export async function verifyLeetecTransaction(reference: string) {
  return findLeetecTransaction(reference);
}
