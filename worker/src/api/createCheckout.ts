import Stripe from "stripe";
import type { Env } from "../index";

export async function handleCreateCheckout(request: Request, env: Env): Promise<Response> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: "price_tabzen_monthly", quantity: 1 }],
    success_url: "https://tabzen.app/upgrade-success",
    cancel_url: "https://tabzen.app/upgrade-cancelled",
  });
  return Response.json({ url: session.url });
}
