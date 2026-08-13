function createSafeProxy(target: any = {}): any {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (prop === Symbol.toPrimitive || prop === "valueOf" || prop === "toString") {
        return () => "";
      }
      if (prop === Symbol.iterator) {
        return function* () {};
      }
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return undefined; // Do not pretend to be a Promise
      }
      if (prop in obj) {
        const val = Reflect.get(obj, prop, receiver);
        if (
          val !== null &&
          typeof val === "object" &&
          !Array.isArray(val) &&
          !(val instanceof Request) &&
          !(val instanceof Set)
        ) {
          return createSafeProxy(val);
        }
        return val;
      }
      if (prop === "requestAssets") {
        return {
          preloads: [],
          scripts: [],
          css: [],
        };
      }
      if (
        prop === "preloads" ||
        prop === "scripts" ||
        prop === "css" ||
        prop === "serializationAdapters"
      ) {
        return [];
      }
      if (prop === "options") {
        return createSafeProxy({
          serializationAdapters: [],
          defaultStructuralSharing: true,
          ssr: {},
          context: {},
        });
      }
      return createSafeProxy({});
    },
    apply(target, thisArg, argArray) {
      if (typeof target === "function") {
        return target.apply(thisArg, argArray);
      }
      return createSafeProxy({});
    },
  });
}

let fallbackRouterInstance: any = null;

function getFallbackRouter() {
  if (typeof window !== "undefined" && (window as any).__ROUTER__) {
    return (window as any).__ROUTER__;
  }
  if (!fallbackRouterInstance) {
    fallbackRouterInstance = createSafeProxy({
      options: {
        serializationAdapters: [],
        defaultStructuralSharing: true,
        ssr: {},
        context: {},
      },
      stores: {
        location: {
          get: () => ({ pathname: "/", search: {}, hash: "", href: "/" }),
        },
        getMatchStore: () => ({
          get: () => null,
        }),
      },
      isServer: false,
      navigate: () => Promise.resolve(),
    });
  }
  return fallbackRouterInstance;
}

export class AsyncLocalStorage<T = any> {
  private _store: T | undefined = undefined;

  disable() {
    this._store = undefined;
  }

  getStore(): T | undefined {
    if (this._store !== undefined) {
      return this._store;
    }
    // Safe fallback context object when context was not set (e.g. client runtime)
    const baseTarget = {
      getRouter: () => getFallbackRouter(),
      request:
        typeof Request !== "undefined"
          ? new Request(typeof location !== "undefined" ? location.href : "http://localhost:3000/")
          : null,
      startOptions: {
        options: {
          serializationAdapters: [],
        },
      },
      options: {
        serializationAdapters: [],
      },
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: "router",
    };

    return createSafeProxy(baseTarget) as unknown as T;
  }

  run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R {
    const prev = this._store;
    this._store = store;
    try {
      return callback(...args);
    } finally {
      this._store = prev;
    }
  }

  exit<R>(callback: (...args: any[]) => R, ...args: any[]): R {
    const prev = this._store;
    this._store = undefined;
    try {
      return callback(...args);
    } finally {
      this._store = prev;
    }
  }

  enterWith(store: T): void {
    this._store = store;
  }
}

export class AsyncResource {
  constructor(
    public type: string,
    public opts?: any,
  ) {}
  runInAsyncScope(fn: (...args: any[]) => any, thisArg?: any, ...args: any[]) {
    return fn.apply(thisArg, args);
  }
  emitDestroy() {
    return this;
  }
  asyncId() {
    return 1;
  }
  triggerAsyncId() {
    return 1;
  }
}

export function createHook() {
  return {
    enable() {
      return this;
    },
    disable() {
      return this;
    },
  };
}

export function executionAsyncId() {
  return 1;
}
export function triggerAsyncId() {
  return 1;
}

const stub = {
  AsyncLocalStorage,
  AsyncResource,
  createHook,
  executionAsyncId,
  triggerAsyncId,
};

const GLOBAL_STORAGE_KEY = Symbol.for("tanstack-start:start-storage-context");

if (typeof window !== "undefined") {
  (window as any).AsyncLocalStorage = AsyncLocalStorage;
}
if (typeof globalThis !== "undefined") {
  (globalThis as any).AsyncLocalStorage = AsyncLocalStorage;
  if (!(globalThis as any)[GLOBAL_STORAGE_KEY]) {
    (globalThis as any)[GLOBAL_STORAGE_KEY] = new AsyncLocalStorage();
  }
}

export default stub;
