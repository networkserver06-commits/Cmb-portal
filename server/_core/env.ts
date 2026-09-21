const jwtSecret = process.env.JWT_SECRET ?? "";
const appId = process.env.VITE_APP_ID ?? "";
const isProduction = process.env.NODE_ENV === "production";

const oAuthServerUrl = process.env.OAUTH_SERVER_URL ?? "";

if (
  isProduction &&
  (Buffer.byteLength(jwtSecret, "utf8") < 32 || (oAuthServerUrl && !appId))
) {
  throw new Error(
    "Production requires a JWT_SECRET of at least 32 bytes. VITE_APP_ID is also required when OAuth is enabled."
  );
}

export const ENV = {
  appId,
  cookieSecret: jwtSecret,
  oAuthServerUrl,
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  mongoUri: process.env.MONGODB_URI ?? "",
  mongoDatabase: process.env.MONGODB_DATABASE ?? "examvault",
  appBaseUrl: (process.env.APP_BASE_URL ?? "").replace(/\/+$/, ""),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  passwordResetFromEmail: process.env.PASSWORD_RESET_FROM_EMAIL ?? "",
};
