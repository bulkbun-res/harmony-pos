// polyfills for SSR in Cloudflare Workers to prevent module evaluation crashes with client-only libraries
if (typeof globalThis.window === "undefined") {
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    location: { pathname: "" },
  };
}
if (typeof globalThis.document === "undefined") {
  (globalThis as any).document = {
    createElement: () => ({ style: {} }),
    createElementNS: () => ({ style: {} }),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof globalThis.navigator === "undefined") {
  (globalThis as any).navigator = {
    userAgent: "",
  };
}
