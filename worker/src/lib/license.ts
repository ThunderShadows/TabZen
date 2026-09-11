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
