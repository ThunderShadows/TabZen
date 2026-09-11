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
    return new Response("not found", { status: 404 });
  },
};
