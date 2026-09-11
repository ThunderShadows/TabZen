import type { Env } from "../index";
import { getLicenseStatus } from "../lib/license";

export async function handleLicenseCheck(request: Request, env: Env): Promise<Response> {
  const { email } = (await request.json()) as { email: string };
  const status = await getLicenseStatus(env.TABZEN_KV, email);
  return Response.json({ status });
}
