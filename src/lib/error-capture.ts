let lastError: unknown = null;

if (typeof globalThis !== "undefined") {
  const g = globalThis as unknown as {
    addEventListener?: (t: string, cb: (e: any) => void) => void;
  };
  g.addEventListener?.("unhandledrejection", (e: any) => {
    lastError = e?.reason ?? e;
  });
  g.addEventListener?.("error", (e: any) => {
    lastError = e?.error ?? e;
  });
}

export function consumeLastCapturedError(): unknown {
  const e = lastError;
  lastError = null;
  return e;
}
