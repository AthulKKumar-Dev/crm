import { useNavigate } from "react-router";
import { Copy, Loader2 } from "lucide-react";
import { useDuplicateProductMutation } from "~/hooks/use-product-mutations";

/**
 * Detail-page action button. Clones the current product (variants + images)
 * onto a new MANUAL-channel product with status DRAFT and " (Copy)" suffixed
 * to the title, then navigates to the new product's detail page.
 */
export function DuplicateButton({ productId }: { productId: string }) {
  const navigate = useNavigate();
  const dup = useDuplicateProductMutation();

  function handleClick() {
    dup.mutate(productId, {
      onSuccess: (newProduct) => navigate(`/products/${newProduct.id}`),
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={dup.isPending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-white dark:bg-gray-900 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:opacity-50"
    >
      {dup.isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Copy className="size-3.5" />
      )}
      Duplicate
    </button>
  );
}
