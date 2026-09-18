import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Paperclip, X, Loader2, FileText, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

export interface AttachmentRow {
  id: string;
  ticket_id: string;
  message_id: string | null;
  user_id: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

interface UploaderProps {
  ticketId: string;
  userId: string;
  onUploaded?: (att: AttachmentRow) => void;
  disabled?: boolean;
}

/** Inline upload trigger: paperclip button + hidden file input. */
export function AttachmentUploader({ ticketId, userId, onUploaded, disabled }: UploaderProps) {
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("File too large (max 5MB)");
      return;
    }
    if (!ALLOWED.includes(file.type)) {
      toast.error("Unsupported file type");
      return;
    }
    setBusy(true);
    const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    const path = `${ticketId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("support-attachments")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setBusy(false);
      toast.error(friendlyError(upErr));
      return;
    }
    const { data, error } = await supabase
      .from("support_ticket_attachments")
      .insert({
        ticket_id: ticketId,
        user_id: userId,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    onUploaded?.(data as AttachmentRow);
    toast.success("Attached");
  };

  return (
    <label className={cn("inline-flex", disabled && "pointer-events-none opacity-50")}>
      <input
        type="file"
        accept={ALLOWED.join(",")}
        className="hidden"
        disabled={busy || disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="ghost" size="sm" disabled={busy || disabled} asChild>
        <span>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Attach</span>
      </Button>
    </label>
  );
}

interface ListProps {
  attachments: AttachmentRow[];
  onRemoved?: (id: string) => void;
  canDelete?: boolean;
}

export function AttachmentList({ attachments, onRemoved, canDelete }: ListProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      const next: Record<string, string> = {};
      for (const a of attachments) {
        if (urls[a.id]) {
          next[a.id] = urls[a.id];
          continue;
        }
        const { data } = await supabase.storage
          .from("support-attachments")
          .createSignedUrl(a.storage_path, 60 * 60);
        if (data?.signedUrl) next[a.id] = data.signedUrl;
      }
      if (mounted) setUrls(next);
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments.map((a) => a.id).join(",")]);

  const remove = async (a: AttachmentRow) => {
    await supabase.storage.from("support-attachments").remove([a.storage_path]);
    await supabase.from("support_ticket_attachments").delete().eq("id", a.id);
    onRemoved?.(a.id);
  };

  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map((a) => {
        const isImg = a.mime_type.startsWith("image/");
        const url = urls[a.id];
        return (
          <div key={a.id} className="relative group border border-border rounded-lg p-2 bg-background/50 max-w-[160px]">
            {isImg && url ? (
              <a href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="attachment" className="h-20 w-full object-cover rounded" />
              </a>
            ) : (
              <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                {isImg ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                <span className="truncate">{a.storage_path.split("/").pop()}</span>
              </a>
            )}
            <div className="text-[10px] text-muted-foreground mt-1">{(a.size_bytes / 1024).toFixed(0)} KB</div>
            {canDelete && (
              <button
                onClick={() => remove(a)}
                className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                aria-label="Remove attachment"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
