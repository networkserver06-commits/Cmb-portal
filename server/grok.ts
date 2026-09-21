import Groq from "groq-sdk";
import { entitlementFor, mongo, paperById } from "./mongoStore";
import { readPortalFileBytes } from "./fileStore";
import { officePreviewFileType, renderOfficePreview } from "./officePreview";

export const GROK_DAILY_LIMIT = 100;
export const GROK_MODEL = process.env.GROK_MODEL?.trim() || "grok-4.6";
const XAI_BASE_URL = "https://api.x.ai/v1";
const MAX_PROMPT_CHARS = 6000;
const MAX_LOCAL_DOCUMENT_CHARS = 120_000;
const GROQ_DEFAULT_MODEL = "openai/gpt-oss-20b";
const GROQ_FALLBACK_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3-32b"];

type GrokProvider = "xai" | "groq";
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
type PaperContext = {
  title: string;
  course: string;
  unit: string;
  description: string;
  fileId?: string;
  localText?: string;
  textAvailable?: boolean;
};

function cleanSecret(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" && last === "\"") || (first === "'" && last === "'"))
      return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
function xaiKey() {
  return cleanSecret(process.env.XAI_API_KEY);
}
function groqKey() {
  return (
    cleanSecret(process.env.GROQ_API_KEY) ||
    cleanSecret(process.env.GROK_API_KEY) ||
    ""
  );
}
function providerPreference() {
  const value = process.env.GROK_PROVIDER?.trim().toLowerCase();
  return value === "xai" || value === "groq" ? value : "auto";
}
export function activeGrokProvider(): GrokProvider {
  const preference = providerPreference();
  if (preference === "xai") return "xai";
  if (preference === "groq") return "groq";
  return xaiKey() ? "xai" : "groq";
}
export function grokProviderOrder(): GrokProvider[] {
  const preference = providerPreference();
  if (preference === "xai") return ["xai"];
  if (preference === "groq") return ["groq"];
  return (["xai", "groq"] as GrokProvider[]).filter(provider =>
    Boolean(keyForProvider(provider))
  );
}
function keyForProvider(provider: GrokProvider) {
  return provider === "xai" ? xaiKey() : groqKey();
}
function providerName(provider: GrokProvider) {
  return provider === "xai" ? "xAI Grok" : "Groq";
}
function modelCandidates(provider: GrokProvider) {
  if (provider === "xai") return [process.env.XAI_MODEL?.trim() || GROK_MODEL];
  return [
    process.env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL,
    process.env.GROQ_FALLBACK_MODEL?.trim() || "",
    ...GROQ_FALLBACK_MODELS,
  ].filter(Boolean).filter((model, index, all) => all.indexOf(model) === index);
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
  return grokProviderOrder().length > 0;
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
    provider: activeGrokProvider(),
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

function extractXaiText(payload: GrokResponse) {
  const text = (payload.output ?? [])
    .flatMap(item => item.content ?? [])
    .filter(item => item.type === "output_text" && typeof item.text === "string")
    .map(item => item.text!.trim())
    .filter(Boolean)
    .join("\n\n");
  if (text) return text;
  throw new Error("Grok returned no answer. Please try again.");
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function isModelFallbackError(error: unknown) {
  const status = (error as { status?: number })?.status;
  const message = errorMessage(error).toLowerCase();
  return status === 400 || status === 404 || message.includes("model") || message.includes("rate limit");
}
async function parseXaiResponse(response: Response, action: string) {
  let payload: GrokResponse;
  try {
    payload = (await response.json()) as GrokResponse;
  } catch {
    throw new Error(`xAI Grok ${action} returned an invalid response.`);
  }
  if (!response.ok || payload.error) {
    const message =
      typeof payload.error === "string" ? payload.error : payload.error?.message;
    if (response.status === 401 || response.status === 403)
      throw new Error("xAI Grok is not configured correctly. Check XAI_API_KEY.");
    throw new Error(message || `xAI Grok ${action} failed (${response.status}).`);
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
    headers: { Authorization: `Bearer ${xaiKey()}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  return await parseXaiResponse(response, "file upload");
}
async function deleteDocument(fileId: string) {
  await fetch(`${XAI_BASE_URL}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${xaiKey()}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}
function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
async function extractLocalDocumentText(bytes: Buffer, fileName: string, mimeType: string) {
  const normalizedMime = mimeType.split(";", 1)[0].toLowerCase();
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (
    normalizedMime.startsWith("text/") ||
    ["md", "txt", "csv", "json", "html", "htm", "rtf"].includes(extension)
  ) {
    return normalizedMime.includes("html") || ["html", "htm"].includes(extension)
      ? htmlToText(bytes.toString("utf8"))
      : bytes.toString("utf8").replace(/\s+/g, " ").trim();
  }
  if (normalizedMime === "application/pdf" || extension === "pdf") {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdf = await pdfjs.getDocument({
        data: new Uint8Array(bytes),
        useWorkerFetch: false,
        disableFontFace: true,
      }).promise;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map(item => ("str" in item ? String(item.str) : ""))
            .join(" ")
        );
      }
      return pages.join(" ").replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  }
  if (officePreviewFileType(normalizedMime, fileName)) {
    try {
      const preview = await renderOfficePreview({ bytes, fileName, mimeType });
      return preview ? htmlToText(preview.html) : "";
    } catch {
      return "";
    }
  }
  return "";
}
async function paperContextForProvider(userId: number, paperId: number, provider: GrokProvider) {
  const paper = await paperById(paperId);
  if (!paper || !paper.isAvailable)
    throw new Error("The selected study document is unavailable.");
  const isFreeDocument = paper.accessMode === "free" && Number(paper.priceKes) === 0;
  if (!isFreeDocument && !(await entitlementFor(userId, paperId)))
    throw new Error("Unlock this document before asking Grok about it.");
  const context: PaperContext = {
    title: paper.title,
    course: paper.course,
    unit: paper.unit,
    description: paper.description ?? "Not provided",
  };
  if (!paper.fileId) return context;
  const bytes = await readPortalFileBytes(paper.fileId);
  if (provider === "xai") {
    const uploaded = await uploadDocument(
      bytes,
      paper.fileName || `study-document-${paperId}`,
      paper.fileMimeType || "application/octet-stream"
    );
    const fileId = String((uploaded as { id?: string }).id ?? "");
    if (!fileId) throw new Error("xAI Grok did not accept the study document upload.");
    context.fileId = fileId;
  } else {
    context.localText = (await extractLocalDocumentText(
      bytes,
      paper.fileName || `study-document-${paperId}`,
      paper.fileMimeType || "application/octet-stream"
    )).slice(0, MAX_LOCAL_DOCUMENT_CHARS);
    context.textAvailable = Boolean(context.localText);
  }
  return context;
}
function paperPrompt(context: PaperContext) {
  const metadata = `Selected document: ${context.title}. Course: ${context.course}. Unit: ${context.unit}. Description: ${context.description}.`;
  if (!context.localText)
    return `${metadata}\nThe full document text is not available in this request. Be transparent about that limitation, use only the metadata above, and ask the student to paste a passage for a precise answer. Do not invent document facts.`;
  return `${metadata}\nDocument text (primary source; do not invent facts outside it):\n${context.localText}`;
}
async function askWithXai(input: { model: string; prompt: string; context?: PaperContext }) {
  const content: Array<Record<string, string>> = [{ type: "input_text", text: input.prompt }];
  if (input.context?.fileId) content.push({ type: "input_file", file_id: input.context.fileId });
  const response = await fetch(`${XAI_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${xaiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      store: false,
      input: [
        {
          role: "system",
          content:
            "You are ScholarShelf Assistant, a patient university study assistant. Explain clearly, distinguish document facts from general guidance, encourage academic integrity, and never claim to have read a document unless it was attached.",
        },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  return { answer: extractXaiText(await parseXaiResponse(response, "response")), responseId: null as string | null };
}
async function askWithGroq(input: { model: string; prompt: string; context?: PaperContext }) {
  try {
    const client = new Groq({ apiKey: groqKey() });
    const result = await client.chat.completions.create({
      model: input.model,
      temperature: 0.2,
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content:
            "You are ScholarShelf Assistant, a patient university study assistant. Explain clearly, distinguish document facts from general guidance, encourage academic integrity, and never claim to have read a document unless it was provided.",
        },
        { role: "user", content: input.prompt },
      ],
    });
    const answer = result.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error("Groq returned no answer. Please try again.");
    return { answer, responseId: null as string | null };
  } catch (error) {
    const status = (error as { status?: number })?.status;
    const message = errorMessage(error).toLowerCase();
    if (
      status === 401 ||
      status === 403 ||
      message.includes("invalid_api_key") ||
      message.includes("invalid api key")
    )
      throw new Error("Groq is not configured correctly. Check GROQ_API_KEY in Vercel Production.");
    throw error;
  }
}
async function askProvider(provider: GrokProvider, prompt: string, context?: PaperContext) {
  let lastError: unknown;
  for (const model of modelCandidates(provider)) {
    try {
      return {
        ...(provider === "xai"
          ? await askWithXai({ model, prompt, context })
          : await askWithGroq({ model, prompt, context })),
        model,
      };
    } catch (error) {
      lastError = error;
      if (!isModelFallbackError(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${providerName(provider)} could not answer.`);
}
function canFailOverToAnotherProvider(error: unknown) {
  const status = (error as { status?: number })?.status;
  const message = errorMessage(error).toLowerCase();
  return (
    (typeof status === "number" && (status === 400 || status === 401 || status === 403 || status === 408 || status === 429 || status >= 500)) ||
    message.includes("xai") ||
    message.includes("groq") ||
    message.includes("rate limit") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("could not answer")
  );
}
export async function askGrok(input: {
  userId: number;
  prompt: string;
  paperId?: number;
  mode: "ask" | "summarize";
}) {
  const providers = grokProviderOrder();
  if (providers.length === 0)
    throw new Error(
      providerPreference() === "xai"
        ? "xAI Grok is not configured. Add XAI_API_KEY to Vercel or switch GROK_PROVIDER to groq."
        : providerPreference() === "groq"
          ? "Groq is not configured. Add GROQ_API_KEY to Vercel or switch GROK_PROVIDER to xai."
          : "No AI provider is configured. Add XAI_API_KEY or GROQ_API_KEY to Vercel."
    );
  const prompt = input.prompt.trim();
  if (input.mode === "ask" && prompt.length < 2)
    throw new Error("Ask ScholarShelf Assistant a question with at least 2 characters.");
  if (prompt.length > MAX_PROMPT_CHARS)
    throw new Error(`Keep your ScholarShelf Assistant request under ${MAX_PROMPT_CHARS} characters.`);
  if (input.mode === "summarize" && !input.paperId)
    throw new Error("Choose a document before asking ScholarShelf Assistant for a summary.");

  const credit = await consumeGrokCredit(input.userId);
  let lastError: unknown;
  try {
    for (const provider of providers) {
      let uploadedFileId: string | undefined;
      try {
        let context: PaperContext | undefined;
        if (input.paperId) {
          context = await paperContextForProvider(input.userId, input.paperId, provider);
          uploadedFileId = context.fileId;
        }
        const userText =
          input.mode === "summarize"
            ? `Summarize this study document for a university student. Include: a short overview, key concepts, important definitions, likely exam points, and five revision questions. Do not invent facts that are not in the document.${prompt ? `\nStudent's focus: ${prompt}` : ""}`
            : prompt;
        const fullPrompt = context
          ? `${paperPrompt(context)}\n\nStudent request: ${userText}`
          : `No specific study document was selected.\n\nStudent request: ${userText}`;
        const result = await askProvider(provider, fullPrompt, context);
        return {
          answer: result.answer,
          model: result.model,
          provider,
          responseId: result.responseId,
          ...credit,
        } as const;
      } catch (error) {
        lastError = error;
        if (provider === providers[providers.length - 1] || !canFailOverToAnotherProvider(error))
          throw error;
      } finally {
        if (uploadedFileId) await deleteDocument(uploadedFileId);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No AI provider could answer.");
  } catch (error) {
    await refundGrokCredit(input.userId);
    throw error;
  }
}
