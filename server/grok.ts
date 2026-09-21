import { entitlementFor, mongo, paperById } from "./mongoStore";
import { readPortalFileBytes } from "./fileStore";

export const GROK_DAILY_LIMIT = 100;
export const GROK_MODEL = process.env.GROK_MODEL?.trim() || "grok-4.6";
const XAI_BASE_URL = "https://api.x.ai/v1";
const MAX_PROMPT_CHARS = 6000;

type GrokUsageDoc = {
  userId: number;
  dayKey: string;
  usedCredits: number;
  updatedAt: Date;
};

type GrokResponse = {
  id?: string;
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string } | string;
};

function apiKey() {
  return process.env.XAI_API_KEY?.trim() ?? "";
}

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function isDuplicateKey(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
  );
}

export function grokConfigured() {
  return /^xai-[A-Za-z0-9_-]+$/.test(apiKey()) || apiKey().length >= 20;
}

export async function grokUsageForUser(userId: number) {
  const now = new Date();
  const nextUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  const row = await (await mongo())
    .collection<GrokUsageDoc>("grok_usage")
    .findOne({ userId, dayKey: dayKey() });
  const usedCredits = Number(row?.usedCredits ?? 0);
  return {
    usedCredits,
    remainingCredits: Math.max(0, GROK_DAILY_LIMIT - usedCredits),
    dailyLimit: GROK_DAILY_LIMIT,
    resetsAtUtc: nextUtcMidnight.toISOString(),
  } as const;
}

export async function consumeGrokCredit(userId: number) {
  const db = await mongo();
  const key = dayKey();
  try {
    await db.collection<GrokUsageDoc>("grok_usage").updateOne(
      { userId, dayKey: key },
      {
        $setOnInsert: {
          userId,
          dayKey: key,
          usedCredits: 0,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  const updated = await db
    .collection<GrokUsageDoc>("grok_usage")
    .findOneAndUpdate(
      { userId, dayKey: key, usedCredits: { $lt: GROK_DAILY_LIMIT } },
      { $inc: { usedCredits: 1 }, $set: { updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  if (!updated)
    throw new Error(
      `You have used all ${GROK_DAILY_LIMIT} Grok requests for today. Your free allowance resets at 00:00 UTC.`
    );
  return {
    usedCredits: Number(updated.usedCredits),
    remainingCredits: Math.max(
      0,
      GROK_DAILY_LIMIT - Number(updated.usedCredits)
    ),
  } as const;
}

export async function refundGrokCredit(userId: number) {
  await (await mongo())
    .collection<GrokUsageDoc>("grok_usage")
    .updateOne(
      { userId, dayKey: dayKey(), usedCredits: { $gt: 0 } },
      { $inc: { usedCredits: -1 }, $set: { updatedAt: new Date() } }
    );
}

function extractOutputText(payload: GrokResponse) {
  const text = (payload.output ?? [])
    .flatMap(item => item.content ?? [])
    .filter(item => item.type === "output_text" && typeof item.text === "string")
    .map(item => item.text!.trim())
    .filter(Boolean)
    .join("\n\n");
  if (text) return text;
  throw new Error("Grok returned no answer. Please try again.");
}

async function parseXaiResponse(response: Response, action: string) {
  let payload: GrokResponse;
  try {
    payload = (await response.json()) as GrokResponse;
  } catch {
    throw new Error(`Grok ${action} returned an invalid response.`);
  }
  if (!response.ok || payload.error) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message;
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "Grok is not configured correctly. Add a valid server-only XAI_API_KEY to Vercel."
      );
    throw new Error(message || `Grok ${action} failed (${response.status}).`);
  }
  return payload;
}

async function uploadDocument(bytes: Buffer, fileName: string, mimeType: string) {
  const form = new FormData();
  const documentBytes = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  form.append("file", new Blob([documentBytes], { type: mimeType }), fileName);
  form.append("purpose", "assistants");
  const response = await fetch(`${XAI_BASE_URL}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  return await parseXaiResponse(response, "file upload");
}

async function deleteDocument(fileId: string) {
  await fetch(`${XAI_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiKey()}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}

async function paperAttachment(userId: number, paperId: number) {
  const paper = await paperById(paperId);
  if (!paper || !paper.isAvailable)
    throw new Error("The selected study document is unavailable.");
  if (!(await entitlementFor(userId, paperId)))
    throw new Error("Unlock this document before asking Grok about it.");
  if (!paper.fileId) return { paper, fileId: undefined };
  const bytes = await readPortalFileBytes(paper.fileId);
  const uploaded = await uploadDocument(
    bytes,
    paper.fileName || `study-document-${paperId}`,
    paper.fileMimeType || "application/octet-stream"
  );
  const fileId = String((uploaded as { id?: string }).id ?? "");
  if (!fileId) throw new Error("Grok did not accept the study document upload.");
  return { paper, fileId };
}

export async function askGrok(input: {
  userId: number;
  prompt: string;
  paperId?: number;
  mode: "ask" | "summarize";
}) {
  if (!grokConfigured())
    throw new Error(
      "Grok is not configured yet. Add XAI_API_KEY to the Vercel production environment."
    );
  const prompt = input.prompt.trim();
  if (input.mode === "ask" && prompt.length < 2)
    throw new Error("Ask Grok a question with at least 2 characters.");
  if (prompt.length > MAX_PROMPT_CHARS)
    throw new Error(`Keep your Grok request under ${MAX_PROMPT_CHARS} characters.`);
  if (input.mode === "summarize" && !input.paperId)
    throw new Error("Choose a document before asking Grok for a summary.");

  const credit = await consumeGrokCredit(input.userId);
  let uploadedFileId: string | undefined;
  try {
    let paperContext = "No specific study document was selected.";
    let fileId: string | undefined;
    if (input.paperId) {
      const attachment = await paperAttachment(input.userId, input.paperId);
      fileId = attachment.fileId;
      uploadedFileId = fileId;
      paperContext = `Selected document: ${attachment.paper.title}. Course: ${attachment.paper.course}. Unit: ${attachment.paper.unit}. Description: ${attachment.paper.description ?? "Not provided"}.`;
    }
    const userText =
      input.mode === "summarize"
        ? "Summarize this study document for a university student. Include: a short overview, key concepts, important definitions, likely exam points, and five revision questions. Do not invent facts that are not in the document."
        : prompt;
    const content: Array<Record<string, string>> = [
      { type: "input_text", text: `${paperContext}\n\nStudent request: ${userText}` },
    ];
    if (fileId) content.push({ type: "input_file", file_id: fileId });
    const response = await fetch(`${XAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        store: false,
        input: [
          {
            role: "system",
            content:
              "You are ScholarShelf Grok, a patient university study assistant. Explain clearly, use headings and bullets, distinguish document facts from general guidance, encourage academic integrity, and never claim to have read a document unless it was attached.",
          },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await parseXaiResponse(response, "response");
    return {
      answer: extractOutputText(payload),
      model: GROK_MODEL,
      responseId: payload.id ?? null,
      ...credit,
    } as const;
  } catch (error) {
    await refundGrokCredit(input.userId);
    throw error;
  } finally {
    if (uploadedFileId) await deleteDocument(uploadedFileId);
  }
}
