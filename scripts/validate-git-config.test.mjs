import { describe, expect, it } from "vitest";
import {
  isValidGitHubEmail,
  parsePrePushInput,
  validateGitEmail,
} from "./validate-git-config.mjs";

describe("Git configuration validation", () => {
  it("accepts a GitHub numeric-ID noreply address", () => {
    const email = "250408281+networkserver06-commits@users.noreply.github.com";
    expect(isValidGitHubEmail(email)).toBe(true);
    expect(validateGitEmail(email, "networkserver06-commits")).toBeNull();
  });

  it("rejects scientific notation in an email address", () => {
    const malformedEmail = [
      "2.50408281e",
      "+08+networkserver06-commits@users.noreply.github.com",
    ].join("");
    expect(validateGitEmail(malformedEmail)).toMatch(/scientific notation/);
  });

  it("rejects a noreply address for the wrong GitHub login", () => {
    expect(
      validateGitEmail(
        "250408281+other-user@users.noreply.github.com",
        "networkserver06-commits"
      )
    ).toMatch(/does not match/);
  });

  it("parses standard pre-push reference lines", () => {
    expect(
      parsePrePushInput("refs/heads/main abc123 refs/heads/main def456\n")
    ).toEqual([
      {
        localRef: "refs/heads/main",
        localSha: "abc123",
        remoteRef: "refs/heads/main",
        remoteSha: "def456",
      },
    ]);
  });
});
