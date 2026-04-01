import { useState } from "react";
import { useNavigate } from "react-router";
import { User, Users, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "~/lib/utils";
import { useAuthStore } from "~/stores/auth.store";
import { useCreatePersonalMutation } from "~/hooks/use-org-mutations";

export function meta() {
  return [{ title: "Choose Account Type | Collabo CRM" }];
}

export default function AccountTypePage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<"personal" | "organization" | null>(null);
  const user = useAuthStore((s) => s.user);
  const createPersonal = useCreatePersonalMutation();

  function handleSelect(type: "personal" | "organization") {
    setSelected(type);
    if (type === "personal") {
      createPersonal.mutate();
    } else {
      navigate("/onboarding/create-organization");
    }
  }

  const firstName = user?.firstName ?? "there";

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="size-2 rounded-full bg-[#cdff8c]" />
          <div className="h-px w-6 bg-gray-200" />
          <div className="size-2 rounded-full bg-gray-200" />
          <div className="h-px w-6 bg-gray-200" />
          <div className="size-2 rounded-full bg-gray-200" />
        </div>
        <span className="ml-2 text-xs text-gray-400">Step 1 of 3</span>
      </div>

      {/* Heading */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#cdff8c]/30">
          <Sparkles className="size-5 text-[#4d7a00]" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">
          Welcome, {firstName}!
        </h2>
        <p className="mt-1.5 text-sm text-gray-500">
          How would you like to use Collabo CRM?
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Personal */}
        <button
          type="button"
          onClick={() => handleSelect("personal")}
          disabled={createPersonal.isPending}
          className={cn(
            "group relative flex flex-col items-center gap-5 rounded-2xl border-2 bg-white p-8 text-center shadow-sm transition-all hover:border-[#cdff8c] hover:shadow-md disabled:pointer-events-none disabled:opacity-60",
            selected === "personal" ? "border-[#cdff8c] shadow-md" : "border-transparent"
          )}
        >
          <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 ring-2 ring-[#cdff8c]/50 transition group-hover:opacity-100" />

          <div className={cn(
            "flex size-14 items-center justify-center rounded-2xl transition-colors",
            selected === "personal" && createPersonal.isPending
              ? "bg-[#cdff8c]/40"
              : "bg-[#cdff8c]/15 group-hover:bg-[#cdff8c]/30"
          )}>
            {createPersonal.isPending && selected === "personal" ? (
              <Loader2 className="size-6 animate-spin text-[#4d7a00]" />
            ) : (
              <User className="size-6 text-[#4d7a00]" />
            )}
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-gray-900">Just me</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Solo workspace for individual use. Perfect for freelancers and solopreneurs.
            </p>
          </div>

          <div className="mt-auto inline-flex items-center gap-1.5 rounded-full bg-[#cdff8c]/20 px-3 py-1 text-xs font-semibold text-[#4d7a00] transition group-hover:bg-[#cdff8c]/40">
            Get started <ArrowRight className="size-3.5" />
          </div>
        </button>

        {/* Organization */}
        <button
          type="button"
          onClick={() => handleSelect("organization")}
          disabled={createPersonal.isPending}
          className={cn(
            "group relative flex flex-col items-center gap-5 rounded-2xl border-2 bg-white p-8 text-center shadow-sm transition-all hover:border-[#cdff8c] hover:shadow-md disabled:pointer-events-none disabled:opacity-60",
            selected === "organization" ? "border-[#cdff8c] shadow-md" : "border-transparent"
          )}
        >
          <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 ring-2 ring-[#cdff8c]/50 transition group-hover:opacity-100" />

          <div className="flex size-14 items-center justify-center rounded-2xl bg-[#cdff8c]/15 transition-colors group-hover:bg-[#cdff8c]/30">
            <Users className="size-6 text-[#4d7a00]" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-gray-900">My team</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Team workspace with collaboration features. Invite members and manage roles.
            </p>
          </div>

          <div className="mt-auto inline-flex items-center gap-1.5 rounded-full bg-[#cdff8c]/20 px-3 py-1 text-xs font-semibold text-[#4d7a00] transition group-hover:bg-[#cdff8c]/40">
            Create organization <ArrowRight className="size-3.5" />
          </div>
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-gray-400">
        You can always create more workspaces later from your settings.
      </p>
    </div>
  );
}
