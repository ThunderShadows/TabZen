import { handleGroup } from "./api/group";
import { handleLicenseCheck } from "./api/licenseCheck";

export interface Env {
  TABZEN_KV: KVNamespace;
  ANTHROPIC_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    if (url.pathname === "/api/group" && request.method === "POST") {
      return handleGroup(request, env);
    }
    if (url.pathname === "/api/license/check" && request.method === "POST") {
      return handleLicenseCheck(request, env);
    }
    return new Response("not found", { status: 404 });
  },
};
