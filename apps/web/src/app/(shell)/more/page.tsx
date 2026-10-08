"use client";

import Link from "next/link";
import { ChevronLeft, Info, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { t } from "@/i18n/he";
import { NAV_SETTINGS, availableDevTools } from "@/lib/navigation";
import { useAuth } from "@/providers/AuthProvider";

function NavRow({
  href,
  label,
  hint,
  icon: Icon,
  dashed = false,
}: {
  href: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  dashed?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card className={`flex min-h-16 items-center gap-3 py-3 ${dashed ? "border-dashed" : ""}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-ink">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{label}</p>
          {hint ? <p className="truncate text-xs text-ink-muted">{hint}</p> : null}
        </div>
        <ChevronLeft className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} aria-hidden />
      </Card>
    </Link>
  );
}

export default function MorePage() {
  const { user, hub, logout } = useAuth();
  const devTools = availableDevTools(hub);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title={t("moreTitle")} />

      <section>
        <SectionHeader title={t("productSection")} />
        <div className="space-y-2">
          <NavRow href={NAV_SETTINGS.href} label={NAV_SETTINGS.label} icon={NAV_SETTINGS.icon} />
        </div>
      </section>

      <section>
        <SectionHeader title={t("systemSection")} />
        <div className="space-y-2">
          <Card className="flex min-h-16 items-center gap-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-ink">
              <User className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-muted">{t("signedInAs")}</p>
              <p className="text-sm font-medium text-ink">{user?.username}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => logout()}>
              <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t("logout")}
            </Button>
          </Card>
          <NavRow
            href="/settings?section=about"
            label={t("settingsAbout")}
            hint={hub ? `${hub.name} · ${t("hubVersion")} ${hub.version}` : undefined}
            icon={Info}
          />
        </div>
      </section>

      {devTools.length > 0 ? (
        <section className="border-t border-dashed border-border pt-6" data-testid="more-dev-tools">
          <SectionHeader
            title={t("devToolsSection")}
            hint={t("devSimulateHint")}
            action={<Chip tone="dashed">{t("devToolBadge")}</Chip>}
            muted
          />
          <div className="space-y-2">
            {devTools.map((tool) => (
              <NavRow key={tool.key} href={tool.href} label={tool.label} hint={tool.hint} icon={tool.icon} dashed />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
