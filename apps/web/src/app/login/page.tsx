"use client";

import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/providers/AuthProvider";
import { t } from "@/i18n/he";

export default function LoginPage() {
  const { login, token, loading } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && token) window.location.replace("/");
  }, [loading, token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorLoad"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink text-surface">
          <Layers className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">{t("loginTitle")}</h1>
          <p className="text-sm text-ink-muted">{t("loginSubtitle")}</p>
        </div>
      </div>
      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">{t("username")}</label>
            <Input
              aria-label={t("username")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-muted">{t("password")}</label>
            <Input
              aria-label={t("password")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-sm text-ink">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t("loggingIn") : t("login")}
          </Button>
        </form>
      </Card>
    </main>
  );
}
