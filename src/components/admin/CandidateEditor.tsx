import { Plus, X, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface Candidate {
  label: string;
  image_url: string;
  price_pct: number; // 1..98
}

interface Props {
  candidates: Candidate[];
  onChange: (next: Candidate[]) => void;
}

export function slugifyLabel(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

export function CandidateEditor({ candidates, onChange }: Props) {
  const total = candidates.reduce((s, c) => s + (c.price_pct || 0), 0);
  const sumOk = total === 100;

  const update = (i: number, patch: Partial<Candidate>) => {
    const next = candidates.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
    onChange(next);
  };

  const add = () => {
    if (candidates.length >= 12) return;
    const remaining = Math.max(1, 100 - total);
    onChange([
      ...candidates,
      { label: "", image_url: "", price_pct: Math.min(remaining, 10) },
    ]);
  };

  const remove = (i: number) => {
    if (candidates.length <= 2) return;
    onChange(candidates.filter((_, idx) => idx !== i));
  };

  const normalize = () => {
    if (candidates.length === 0) return;
    if (total === 0) {
      const eq = Math.floor(100 / candidates.length);
      const rem = 100 - eq * candidates.length;
      onChange(
        candidates.map((c, i) => ({ ...c, price_pct: eq + (i === 0 ? rem : 0) })),
      );
      return;
    }
    // Scale to 100, then fix rounding on first row
    const scaled = candidates.map((c) =>
      Math.max(1, Math.round((c.price_pct / total) * 100)),
    );
    const drift = 100 - scaled.reduce((a, b) => a + b, 0);
    scaled[0] = Math.max(1, scaled[0] + drift);
    onChange(candidates.map((c, i) => ({ ...c, price_pct: scaled[i] })));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Candidates / outcomes</Label>
        <div
          className={`text-xs font-mono ${
            sumOk ? "text-success" : "text-warning"
          }`}
        >
          Sum: KSh {total} {sumOk ? "✓" : "(must total KSh 100)"}
        </div>
      </div>

      <div className="space-y-2">
        {candidates.map((c, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_140px_90px_36px] gap-2 items-center rounded-lg border border-border bg-background/40 p-2"
          >
            <Input
              value={c.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder={`Candidate ${i + 1}`}
              maxLength={60}
            />
            <Input
              value={c.image_url}
              onChange={(e) => update(i, { image_url: e.target.value })}
              placeholder="Image URL (opt)"
            />
            <div className="relative">
              <Input
                type="number"
                min={1}
                max={98}
                value={c.price_pct}
                onChange={(e) =>
                  update(i, {
                    price_pct: Math.max(
                      1,
                      Math.min(98, parseInt(e.target.value || "1", 10) || 1),
                    ),
                  })
                }
                className="pl-10 font-mono"
              />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                KSh
              </span>
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={candidates.length <= 2}
              className="h-9 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={candidates.length >= 12}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add candidate
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={normalize}
          disabled={sumOk}
        >
          <Wand2 className="h-3.5 w-3.5 mr-1" /> Normalize to KSh 100
        </Button>
      </div>
    </div>
  );
}
