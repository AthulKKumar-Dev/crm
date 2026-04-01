import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { isAxiosError } from "axios";
import { Eye, EyeOff, Loader2, KeyRound, ArrowLeft } from "lucide-react";

import { useResetPasswordMutation } from "~/hooks/use-auth-mutations";

export function meta() {
  return [
    { title: "Reset Password | Collabo CRM" },
    { name: "description", content: "Set a new password for your account" },
  ];
}

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const reset = useResetPasswordMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const serverError =
    reset.error && isAxiosError(reset.error)
      ? reset.error.response?.data?.message
      : null;

  function onSubmit(data: FormValues) {
    reset.mutate({ token, newPassword: data.newPassword });
  }

  /* ── Invalid / missing token ── */
  if (!token) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-red-100">
          <KeyRound className="size-6 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Invalid link</h2>
        <p className="mt-2 text-sm text-gray-500">
          This reset link is missing or invalid. Please request a new one.
        </p>
        <Link
          to="/auth/forgot-password"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-[#cdff8c] px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#b8e87a]"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Heading */}
      <div className="mb-7">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#cdff8c]/30">
          <KeyRound className="size-5 text-[#4d7a00]" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Set a new password</h2>
        <p className="mt-1.5 text-sm text-gray-500">
          Choose a strong password you haven't used before.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* New password */}
        <div className="space-y-1.5">
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
            New password
          </label>
          <div className="relative">
            <input
              id="newPassword"
              type={showNew ? "text" : "password"}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...register("newPassword")}
              className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-[#cdff8c] focus:ring-2 focus:ring-[#cdff8c]/40 aria-[invalid=true]:border-red-400"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => setShowNew((p) => !p)}
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.newPassword && (
            <p className="text-xs text-red-500">{errors.newPassword.message}</p>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            Confirm new password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirm ? "text" : "password"}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
              className="w-full rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-[#cdff8c] focus:ring-2 focus:ring-[#cdff8c]/40 aria-[invalid=true]:border-red-400"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => setShowConfirm((p) => !p)}
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* Password hints */}
        <ul className="space-y-1 text-xs text-gray-400">
          <li>• At least 8 characters long</li>
          <li>• Mix of letters, numbers, and symbols recommended</li>
        </ul>

        {/* Server error */}
        {serverError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-600">{serverError}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={reset.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#cdff8c] px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#b8e87a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {reset.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Resetting password…
            </>
          ) : (
            "Reset password"
          )}
        </button>
      </form>

      {/* Back */}
      <div className="mt-6 flex justify-center">
        <Link
          to="/auth/login"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
