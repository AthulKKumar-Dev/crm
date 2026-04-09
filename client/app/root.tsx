import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigate,
} from "react-router";

import type { Route } from "./+types/root";
import { QueryProvider } from "~/providers/query-provider";
import { Toaster } from "~/components/ui/sonner";
import { useThemeStore } from "~/stores/theme.store";
import { useAuthStore } from "~/stores/auth.store";
import { useEffect, useRef } from "react";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Toaster position="top-right" richColors />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/** Syncs the theme store state to the document root class on mount and theme changes. */
function ThemeInit() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", isDark);
  }, [theme]);
  return null;
}

/**
 * Watches for auth state transitions: authenticated → unauthenticated.
 * Redirects to /auth/login when logout occurs (covers API interceptor logout,
 * manual sign-out, and token refresh failure).
 */
function LogoutRedirect() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const prevAuth = useRef(isAuthenticated);

  useEffect(() => {
    if (prevAuth.current && !isAuthenticated) {
      navigate("/auth/login", { replace: true });
    }
    prevAuth.current = isAuthenticated;
  }, [isAuthenticated, navigate]);

  return null;
}

export default function App() {
  return (
    <QueryProvider>
      <ThemeInit />
      <LogoutRedirect />
      <Outlet />
    </QueryProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
