import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader } from "@/components/common/ImageUploader";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/admin/markets/$id/edit")({
  component: EditMarketPage,
});

const categories = ["politics", "sports", "entertainment", "economics"] as const;

interface MarketRow {
  id: string;
  question: string;
  description: string | null;
  category: (typeof categories)[number];
  closes_at: string | null;
  keywords: string[] | null;
  resolution_source: string | null;
  image_url: string | null;
  slug: string;
}

function EditMarketPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [market, setMarket] = useState<MarketRow | null>(null);

  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("politics");
  const [closesAt, setClosesAt] = useState("");
  const [keywords, setKeywords] = useState("");
  const [resolutionSource, setResolutionSource] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("markets")
        .select("id, question, description, category, closes_at, keywords, resolution_source, image_url, slug")
        .eq("id", id)
        .maybeSingle();
      if (error) toast.error(friendlyError(error));
      if (data) {
        const m = data as MarketRow;
        setMarket(m);
        setQuestion(m.question);
        setDescription(m.description ?? "");
        setCategory(m.category);
        setClosesAt(m.closes_at ? new Date(m.closes_at).toISOString().slice(0, 16) : "");
        setKeywords((m.keywords ?? []).join(", "));
        setResolutionSource(m.resolution_source ?? "");
        setImageUrl(m.image_url);
      }
      setLoading(false);
    })();
  }, [id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) {
      toast.error("Question is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("markets")
      .update({
        question: question.trim(),
        description: description.trim() || null,
        category,
        closes_at: closesAt ? new Date(closesAt).toISOString() : null,
        keywords: keywords
          ? keywords.split(",").map((k) => k.trim()).filter(Boolean)
          : null,
        resolution_source: resolutionSource.trim() || null,
        image_url: imageUrl,
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success("Market updated");
    navigate({ to: "/admin/markets" });
  };

  if (loading) {
    return (
      <div className="p-10 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
      </div>
    );
  }

  if (!market) {
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Market not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/admin/markets">Back to markets</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <Link to="/admin/markets" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to markets
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Edit market</h1>
      <p className="text-sm text-muted-foreground mb-6 font-mono">/markets/{market.slug}</p>

      <form onSubmit={save} className="space-y-5">
        <div>
          <Label>Market icon</Label>
          <div className="mt-1.5">
            <ImageUploader
              bucket="market-images"
              value={imageUrl}
              onChange={setImageUrl}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="q">Question</Label>
          <Textarea
            id="q"
            value={question}
            maxLength={200}
            onChange={(e) => setQuestion(e.target.value)}
            className="min-h-[80px] mt-1.5"
            required
          />
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

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving} className="bg-success hover:bg-success/90 text-success-foreground">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save changes
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link to="/admin/markets">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
