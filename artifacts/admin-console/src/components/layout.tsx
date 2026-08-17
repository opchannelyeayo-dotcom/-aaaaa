import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  LayoutDashboard,
  Link as LinkIcon,
  ListFilter,
  LogOut,
  Pill,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Visual language mirrors artifacts/rhetoric-xray/src/components/layout.tsx
// (same header pattern, same font-serif brand mark, same container width)
// so the admin console reads as the same product — with a "後台管理" badge
// next to the brand so it's never mistaken for the public site.
const NAV_ITEMS = [
  { href: "/", label: "儀表板", icon: LayoutDashboard },
  { href: "/records", label: "分析紀錄", icon: ListFilter },
  { href: "/products", label: "藥品資料庫", icon: Pill },
  { href: "/risk-tags", label: "話術風險標籤", icon: ShieldAlert },
  { href: "/risk-analyze", label: "風險分析", icon: ScanSearch },
  { href: "/url-scans", label: "網址查詢紀錄", icon: LinkIcon },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "超級管理員",
  reviewer: "內容審核員",
  viewer: "只讀使用者",
};

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { logout, role, username } = useAuth();
  const navItems =
    role === "super_admin"
      ? [...NAV_ITEMS, { href: "/users", label: "使用者管理", icon: Users }]
      : NAV_ITEMS;

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-2 text-primary font-serif font-bold text-xl">
              <ShieldCheck className="w-6 h-6" />
              話術透視鏡
            </span>
            <Badge variant="secondary">後台管理</Badge>
            {role && (
              <Badge variant="outline" title={username ?? undefined}>
                {ROLE_LABELS[role] ?? role}
              </Badge>
            )}
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
            {/* Separate app (rhetoric-xray), not part of this SPA's routing —
                a plain anchor triggers a full navigation instead of wouter. */}
            <a
              href={__MAIN_SITE_URL__}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              回首頁
            </a>
            <Button variant="ghost" size="sm" onClick={() => logout()} className="ml-2">
              <LogOut className="w-4 h-4 mr-1.5" /> 登出
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">{children}</main>
    </div>
  );
}
