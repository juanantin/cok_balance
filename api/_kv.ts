// Strips accidental wrapping quotes/whitespace - a common paste artifact
// when copying a value out of a .env-formatted display (KEY="value").
function cleanEnvValue(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

function restConfig(): { url: string; token: string } {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL
  const rawToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!rawUrl || !rawToken) {
    throw new Error(
      'Storage isn\'t configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (see README).'
    )
  }
  return { url: cleanEnvValue(rawUrl), token: cleanEnvValue(rawToken) }
}

/** Plain Upstash Redis REST calls (no SDK) shared by every KV-backed feature. */
export async function kvGet(key: string): Promise<string | null> {
  const { url, token } = restConfig()
  const res = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Storage read failed (${res.status})`)
  }
  const { result } = (await res.json()) as { result: string | null }
  return result
}

export async function kvSet(key: string, value: string): Promise<void> {
  const { url, token } = restConfig()
  const res = await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: value,
  })
  if (!res.ok) {
    throw new Error(`Storage write failed (${res.status})`)
  }
}
