import { useRef, useState } from "react";
import { Loader2, Star, Trash2, UploadCloud, GripVertical } from "lucide-react";
import {
  useUploadImageMutation,
  useUpdateImageMutation,
  useRemoveImageMutation,
  useReorderImagesMutation,
} from "~/hooks/use-product-mutations";
import type { ProductImage } from "~/types/api";

/**
 * Drag-and-drop multi-image gallery for a product. Each tile shows the image
 * with controls for: edit alt, set-as-featured (move to position 1), delete.
 * Tiles can be drag-reordered to change the position field server-side.
 *
 * Uploads happen one at a time so each surfaces its own toast/error.
 */
export function ImageGalleryUploader({
  productId,
  images,
}: {
  productId: string;
  images: ProductImage[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [editingAlt, setEditingAlt] = useState<string | null>(null);
  const [altDraft, setAltDraft] = useState("");

  const upload = useUploadImageMutation(productId);
  const updateAlt = useUpdateImageMutation(productId);
  const removeImage = useRemoveImageMutation(productId);
  const reorder = useReorderImagesMutation(productId);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      await upload.mutateAsync(file).catch(() => undefined);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function setFeatured(imageId: string) {
    // Featured = position 1. Move it to the top of the order.
    const next = [imageId, ...images.filter((i) => i.id !== imageId).map((i) => i.id)];
    reorder.mutate(next);
  }

  function deleteImage(imageId: string) {
    if (!confirm("Remove this image?")) return;
    removeImage.mutate(imageId);
  }

  function startEditAlt(image: ProductImage) {
    setEditingAlt(image.id);
    setAltDraft(image.alt ?? "");
  }

  function commitAlt(imageId: string) {
    updateAlt.mutate(
      { imageId, alt: altDraft.trim() || null },
      { onSettled: () => setEditingAlt(null) },
    );
  }

  function handleDrop(targetIdx: number) {
    if (draggingIdx === null || draggingIdx === targetIdx) {
      setDraggingIdx(null);
      return;
    }
    const next = [...images];
    const [moved] = next.splice(draggingIdx, 1);
    next.splice(targetIdx, 0, moved);
    reorder.mutate(next.map((i) => i.id));
    setDraggingIdx(null);
  }

  return (
    <div>
      {/* Drop zone / file picker */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-gray-50 dark:bg-gray-800/40 p-6 text-xs text-muted-foreground hover:border-[#CEF17B] hover:bg-[#CEF17B]/5"
      >
        {upload.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Uploading…
          </>
        ) : (
          <>
            <UploadCloud className="size-4" />
            Drop images here or click to upload (JPEG, PNG, WebP, GIF — max 5MB each)
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Tile grid */}
      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img, idx) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => setDraggingIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              className="group relative overflow-hidden rounded-lg border border-input bg-white dark:bg-gray-900"
            >
              <img
                src={img.src}
                alt={img.alt ?? ""}
                className="aspect-square w-full object-cover"
              />
              {idx === 0 && (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-[#CEF17B] px-1.5 py-0.5 text-[9px] font-semibold text-gray-900">
                  <Star className="size-2.5" /> Featured
                </span>
              )}
              <span className="absolute left-1.5 bottom-1.5 inline-flex items-center rounded bg-black/50 px-1 py-0.5 text-[9px] font-medium text-white opacity-0 group-hover:opacity-100">
                <GripVertical className="size-2.5" /> Drag
              </span>

              {/* Hover overlay */}
              <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {editingAlt === img.id ? (
                  <input
                    autoFocus
                    value={altDraft}
                    onChange={(e) => setAltDraft(e.target.value)}
                    onBlur={() => commitAlt(img.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitAlt(img.id);
                      if (e.key === "Escape") setEditingAlt(null);
                    }}
                    placeholder="Alt text"
                    className="h-6 w-full rounded border border-white/30 bg-white/90 px-1.5 text-[10px] focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditAlt(img)}
                    className="text-left text-[10px] font-medium text-white hover:underline"
                  >
                    {img.alt ?? "Set alt text…"}
                  </button>
                )}
                <div className="flex items-center gap-1">
                  {idx !== 0 && (
                    <button
                      type="button"
                      onClick={() => setFeatured(img.id)}
                      title="Set as featured"
                      className="rounded bg-white/90 p-1 text-gray-900 hover:bg-white"
                    >
                      <Star className="size-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteImage(img.id)}
                    title="Remove image"
                    className="rounded bg-white/90 p-1 text-red-600 hover:bg-white"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Drag tiles to reorder. The first image becomes the product thumbnail.
        </p>
      )}
    </div>
  );
}
