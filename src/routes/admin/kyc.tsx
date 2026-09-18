import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/errors";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldX, Eye, Clock } from "lucide-react";

export const Route = createFileRoute("/admin/kyc")({
  component: AdminKycPage,
});

interface Row {
  id: string;
  user_id: string;
  full_name: string;
  date_of_birth: string;
  id_type: "national_id" | "passport";
  id_number: string;
  id_front_path: string;
  id_back_path: string | null;
  selfie_path: string | null;
  status: "pending" | "approved" | "rejected";
  reviewer_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

function age(dob: string) {
  const d = new Date(dob);
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a;
}

function AdminKycPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [active, setActive] = useState<Row | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("kyc_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) toast.error(friendlyError(error));
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [filter]);

  const openReview = async (r: Row) => {
    setActive(r);
    setNotes(r.reviewer_notes ?? "");
    const paths = [r.id_front_path, r.id_back_path, r.selfie_path].filter(
      (p): p is string => !!p,
    );
    const urls: Record<string, string> = {};
    for (const p of paths) {
      const { data } = await supabase.storage
        .from("kyc-documents")
        .createSignedUrl(p, 60 * 10);
      if (data?.signedUrl) urls[p] = data.signedUrl;
    }
    setSignedUrls(urls);
  };

  const decide = async (status: "approved" | "rejected") => {
    if (!active) return;
    if (status === "rejected" && !notes.trim()) {
      toast.error("Please add a rejection reason");
      return;
    }
    setWorking(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("kyc_submissions")
      .update({
        status,
        reviewer_notes: notes.trim() || null,
        reviewed_by: u.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", active.id);
    setWorking(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success(status === "approved" ? "Approved & user verified" : "Submission rejected");
    setActive(null);
    setSignedUrls({});
    load();
  };

  const statusBadge = (s: Row["status"]) => {
    if (s === "pending")
      return (
        <Badge variant="outline" className="border-warning/40 text-warning">
          <Clock className="h-3 w-3 mr-1" /> Pending
        </Badge>
      );
    if (s === "approved")
      return (
        <Badge className="bg-success/15 text-success border border-success/40">
          <ShieldCheck className="h-3 w-3 mr-1" /> Approved
        </Badge>
      );
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        <ShieldX className="h-3 w-3 mr-1" /> Rejected
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">KYC review queue</h1>
          <p className="text-sm text-muted-foreground">
            Verify identity and age before approving real-money trading.
          </p>
        </div>
        <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-md ${
                filter === f
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            No {filter !== "all" ? filter : ""} submissions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">DOB / Age</th>
                  <th className="text-left p-3">ID type</th>
                  <th className="text-left p-3">ID number</th>
                  <th className="text-left p-3">Submitted</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const a = age(r.date_of_birth);
                  return (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="p-3 font-medium">{r.full_name}</td>
                      <td className="p-3 text-muted-foreground">
                        {r.date_of_birth} ·{" "}
                        <span className={a >= 18 ? "text-success" : "text-destructive"}>
                          {a}y
                        </span>
                      </td>
                      <td className="p-3 capitalize text-muted-foreground">
                        {r.id_type.replace("_", " ")}
                      </td>
                      <td className="p-3 font-mono text-xs">{r.id_number}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="p-3">{statusBadge(r.status)}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => openReview(r)}>
                          <Eye className="h-3 w-3 mr-1" /> Review
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>Review · {active.full_name}</DialogTitle>
                <DialogDescription>
                  {active.id_type.replace("_", " ")} {active.id_number} · DOB {active.date_of_birth} (
                  {age(active.date_of_birth)} years)
                </DialogDescription>
              </DialogHeader>

              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: "ID front", path: active.id_front_path },
                  { label: "ID back", path: active.id_back_path },
                  { label: "Selfie", path: active.selfie_path },
                ]
                  .filter((d) => d.path)
                  .map((d) => (
                    <div key={d.label} className="space-y-1">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        {d.label}
                      </div>
                      {signedUrls[d.path!] ? (
                        <a href={signedUrls[d.path!]} target="_blank" rel="noreferrer">
                          <img
                            src={signedUrls[d.path!]}
                            alt={d.label}
                            className="rounded-lg border border-border w-full h-48 object-cover"
                          />
                        </a>
                      ) : (
                        <div className="rounded-lg border border-border h-48 flex items-center justify-center text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      )}
                    </div>
                  ))}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Reviewer notes (required for rejection)
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Document blurry, please resubmit clearer photo"
                  className="min-h-[80px]"
                />
              </div>

              {active.status !== "pending" && (
                <div className="text-xs text-muted-foreground">
                  Already {active.status}
                  {active.reviewed_at &&
                    ` on ${new Date(active.reviewed_at).toLocaleString()}`}
                </div>
              )}

              <DialogFooter>
                <Button variant="ghost" onClick={() => setActive(null)}>
                  Close
                </Button>
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => decide("rejected")}
                  disabled={working}
                >
                  <ShieldX className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button
                  className="bg-success hover:bg-success/90 text-success-foreground"
                  onClick={() => decide("approved")}
                  disabled={working}
                >
                  {working && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  <ShieldCheck className="h-4 w-4 mr-1" /> Approve
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
