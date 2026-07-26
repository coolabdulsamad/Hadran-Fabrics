import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * HADRAN FABRICS MALL — product image picker.
 * Upload photos straight from the device (stored on the shop server), or
 * paste an external URL. The first image is the primary photo shown in the
 * catalog, POS and receipts.
 */

interface ProductImagePickerProps {
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
}

export function ProductImagePicker({ images, onChange, max = 6 }: ProductImagePickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = max - images.length;
    if (room <= 0) {
      toast.error(`Maximum ${max} images per product.`);
      return;
    }
    setUploading(true);
    try {
      const picked = [...files].slice(0, room);
      const urls: string[] = [];
      for (const f of picked) {
        if (f.size > 5 * 1024 * 1024) {
          toast.error(`"${f.name}" is over 5MB — skipped.`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", f);
        fd.append("kind", "product");
        const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        urls.push(data.url);
      }
      if (urls.length > 0) {
        onChange([...images, ...urls]);
        toast.success(`${urls.length} photo${urls.length === 1 ? "" : "s"} added.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addUrl = () => {
    const u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\/.+/.test(u)) {
      toast.error("Enter a full URL starting with http:// or https://");
      return;
    }
    if (images.length >= max) {
      toast.error(`Maximum ${max} images per product.`);
      return;
    }
    onChange([...images, u]);
    setUrlDraft("");
  };

  const removeAt = (idx: number) => onChange(images.filter((_, i) => i !== idx));
  const makePrimary = (idx: number) => {
    const next = [...images];
    const [img] = next.splice(idx, 1);
    next.unshift(img);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {images.map((url, idx) => (
          <div key={`${url}-${idx}`} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
            <img src={url} alt={`Product ${idx + 1}`} className="h-full w-full object-cover" />
            {idx === 0 && (
              <span className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-gold-500 px-2 py-0.5 text-[10px] font-bold text-navy-900">
                <Star className="h-2.5 w-2.5" /> PRIMARY
              </span>
            )}
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-navy-900/60 opacity-0 transition group-hover:opacity-100">
              {idx !== 0 && (
                <button type="button" title="Make primary" onClick={() => makePrimary(idx)}
                  className="rounded-full bg-gold-500 p-1.5 text-navy-900 hover:bg-gold-400">
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              <button type="button" title="Remove" onClick={() => removeAt(idx)}
                className="rounded-full bg-red-600 p-1.5 text-white hover:bg-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {images.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gold-500/40 bg-gold-50/40 text-gold-700 transition hover:border-gold-500 hover:bg-gold-50"
          >
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
            <span className="px-1 text-center text-[10px] font-semibold leading-tight">
              {uploading ? "Uploading…" : "Upload from device"}
            </span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />

      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          className="input-lux h-9 flex-1 text-sm"
          placeholder="…or paste an image URL and press Add"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addUrl}>Add URL</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        JPG, PNG, WebP or GIF — max 5MB each, up to {max} photos. The first photo is the primary image.
      </p>
    </div>
  );
}
