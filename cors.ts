const DEFAULT_ORIGINS = ['http://localhost:5173', 'https://d3pi0juuilndgb.cloudfront.net']

function getAllowedOrigins(): string[] {
  const env = process.env.ALLOWED_ORIGINS
  if (!env) return DEFAULT_ORIGINS
  return env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = getAllowedOrigins()
  const match = origin && allowed.includes(origin) ? origin : null
  return {
    ...(match ? { 'Access-Control-Allow-Origin': match } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}
