export function ok<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

export function fail(
  message: string,
  status = 400,
  code = "REQUEST_FAILED",
): Response {
  return Response.json(
    { success: false, error: { message, code } },
    { status },
  );
}
