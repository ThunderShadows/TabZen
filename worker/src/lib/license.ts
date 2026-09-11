function licenseKey(email: string): string {
  return `license:${email.trim().toLowerCase()}`;
}

export async function getLicenseStatus(kv: KVNamespace, email: string): Promise<"paid" | "free"> {
  const value = await kv.get(licenseKey(email));
  return value === "paid" ? "paid" : "free";
}

export async function setLicensePaid(kv: KVNamespace, email: string): Promise<void> {
  await kv.put(licenseKey(email), "paid");
}

function eventKey(eventId: string): string {
  return `stripe_event:${eventId}`;
}

export async function isEventProcessed(kv: KVNamespace, eventId: string): Promise<boolean> {
  return (await kv.get(eventKey(eventId))) !== null;
}

export async function markEventProcessed(kv: KVNamespace, eventId: string): Promise<void> {
  await kv.put(eventKey(eventId), "1", { expirationTtl: 60 * 60 * 24 * 30 });
}
