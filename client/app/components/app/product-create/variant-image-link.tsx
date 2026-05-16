import { useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { useSetVariantImageMutation } from "~/hooks/use-product-mutations";
import type { ProductImage } from "~/types/api";

/**
 * Small popover that shows a thumbnail of the variant's currently-linked
 * image (or a placeholder), and on click reveals a grid of all product images
 * to pick from. Calls `setVariantImage` mutation on selection.
 */
export function VariantImageLink({
  productId,
  variantId,
  currentImageId,
  images,
}: {
  productId: string;
  variantId: string;
  currentImageId: string | null | undefined;
  images: ProductImage[];
}) {
  const [open, setOpen] = useState(false);
  const setImage = useSetVariantImageMutation(productId);
  const current = images.find((i) => i.id === currentImageId) ?? null;

  function pick(imageId: string | null) {
    setImage.mutate({ variantId, imageId });
    setOpen(false);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex size-7 items-center justify-center overflow-hidden rounded border border-input bg-white dark:bg-gray-900 hover:border-[#CEF17B]"
        title={current ? "Change variant image" : "Link an image to this variant"}
      >
        {current ? (
          <img src={current.src} alt={current.alt ?? ""} className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-3.5 text-muted-foreground" />
        )}
      </button>

      {open && (
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-40 w-56 rounded-lg border border-input bg-white dark:bg-gray-900 p-2 shadow-lg">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pick image
              </span>
              {current && (
                <button
                  type="button"
                  onClick={() => pick(null)}
                  title="Unlink image"
                  className="rounded p-0.5 text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-600"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            {images.length === 0 ? (
              <p className="py-3 text-center text-[10px] text-muted-foreground">
                Upload images to the product first.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => pick(img.id)}
                    className={`overflow-hidden rounded border-2 ${
                      img.id === currentImageId
                        ? "border-[#CEF17B]"
                        : "border-transparent hover:border-input"
                    }`}
                  >
                    <img
                      src={img.src}
                      alt={img.alt ?? ""}
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
