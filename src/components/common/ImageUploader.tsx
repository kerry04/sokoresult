import { useRef, useState } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  bucket: string;
  pathPrefix?: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  className?: string;
  /** Max bytes (default 3 MB). */
  maxBytes?: number;
}

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

export function ImageUploader({
  bucket,
  pathPrefix = "",
  value,
  onChange,
  className,
  maxBytes = 3 * 1024 * 1024,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!ACCEPT.includes(file.type)) {
      toast.error("Use JPG, PNG, or WEBP");
      return;
    }
    if (file.size > maxBytes) {
      toast.error(`Max ${(maxBytes / 1024 / 1024).toFixed(0)} MB`);
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const key = `${pathPrefix}${pathPrefix ? "/" : ""}${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(key, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(key);
      onChange(data.publicUrl);
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Preview"
            className="h-28 w-28 rounded-xl object-cover border border-border"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:scale-110 transition"
            aria-label="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="h-28 w-28 rounded-xl border-2 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 transition flex flex-col items-center justify-center text-muted-foreground gap-1.5"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <ImageIcon className="h-5 w-5" />
              <span className="text-[10px] uppercase tracking-wider">Upload</span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Upload className="h-3 w-3" /> JPG / PNG / WEBP · max{" "}
        {(maxBytes / 1024 / 1024).toFixed(0)} MB
      </div>
    </div>
  );
}
