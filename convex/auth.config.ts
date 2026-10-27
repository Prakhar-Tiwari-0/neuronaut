import type { AuthConfig } from "convex/server";

// Players sign in with Clerk; Convex checks the JWT from Clerk's "convex" template.
export default {
  providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: "convex" }],
} satisfies AuthConfig;
