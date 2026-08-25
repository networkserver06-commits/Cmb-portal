import { describe, expect, it } from "vitest";

describe("Resend credentials", () => {
  it("accepts the configured send-only API key at the email endpoint", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    const sender = process.env.PASSWORD_RESET_FROM_EMAIL;
    expect(apiKey, "RESEND_API_KEY must be configured").toMatch(/^re_/);
    expect(sender, "PASSWORD_RESET_FROM_EMAIL must be configured").toMatch(
      /^[^@<>\n]+@[^@<>\n]+$|^.+ <[^@<>\n]+@[^@<>\n]+>$/
    );
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      // Invalid recipient makes Resend stop at validation and prevents delivery; a sender rejection fails this test.
      body: JSON.stringify({
        from: sender!,
        to: ["not-an-email"],
        subject: "ScholarShelf credential validation",
        html: "Credential validation only; this message must not be sent.",
      }),
    });
    const body = await response.text();
    expect(response.status).toBe(422);
    expect(body).not.toContain("invalid_api_key");
    expect(body).not.toContain("restricted_api_key");
  }, 15_000);
});
