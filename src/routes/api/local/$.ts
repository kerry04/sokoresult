/**
 * Demo-mode backend — a single catch-all route serving everything the
 * supabase-js shim needs. Only active when no real Supabase env vars exist.
 *
 *   POST /api/local/query   — table query protocol (select/insert/update/delete/upsert)
 *   POST /api/local/rpc     — RPC dispatch
 *   POST /api/local/auth/*  — signup / signin / session
 *   POST /api/local/tick    — market-maker bot step
 *   GET  /api/local/asset/* — demo storage assets
 */
import { createFileRoute } from "@tanstack/react-router";
import { ensureStore, dbGet, dbPut, saveNow } from "@/lib/server/demo/store";
import { dispatch } from "@/lib/server/demo/rpc";
import { initDemoAuth, signUp, signIn, publicUserFromToken } from "@/lib/server/demo/auth";
import { maybeBotTick } from "@/lib/server/demo/bot";

export const Route = createFileRoute("/api/local/$")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        await ensureStore();
        await initDemoAuth();
        const path = (params as any)._splat ?? (params as any)["*"] ?? "";
        const token = bearer(request);
        const body = await safeJson(request);

        maybeBotTick();

        try {
          // ── Auth ──
          if (path === "auth/signup") {
            const { user, access_token, error } = await signUp(body.email ?? "", body.password ?? "");
            return json(
              error ? { error: { message: error } } : { user, session: makeSession(user, access_token!) },
              error ? 400 : 200,
            );
          }
          if (path === "auth/signin") {
            const { user, access_token, error } = await signIn(body.email ?? "", body.password ?? "");
            return json(
              error ? { error: { message: error } } : { user, session: makeSession(user, access_token!) },
              error ? 400 : 200,
            );
          }
          if (path === "auth/session") {
            const user = publicUserFromToken(token);
            return json({ user, session: user ? makeSession(user, token!) : null });
          }
          if (path === "auth/signout") {
            return json({ ok: true });
          }

          // ── RPC ──
          if (path === "rpc") {
            const result = dispatch(String(body.fn ?? ""), body.args ?? {}, token);
            return json(result);
          }

          // ── Market-maker tick ──
          if (path === "tick") {
            maybeBotTick(true);
            return json({ ok: true });
          }

          // ── Table queries ──
          if (path === "query") {
            const result = runQuery(body, token);
            saveNow();
            return json(result);
          }

          return json({ error: { message: `Unknown demo endpoint: ${path}` } }, 404);
        } catch (e) {
          console.error("[demo-api] error", e);
          return json({ error: { message: (e as Error).message } }, 500);
        }
      },

      GET: async ({ request, params }) => {
        await ensureStore();
        const path = (params as any)._splat ?? (params as any)["*"] ?? "";
        if (path.startsWith("asset/")) {
          const key = path.slice("asset/".length);
          const obj = dbGet("storage_objects").find((o: any) => o.key === key);
          if (!obj) return new Response("Not found", { status: 404 });
          const buf = Buffer.from(obj.data_url.split(",")[1] ?? "", "base64");
          return new Response(buf, {
            headers: { "Content-Type": obj.content_type ?? "image/png", "Cache-Control": "no-store" },
          });
        }
        return json({ ok: true, service: "sokoresult-demo-backend" });
      },
    },
  },
});

function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") ?? request.headers.get("x-demo-token");
  return h?.replace(/^Bearer\s+/i, "") ?? null;
}

async function safeJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function makeSession(user: any, token: string) {
  return {
    access_token: token,
    refresh_token: token,
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 30,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    user,
  };
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ───────────────────────────── query engine ────────────────────────────────

interface QuerySpec {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string | "*";
  filters?: Array<{ op: string; col: string; val: any }>;
  order?: { col: string; ascending: boolean } | null;
  limit?: number | null;
  single?: boolean;
  maybeSingle?: boolean;
  count?: string | null;
  head?: boolean;
  values?: any;
  onConflict?: string | null;
  selectAfterWrite?: string | null;
}

function runQuery(spec: QuerySpec, token: string | null) {
  const user = publicUserFromToken(token);
  const table = spec.table;

  // profiles_public is a view over profiles in the real DB
  const source = table === "profiles_public" ? dbGet("profiles_public") : dbGet(table);

  switch (spec.op) {
    case "select": {
      let rows = applyFilters(source, spec.filters ?? []);
      if (spec.order) {
        const { col, ascending } = spec.order;
        rows = rows.slice().sort((x: any, y: any) => {
          const a = x[col], b = y[col];
          const cmp = a === b ? 0 : a > b ? 1 : -1;
          return ascending ? cmp : -cmp;
        });
      }
      if (spec.limit != null) rows = rows.slice(0, spec.limit);

      let data = project(rows, spec.columns ?? "*");
      if (spec.single || spec.maybeSingle) data = data[0] ?? null;

      return {
        data: spec.head ? null : data,
        error: spec.single && !data && !spec.maybeSingle ? { message: "No rows found", code: "PGRST116" } : null,
        count: spec.count ? rows.length : null,
      };
    }

    case "insert": {
      const incoming = (Array.isArray(spec.values) ? spec.values : [spec.values]).map((v: any) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...v,
      }));
      // Guest writes to user-owned tables are refused
      const userTables = ["positions", "trades", "transactions", "comments", "support_tickets", "support_ticket_messages"];
      if (userTables.includes(table) && !user) {
        return { data: null, error: { message: "Sign in to do that" } };
      }
      dbPut(table, [...source, ...incoming]);
      const written = incoming.map((r: any) =>
        table === "profiles_public" ? r : projectOne(r, spec.selectAfterWrite ?? spec.columns ?? "*"),
      );
      return { data: spec.single ? written[0] : written, error: null };
    }

    case "update": {
      const matches = applyFilters(source, spec.filters ?? []);
      for (const row of matches) Object.assign(row, spec.values ?? {});
      if (table === "profiles") {
        // keep the public view in sync
        const pp = dbGet("profiles_public");
        for (const row of matches) {
          const ppRow = pp.find((x: any) => x.id === row.id);
          if (ppRow) {
            ppRow.display_name = row.display_name;
            ppRow.avatar_url = row.avatar_url;
          }
        }
        dbPut("profiles_public", pp);
      }
      return { data: spec.single ? (matches[0] ?? null) : matches, error: null };
    }

    case "delete": {
      const ids = new Set(applyFilters(source, spec.filters ?? []).map((r: any) => r.id));
      dbPut(table, source.filter((r: any) => !ids.has(r.id)));
      return { data: spec.single ? null : [], error: null };
    }

    case "upsert": {
      const incoming = (Array.isArray(spec.values) ? spec.values : [spec.values]).map((v: any) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...v,
      }));
      const conflictCols = (spec.onConflict ?? "id").split(",").map((c) => c.trim());
      const rows = source.slice();
      for (const inc of incoming) {
        const idx = rows.findIndex((r: any) => conflictCols.every((c) => r[c] === inc[c]));
        if (idx >= 0) rows[idx] = { ...rows[idx], ...inc };
        else rows.push(inc);
      }
      dbPut(table, rows);
      return { data: spec.single ? incoming[0] : incoming, error: null };
    }

    default:
      return { data: null, error: { message: `Unsupported op: ${spec.op}` } };
  }
}

function applyFilters(rows: any[], filters: Array<{ op: string; col: string; val: any }>): any[] {
  let out = rows;
  for (const f of filters) {
    out = out.filter((r: any) => {
      const v = r[f.col];
      switch (f.op) {
        case "eq": return v === f.val;
        case "neq": return v !== f.val;
        case "gt": return v > f.val;
        case "gte": return v >= f.val;
        case "lt": return v < f.val;
        case "lte": return v <= f.val;
        case "like":
        case "ilike": return typeof v === "string" && v.toLowerCase().includes(String(f.val).replace(/%/g, "").toLowerCase());
        case "is": return f.val === null ? v == null : v === f.val;
        case "in": return Array.isArray(f.val) && f.val.includes(v);
        case "overlaps": return Array.isArray(v) && Array.isArray(f.val) && v.some((x) => f.val.includes(x));
        default: return true;
      }
    });
  }
  return out;
}

function project(rows: any[], columns: string | "*"): any[] {
  if (columns === "*" || !columns) return rows;
  return rows.map((r) => projectOne(r, columns));
}

function projectOne(row: any, columns: string | "*"): any {
  if (columns === "*" || !columns) return row;
  const cols = String(columns).split(",").map((c) => c.trim()).filter(Boolean);
  const out: any = {};
  for (const c of cols) if (c in row) out[c] = row[c];
  return out;
}

import * as crypto from "node:crypto";
