/**
 * CORS Utility — Shared across all Edge Functions
 *
 * Allowed origins:
 * - Your production domain(s)
 * - Vercel Preview deployments
 * - localhost (local development)
 *
 * Update ALLOWED_ORIGINS with your own domain(s).
 */

const ALLOWED_ORIGINS: string[] = [
  // Add your production domain(s) here:
  // 'https://yourdomain.com',
  // 'https://www.yourdomain.com',
];

/**
 * Check if origin is allowed
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  // Exact match
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }

  // Local development (localhost, any port)
  if (origin.startsWith('http://localhost:') || origin === 'http://localhost' ||
      origin.startsWith('https://localhost:') || origin === 'https://localhost') {
    return true;
  }

  // Vercel Preview deployments (your-app-*.vercel.app)
  if (origin.match(/^https:\/\/[\w-]+\.vercel\.app$/)) {
    return true;
  }

  return false;
}

/**
 * Generate CORS headers based on request origin
 */
export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin!;
  }

  return headers;
}

/**
 * CORS preflight response
 */
export function handleCorsPreflightRequest(request: Request): Response {
  return new Response('ok', { headers: getCorsHeaders(request) });
}

/**
 * JSON response with CORS headers
 */
export function jsonResponse(
  request: Request,
  data: unknown,
  status: number = 200
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Error response with CORS headers
 */
export function errorResponse(
  request: Request,
  message: string,
  status: number = 500
): Response {
  return jsonResponse(request, { success: false, error: message }, status);
}
