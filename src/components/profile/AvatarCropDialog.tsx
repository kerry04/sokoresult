import { useCallback, useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { getCroppedBlob, type Area } from "./cropImage";
import { cn } from "@/lib/utils";

interface Props {
  file: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropped: (blob: Blob, outputSize: number) => Promise<void> | void;
}

const SIZE_OPTIONS = [
  { value: 256, label: "256" },
  { value: 512, label: "512" },
  { value: 1024, label: "1024" },
] as const;

export function AvatarCropDialog({ file, open, onOpenChange, onCropped }: Props) {
  const imageUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [outputSize, setOutputSize] = useState<number>(512);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  // Reset state whenever a new file is loaded.
  useEffect(() => {
    if (file) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
    }
  }, [file]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  const handleSave = async () => {
    if (!imageUrl || !croppedArea) return;
    try {
      setSaving(true);
      const blob = await getCroppedBlob(imageUrl, croppedArea, outputSize);
      await onCropped(blob, outputSize);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>
            Drag to reposition. Pinch or use the slider to zoom. Your photo will
            be cropped to a circle.
          </DialogDescription>
        </DialogHeader>

        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-muted">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              objectFit="cover"
            />
          )}
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.01}
              onValueChange={(v) => setZoom(v[0])}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Output size
            </span>
            <div className="flex gap-1">
              {SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOutputSize(opt.value)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-mono border transition",
                    outputSize === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}px
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!croppedArea || saving}
            className="w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              "Use photo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
