export async function checkAndIncrementRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number
): Promise<boolean> {
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= limit) return false;
  await kv.put(key, String(count + 1), { expirationTtl: 60 * 60 * 24 });
  return true;
}
