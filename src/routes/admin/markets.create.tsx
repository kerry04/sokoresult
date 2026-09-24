import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CandidateEditor, type Candidate, slugifyLabel } from "@/components/admin/CandidateEditor";
import { ImageUploader } from "@/components/common/ImageUploader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/markets/create")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    question?: string;
    category?: string;
    yes?: number;
    closes?: string;
    from?: string;
    criteria?: string;
  } => ({
    question: typeof s.question === "string" ? s.question : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    yes: typeof s.yes === "string" ? Number(s.yes) : undefined,
    closes: typeof s.closes === "string" ? s.closes : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
    criteria: typeof s.criteria === "string" ? s.criteria : undefined,
  }),
  component: CreateMarketPage,
});

const categories = ["politics", "sports", "entertainment", "economics"] as const;

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

type MarketType = "binary" | "multi";

function CreateMarketPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/admin/markets/create" });
  const [marketType, setMarketType] = useState<MarketType>("binary");
  const [question, setQuestion] = useState(search.question ?? "");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState(search.criteria ?? "");
  const [category, setCategory] = useState<(typeof categories)[number]>(
    (categories as readonly string[]).includes(search.category ?? "")
      ? (search.category as (typeof categories)[number])
      : "politics",
  );
  const [closesAt, setClosesAt] = useState(
    search.closes ? new Date(search.closes).toISOString().slice(0, 16) : "",
  );
  const [yesPct, setYesPct] = useState(
    typeof search.yes === "number" && search.yes >= 1 && search.yes <= 99 ? search.yes : 50,
  );
  const [candidates, setCandidates] = useState<Candidate[]>([
    { label: "", image_url: "", price_pct: 50 },
    { label: "", image_url: "", price_pct: 50 },
  ]);
  const [keywords, setKeywords] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const autoSlug = useMemo(() => slugify(question), [question]);
  const effectiveSlug = slugTouched ? slug : autoSlug;
  const noPct = 100 - yesPct;

  useEffect(() => {
    if (search.from) {
      // referenced post-insert
    }
  }, [search.from]);

  const candidateSum = candidates.reduce((s, c) => s + (c.price_pct || 0), 0);
  const candidatesValid =
    marketType === "binary"
      ? true
      : candidates.length >= 2 &&
        candidates.every((c) => c.label.trim().length > 0) &&
        candidateSum === 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !effectiveSlug) {
      toast.error("Question and slug are required");
      return;
    }
    if (marketType === "multi" && !candidatesValid) {
      toast.error(
        candidateSum !== 100
          ? `Candidate prices must total KSh 100 (currently KSh ${candidateSum})`
          : "Each candidate needs a label",
      );
      return;
    }
    setSubmitting(true);
    const payload = {
      question: question.trim(),
      slug: effectiveSlug,
      description: description.trim() || null,
      category,
      market_type: marketType,
      closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      yes_price: marketType === "binary" ? yesPct / 100 : 0.5,
      no_price: marketType === "binary" ? noPct / 100 : 0.5,
      keywords: keywords
        ? keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : null,
      resolution_source: resolutionSource.trim() || null,
      image_url: imageUrl,
    };
    // Persist the AI-suggested probability so seed_market_priors can read it.
    const priorPayload = {
      ...payload,
      initial_prob: marketType === "binary" ? yesPct / 100 : null,
    };
    const { data: created, error } = await supabase
      .from("markets")
      .insert(priorPayload)
      .select("id")
      .single();
    if (error || !created) {
      setSubmitting(false);
      toast.error(friendlyError(error));
      return;
    }

    if (marketType === "multi") {
      // Build outcome rows with unique slugs
      const used = new Set<string>();
      const rows = candidates.map((c, i) => {
        const base = slugifyLabel(c.label) || `option-${i + 1}`;
        let s = base;
        let n = 2;
        while (used.has(s)) s = `${base}-${n++}`;
        used.add(s);
        return {
          market_id: created.id,
          label: c.label.trim(),
          slug: s,
          image_url: c.image_url.trim() || null,
          price: c.price_pct / 100,
          sort_order: i,
        };
      });
      const { error: oerr } = await supabase.from("market_outcomes").insert(rows);
      if (oerr) {
        setSubmitting(false);
        toast.error(friendlyError(oerr) + " (candidates not added)");
        return;
      }
    }

    // Seed LMSR q-vector from the AI/admin-supplied prior so the engine
    // actually opens at the displayed probability instead of 50/50.
    const { error: seedErr } = await (supabase.rpc as any)("seed_market_priors", {
      _market_id: created.id,
    });
    if (seedErr) {
      // Non-fatal: market exists, just warn.
      console.warn("seed_market_priors failed", seedErr);
      toast.warning("Market created, but prior seeding failed — market opens at 50/50.");
    }

    if (search.from) {
      await supabase
        .from("market_suggestions")
        .update({ used_market_id: created.id, status: "approved" })
        .eq("id", search.from);
    }
    setSubmitting(false);
    toast.success("Market created");
    navigate({ to: "/admin/markets" });
  };

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Create market</h1>
      {search.from && (
        <div className="mb-4 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary-foreground">
          <Sparkles className="h-3 w-3" /> Prefilled from AI suggestion
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <form onSubmit={submit} className="space-y-5">
          {/* Market type toggle */}
          <div>
            <Label>Market type</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMarketType("binary")}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition",
                  marketType === "binary"
                    ? "border-success bg-success/10"
                    : "border-border hover:border-success/40",
                )}
              >
                <div className="font-semibold">Binary (YES / NO)</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Will X happen? Two outcomes.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMarketType("multi")}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition",
                  marketType === "multi"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40",
                )}
              >
                <div className="font-semibold">Multi-outcome</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Who will win? 2–12 candidates.
                </div>
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="q">Question</Label>
            <Textarea
              id="q"
              value={question}
              maxLength={200}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                marketType === "binary"
                  ? "Will Ruto win the 2027 election?"
                  : "Who will win the 2027 presidential election?"
              }
              className="min-h-[80px] mt-1.5"
              required
            />
            <div className="text-xs text-muted-foreground text-right mt-1">
              {question.length}/200
            </div>
          </div>

          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugTouched(true);
              }}
              className="mt-1.5 font-mono"
            />
            <div className="text-xs text-muted-foreground mt-1">
              /markets/{effectiveSlug || "…"}
            </div>
          </div>

          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resolution criteria and context…"
              className="min-h-[100px] mt-1.5"
            />
          </div>

          <div>
            <Label>Market image</Label>
            <div className="mt-1.5">
              <ImageUploader bucket="market-images" value={imageUrl} onChange={setImageUrl} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="closes">Resolution deadline</Label>
              <Input
                id="closes"
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          {marketType === "binary" ? (
            <div>
              <Label>
                Initial YES price: KSh {yesPct} · NO KSh {noPct}
              </Label>
              <Slider
                min={1}
                max={99}
                step={1}
                value={[yesPct]}
                onValueChange={(v) => setYesPct(v[0])}
                className="mt-3"
              />
            </div>
          ) : (
            <CandidateEditor candidates={candidates} onChange={setCandidates} />
          )}

          <div>
            <Label htmlFor="kw">Keywords (comma-separated)</Label>
            <Input
              id="kw"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ruto, election, 2027"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="rs">Resolution source</Label>
            <Input
              id="rs"
              value={resolutionSource}
              onChange={(e) => setResolutionSource(e.target.value)}
              placeholder="https://iebc.or.ke"
              className="mt-1.5"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting || !candidatesValid}
            className="bg-success hover:bg-success/90 text-success-foreground"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create market
          </Button>
        </form>

        {/* Preview */}
        <div className="lg:sticky lg:top-6 self-start">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Live preview
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="capitalize text-[10px]">
                {category}
              </Badge>
              <Badge variant="secondary" className="text-[10px] uppercase">
                {marketType}
              </Badge>
            </div>
            <div className="flex items-start gap-3">
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-12 w-12 rounded-lg object-cover border border-border/60"
                />
              )}
              <div className="font-semibold text-base leading-snug flex-1">
                {question || "Your question will appear here"}
              </div>
            </div>
            {marketType === "binary" ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-center">
                  <div className="text-[10px] uppercase text-muted-foreground">YES</div>
                  <div className="font-mono text-success font-bold text-lg">KSh {yesPct}</div>
                </div>
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-center">
                  <div className="text-[10px] uppercase text-muted-foreground">NO</div>
                  <div className="font-mono text-destructive font-bold text-lg">KSh {noPct}</div>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-1.5">
                {[...candidates]
                  .sort((a, b) => b.price_pct - a.price_pct)
                  .slice(0, 6)
                  .map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm rounded border border-border bg-background/40 px-2 py-1.5"
                    >
                      <span className="truncate">
                        {c.label || (
                          <span className="text-muted-foreground">Candidate {i + 1}</span>
                        )}
                      </span>
                      <span className="font-mono text-primary font-bold">KSh {c.price_pct}</span>
                    </div>
                  ))}
                {candidates.length > 6 && (
                  <div className="text-[11px] text-muted-foreground text-center">
                    +{candidates.length - 6} more
                  </div>
                )}
              </div>
            )}
            {closesAt && (
              <div className="mt-3 text-xs text-muted-foreground">
                Closes {new Date(closesAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
