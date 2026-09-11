import Stripe from "stripe";
import type { Env } from "../index";
import { setLicensePaid, isEventProcessed, markEventProcessed } from "../lib/license";

export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  const signature = request.headers.get("stripe-signature") ?? "";
  const body = await request.text();

  const event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);

  if (await isEventProcessed(env.TABZEN_KV, event.id)) {
    return new Response("already processed", { status: 200 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { customer_details?: { email?: string } };
    const email = session.customer_details?.email;
    if (email) {
      await setLicensePaid(env.TABZEN_KV, email);
    }
  }

  await markEventProcessed(env.TABZEN_KV, event.id);
  return new Response("ok", { status: 200 });
}
