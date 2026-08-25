import { describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";

describe("MongoDB credentials", () => {
  it("can reach the configured MongoDB deployment", async () => {
    const uri = process.env.MONGODB_URI;
    expect(uri, "MONGODB_URI must be configured").toMatch(
      /^mongodb(?:\+srv)?:\/\//
    );
    const databaseName = process.env.MONGODB_DATABASE || "examvault";
    expect(
      databaseName,
      "MONGODB_DATABASE must be a valid database name"
    ).toMatch(/^[A-Za-z0-9_-]{1,63}$/);
    const client = new MongoClient(uri!, { serverSelectionTimeoutMS: 5000 });
    try {
      await client.db("admin").command({ ping: 1 });
      expect(true).toBe(true);
    } finally {
      await client.close();
    }
  }, 10_000);
});
