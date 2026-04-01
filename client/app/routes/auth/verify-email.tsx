import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { isAxiosError } from "axios";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "~/components/ui/input-otp";
import {
  useVerifyEmailMutation,
  useResendVerificationMutation,
} from "~/hooks/use-auth-mutations";

export function meta() {
  return [
    { title: "Verify Email | Collabo CRM" },
    { name: "description", content: "Verify your email address" },
  ];
}

const RESEND_COOLDOWN = 60;

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = searchParams.get("userId");

  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const verify = useVerifyEmailMutation();
  const resend = useResendVerificationMutation();

  // Only redirect if no userId when actually submitting — allow preview
  // useEffect(() => {
  //   if (!userId) navigate("/auth/signup", { replace: true });
  // }, [userId, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((p) => p - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleComplete = useCallback(
    (value: string) => {
      if (!userId) return;
      verify.mutate({ userId, code: value });
    },
    [userId, verify]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || code.length !== 6) return;
    verify.mutate({ userId, code });
  }

  function handleResend() {
    if (!userId || cooldown > 0) return;
    resend.mutate({ userId });
    setCooldown(RESEND_COOLDOWN);
  }

  const serverError =
    verify.error && isAxiosError(verify.error)
      ? verify.error.response?.data?.message
      : null;

  return (
    <div>
      {/* Icon + heading */}
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[#cdff8c]/30">
          <Mail className="size-6 text-[#4d7a00]" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Check your inbox</h2>
        <p className="mt-2 text-sm text-gray-500">
          We sent a 6-digit verification code to your email address. Enter it
          below to confirm your account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* OTP input */}
        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={handleComplete}
            disabled={verify.isPending}
          >
            <InputOTPGroup className="gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="size-11 rounded-lg border border-gray-200 bg-white text-base font-bold shadow-sm transition data-[active=true]:border-[#cdff8c] data-[active=true]:ring-2 data-[active=true]:ring-[#cdff8c]/40"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {/* Server error */}
        {serverError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-center text-sm text-red-600">{serverError}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={verify.isPending || code.length !== 6}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#cdff8c] px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#b8e87a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verify.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Verifying…
            </>
          ) : (
            "Verify email"
          )}
        </button>
      </form>

      {/* Resend */}
      <div className="mt-5 text-center">
        <p className="text-sm text-gray-500">Didn&apos;t receive the code?</p>
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resend.isPending}
          className="mt-1 text-sm font-semibold text-[#4d7a00] hover:text-[#3d6000] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resend.isPending
            ? "Sending…"
            : cooldown > 0
              ? `Resend code (${cooldown}s)`
              : "Resend code"}
        </button>
      </div>

      {/* Back link */}
      <div className="mt-6 flex justify-center">
        <Link
          to="/auth/signup"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to sign up
        </Link>
      </div>
    </div>
  );
}
