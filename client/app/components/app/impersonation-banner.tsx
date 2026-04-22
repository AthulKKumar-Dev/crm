import { AlertTriangle } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useStopImpersonating } from "~/hooks/use-admin-queries";
import { useAuthStore } from "~/stores/auth.store";

/**
 * High-contrast banner shown at the very top of the app layout whenever a
 * super admin is impersonating another user. Makes the impersonation state
 * impossible to overlook, and offers a one-click exit path.
 *
 * Renders nothing when `impersonatedBy` is null (the normal case).
 */
export function ImpersonationBanner() {
    const { user, impersonatedBy } = useAuthStore();
    const stop = useStopImpersonating();

    if (!impersonatedBy || !user) return null;

    return (
        <div className="sticky top-0 z-[60] w-full border-b border-amber-600 bg-amber-400 text-gray-900">
            <div className="mx-auto flex h-10 max-w-screen-xl items-center justify-between px-6 text-sm">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4" />
                    <span>
                        You are impersonating{" "}
                        <strong>
                            {user.firstName} {user.lastName}
                        </strong>{" "}
                        ({user.email})
                    </span>
                </div>
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => stop.mutate()}
                    disabled={stop.isPending}
                >
                    {stop.isPending ? "Exiting..." : "Exit impersonation"}
                </Button>
            </div>
        </div>
    );
}
