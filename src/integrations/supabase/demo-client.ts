/**
 * Demo-mode supabase-js impersonation. Implements exactly the surface this
 * app uses: query builder, rpc, auth, channels (no-op), storage (local).
 * Swapped in by client.ts when no Supabase env vars are configured —
 * no component code changes needed.
 */
import type { Database } from "./types";

const SESSION_KEY = "soko-demo-session";

function baseUrl(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return (import.meta as any).env?.VITE_DEMO_API_BASE ?? "http://localhost:5173";
}

function token(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    return s?.access_token ?? null;
  } catch {
    return null;
  }
}

async function post(path: string, body: any): Promise<any> {
  const res = await fetch(`${baseUrl()}/api/local/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ───────────────────────────── query builder ───────────────────────────────

type Filter = { op: string; col: string; val: any };

class DemoBuilder {
  private spec: any;

  constructor(spec: any) {
    this.spec = { ...spec, filters: spec.filters ?? [] };
  }

  private clone(): DemoBuilder {
    return new DemoBuilder(this.spec);
  }

  select(columns: string | null = "*", options?: any) {
    const b = this.clone();
    b.spec.columns = columns ?? "*";
    b.spec.op = b.spec.op ?? "select";
    if (options?.count) b.spec.count = options.count;
    if (options?.head) b.spec.head = true;
    return b as any;
  }

  insert(values: any, options?: any) {
    const b = this.clone();
    b.spec.op = "insert";
    b.spec.values = values;
    if (options?.onConflict) b.spec.onConflict = options.onConflict;
    return b as any;
  }

  upsert(values: any, options?: any) {
    const b = this.clone();
    b.spec.op = "upsert";
    b.spec.values = values;
    if (options?.onConflict) b.spec.onConflict = options.onConflict;
    return b as any;
  }

  update(values: any) {
    const b = this.clone();
    b.spec.op = "update";
    b.spec.values = values;
    return b as any;
  }

  delete() {
    const b = this.clone();
    b.spec.op = "delete";
    return b as any;
  }

  eq(col: string, val: any) { return this.filter("eq", col, val); }
  neq(col: string, val: any) { return this.filter("neq", col, val); }
  gt(col: string, val: any) { return this.filter("gt", col, val); }
  gte(col: string, val: any) { return this.filter("gte", col, val); }
  lt(col: string, val: any) { return this.filter("lt", col, val); }
  lte(col: string, val: any) { return this.filter("lte", col, val); }
  like(col: string, val: string) { return this.filter("like", col, val); }
  ilike(col: string, val: string) { return this.filter("ilike", col, val); }
  is(col: string, val: any) { return this.filter("is", col, val); }
  in(col: string, val: any[]) { return this.filter("in", col, val); }
  overlaps(col: string, val: any[]) { return this.filter("overlaps", col, val); }

  private filter(op: string, col: string, val: any) {
    const b = this.clone();
    b.spec.filters = [...b.spec.filters, { op, col, val }];
    return b as any;
  }

  order(col: string, options?: { ascending?: boolean }) {
    const b = this.clone();
    b.spec.order = { col, ascending: options?.ascending !== false };
    return b as any;
  }

  limit(n: number) {
    const b = this.clone();
    b.spec.limit = n;
    return b as any;
  }

  range(from: number, to: number) {
    const b = this.clone();
    b.spec.limit = to - from + 1;
    b.spec.rangeFrom = from;
    return b as any;
  }

  single() {
    const b = this.clone();
    b.spec.single = true;
    return b as any;
  }

  maybeSingle() {
    const b = this.clone();
    b.spec.maybeSingle = true;
    return b as any;
  }

  abortSignal() {
    return this as any;
  }

  async exec(): Promise<any> {
    const s = this.spec;
    if (s.op === "select" || !s.op) {
      return post("query", { ...s, op: "select" });
    }
    return post("query", s);
  }

  // Make the builder thenable — `await supabase.from(...)...` just works
  then<T = any>(
    onFulfilled?: (value: any) => T | PromiseLike<T>,
    onRejected?: (reason: any) => T | PromiseLike<T>,
  ): PromiseLike<T> {
    return this.exec().then(onFulfilled, onRejected);
  }
}

// ───────────────────────────── auth shim ───────────────────────────────────

type AuthListener = (event: string, session: any) => void;
const listeners = new Set<AuthListener>();

function storedSession(): any | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

function setSession(session: any | null) {
  if (typeof window === "undefined") return;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function emit(event: string, session: any | null) {
  listeners.forEach((l) => {
    try { l(event, session); } catch { /* ignore */ }
  });
}

const auth = {
  async getSession() {
    return { data: { session: storedSession() }, error: null };
  },
  async getUser() {
    const s = storedSession();
    return { data: { user: s?.user ?? null }, error: null };
  },
  onAuthStateChange(listener: AuthListener) {
    listeners.add(listener);
    // Match supabase-js v2: an INITIAL_SESSION event fires right after subscribe
    setTimeout(() => listener("INITIAL_SESSION", storedSession()), 0);
    return {
      data: {
        subscription: {
          unsubscribe: () => listeners.delete(listener),
        },
      },
    };
  },
  async signUp({ email, password }: { email: string; password: string }) {
    const res = await post("auth/signup", { email, password });
    if (res.error) return { data: { user: null, session: null }, error: res.error };
    setSession(res.session);
    emit("SIGNED_IN", res.session);
    return { data: { user: res.user, session: res.session }, error: null };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const res = await post("auth/signin", { email, password });
    if (res.error) return { data: { user: null, session: null }, error: res.error };
    setSession(res.session);
    emit("SIGNED_IN", res.session);
    return { data: { user: res.user, session: res.session }, error: null };
  },
  async signInWithOAuth() {
    return { data: {}, error: { message: "OAuth sign-in is not available in local demo mode. Use email + password." } };
  },
  async signInWithOtp() {
    return { data: {}, error: { message: "Phone OTP is not available in local demo mode. Use email + password." } };
  },
  async verifyOtp() {
    return { data: {}, error: { message: "Phone OTP is not available in local demo mode." } };
  },
  async signOut() {
    setSession(null);
    emit("SIGNED_OUT", null);
    try { await post("auth/signout", {}); } catch { /* ignore */ }
    return { error: null };
  },
  async updateUser(attributes: any) {
    // Email update is stubbed in demo; treat as success so profile pages don't break
    return { data: { user: storedSession()?.user ?? null }, error: null };
  },
  async resetPasswordForEmail() {
    return { data: {}, error: { message: "Password reset is not available in local demo mode." } };
  },
};

// ─────────────────────────── channel + storage ─────────────────────────────

function makeChannel() {
  const channel: any = {
    on() {
      return channel;
    },
    subscribe(statusCb?: (status: string) => void) {
      // No realtime server in demo — report subscribed immediately
      setTimeout(() => statusCb?.("SUBSCRIBED"), 0);
      return { unsubscribe() {} };
    },
  };
  return channel;
}

const storage = {
  from(_bucket: string) {
    return {
      async upload(path: string, file: File | Blob) {
        try {
          const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file as Blob);
          });
          await post("query", {
            table: "storage_objects",
            op: "upsert",
            onConflict: "key",
            values: {
              key: `${_bucket}/${path}`,
              data_url: dataUrl,
              content_type: (file as File).type ?? "application/octet-stream",
            },
          });
          return { data: { path }, error: null };
        } catch (e) {
          return { data: null, error: { message: (e as Error).message } };
        }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `${baseUrl()}/api/local/asset/${_bucket}/${path}` } };
      },
      async remove(paths: string[]) {
        for (const p of paths) {
          await post("query", {
            table: "storage_objects",
            op: "delete",
            filters: [{ op: "eq", col: "key", val: `${_bucket}/${p}` }],
          });
        }
        return { data: paths, error: null };
      },
    };
  },
};

// ───────────────────────────── the client ──────────────────────────────────

function createDemoClient(): any {
  return {
    from(table: string) {
      return new DemoBuilder({ table, op: "select", filters: [] });
    },
    async rpc(fn: string, args?: any) {
      return post("rpc", { fn, args: args ?? {} });
    },
    auth,
    channel(name?: string) {
      return makeChannel();
    },
    removeChannel() {
      return Promise.resolve({ error: null });
    },
    removeAllChannels() {
      return Promise.resolve({ error: null });
    },
    getChannels() {
      return [];
    },
    storage,
  };
}

export const demoClient = createDemoClient();
export type DemoDatabase = Database;
