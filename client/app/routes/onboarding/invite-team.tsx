import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { isAxiosError } from "axios";
import {
  Users, Plus, X, Loader2, ArrowLeft, ArrowRight, Mail, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useSendInviteMutation } from "~/hooks/use-org-mutations";
import type { UserRole } from "~/types/api";

export function meta() {
  return [{ title: "Invite Your Team | Collabo CRM" }];
}

interface InviteRow {
  id: string;
  email: string;
  role: UserRole;
  status: "idle" | "sending" | "sent" | "error";
  error?: string;
}

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: "ADMIN", label: "Admin", desc: "Full access, manage team" },
  { value: "MANAGER", label: "Manager", desc: "Manage orders & customers" },
  { value: "AGENT", label: "Agent", desc: "Handle conversations" },
  { value: "VIEWER", label: "Viewer", desc: "Read-only access" },
];

export default function InviteTeamPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orgId = searchParams.get("orgId") ?? "";

  const [rows, setRows] = useState<InviteRow[]>([
    { id: crypto.randomUUID(), email: "", role: "AGENT", status: "idle" },
  ]);
  const [isSendingAll, setIsSendingAll] = useState(false);

  const sendInvite = useSendInviteMutation(orgId);

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), email: "", role: "AGENT", status: "idle" },
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateEmail(id: string, email: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, email, status: "idle", error: undefined } : r))
    );
  }

  function updateRole(id: string, role: UserRole) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, role } : r))
    );
  }

  async function handleSendAll() {
    const validRows = rows.filter(
      (r) => r.email.trim() && r.status !== "sent"
    );

    if (validRows.length === 0) {
      navigate("/dashboard");
      return;
    }

    setIsSendingAll(true);

    for (const row of validRows) {
      // Mark as sending
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: "sending" } : r))
      );

      try {
        await sendInvite.mutateAsync({ email: row.email.trim(), role: row.role });
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, status: "sent" } : r))
        );
      } catch (error) {
        const msg =
          isAxiosError(error)
            ? error.response?.data?.message || "Failed to send"
            : "Failed to send";
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id ? { ...r, status: "error", error: msg } : r
          )
        );
      }
    }

    setIsSendingAll(false);

    // Check if all sent successfully
    setTimeout(() => {
      setRows((current) => {
        const allDone = current.every(
          (r) => r.status === "sent" || !r.email.trim()
        );
        if (allDone) {
          toast.success("All invitations sent! Redirecting to dashboard…");
          setTimeout(() => navigate("/dashboard"), 1200);
        }
        return current;
      });
    }, 300);
  }

  function handleSkip() {
    navigate("/dashboard");
  }

  const sentCount = rows.filter((r) => r.status === "sent").length;
  const hasValidEmails = rows.some((r) => r.email.trim() && r.status !== "sent");

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8 flex items-center justify-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className="size-2 rounded-full bg-gray-300" />
          <div className="h-px w-6 bg-gray-200" />
          <div className="size-2 rounded-full bg-gray-300" />
          <div className="h-px w-6 bg-gray-200" />
          <div className="size-2 rounded-full bg-[#cdff8c]" />
        </div>
        <span className="ml-2 text-xs text-gray-400">Step 3 of 3</span>
      </div>

      {/* Heading */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#cdff8c]/30">
          <Users className="size-5 text-[#4d7a00]" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Invite your team</h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Add team members to collaborate. You can always invite more people later.
        </p>
      </div>

      {/* Invite rows card */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/[0.06]">
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.id} className="flex  gap-2 items-center ">
              {/* Email */}
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <input
                  type="email"
                  placeholder="teammate@company.com"
                  value={row.email}
                  onChange={(e) => updateEmail(row.id, e.target.value)}
                  disabled={row.status === "sent" || row.status === "sending"}
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-[#cdff8c] focus:ring-2 focus:ring-[#cdff8c]/40 disabled:bg-gray-50 disabled:opacity-60"
                />
                {row.status === "sent" && (
                  <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-[#4d7a00]" />
                )}
              </div>

              {/* Role select */}
              <Select
                value={row.role}
                onValueChange={(v) => updateRole(row.id, v as UserRole)}
                disabled={row.status === "sent" || row.status === "sending"}
              >
                <SelectTrigger className="w-[130px] shrink-0 border-gray-200 bg-white shadow-sm focus:ring-[#cdff8c]/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <div>
                        <span className="font-medium">{r.label}</span>
                        <span className="ml-1.5 text-[10px] text-gray-400">{r.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Remove button */}
              {rows.length > 1 && row.status !== "sent" && (
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  className="mt-2.5 shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <X className="size-4" />
                </button>
              )}

              {/* Spacer if can't remove */}
              {(rows.length <= 1 || row.status === "sent") && (
                <div className="w-4 shrink-0" />
              )}
            </div>
          ))}

          {/* Error messages */}
          {rows.some((r) => r.error) && (
            <div className="space-y-1 pt-1">
              {rows
                .filter((r) => r.error)
                .map((r) => (
                  <p key={r.id} className="text-xs text-red-500">
                    {r.email}: {r.error}
                  </p>
                ))}
            </div>
          )}
        </div>

        {/* Add another */}
        <button
          type="button"
          onClick={addRow}
          disabled={isSendingAll}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#4d7a00] hover:text-[#3d6000] transition-colors disabled:opacity-50"
        >
          <Plus className="size-4" /> Add another
        </button>

        {/* Sent counter */}
        {sentCount > 0 && (
          <p className="mt-3 text-xs text-[#4d7a00]">
            <CheckCircle2 className="inline size-3.5 mr-1" />
            {sentCount} invitation{sentCount > 1 ? "s" : ""} sent successfully
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between">
        <Link
          to="/onboarding/create-organization"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="size-4" /> Back
        </Link>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isSendingAll}
            className="text-sm font-medium text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            Skip for now
          </button>

          <button
            type="button"
            onClick={handleSendAll}
            disabled={isSendingAll || (!hasValidEmails && sentCount === 0)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#cdff8c] px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#b8e87a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingAll ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending…
              </>
            ) : hasValidEmails ? (
              <>
                Send invitations
                <ArrowRight className="size-4" />
              </>
            ) : (
              <>
                Go to dashboard
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
