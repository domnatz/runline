export async function sendJobAction(path: string, method: "POST" | "PUT" | "PATCH", data?: object) {
  const response = await fetch(path, {
    method,
    ...(data && { headers: { "content-type": "application/json" }, body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => {
    throw new Error("Could not reach Runline. Check your connection and try again.");
  });
  if (response.status === 401) {
    window.location.replace("/login");
    throw new Error("Your session ended. Sign in to continue.");
  }
  if (!response.ok) {
    const message: { error?: string } | null = await response.json().catch(() => null);
    throw new Error(message?.error ?? "Could not save the work order. Try again.");
  }
  return response;
}
