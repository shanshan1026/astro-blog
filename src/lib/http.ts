export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function failure(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !!origin && origin === new URL(request.url).origin;
}
