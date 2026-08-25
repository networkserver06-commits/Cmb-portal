export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  mongoUri: process.env.MONGODB_URI ?? "",
  mongoDatabase: process.env.MONGODB_DATABASE ?? "examvault",
  appBaseUrl: (process.env.APP_BASE_URL ?? "").replace(/\/+$/, ""),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  passwordResetFromEmail: process.env.PASSWORD_RESET_FROM_EMAIL ?? "",
};
