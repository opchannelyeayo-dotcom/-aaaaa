import { Link } from "wouter";
import { ShieldCheck, Clock, ShieldAlert, Settings, Type, Link as LinkIcon } from "lucide-react";
import { useFontSize, FONT_SIZE_OPTIONS } from "@/hooks/use-font-size";

export function Layout({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSize] = useFontSize();

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="relative flex items-center">
              <Type className="w-4 h-4 text-muted-foreground absolute left-2 pointer-events-none" />
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                aria-label="調整文字大小"
                className="h-8 pl-7 pr-2 rounded-md border border-input bg-background text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                {FONT_SIZE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <Link href="/" className="flex items-center gap-2 text-primary font-serif font-bold text-xl transition-opacity hover:opacity-80">
              <ShieldCheck className="w-6 h-6" />
              <span>話術透視鏡</span>
            </Link>
          </div>

          <nav className="flex items-center gap-4">
            <Link href="/history" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <Clock className="w-4 h-4" />
              <span>歷史紀錄</span>
            </Link>
            <Link href="/risk-tags" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <ShieldAlert className="w-4 h-4" />
              <span>風險標籤</span>
            </Link>
            <Link href="/url-check" className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <LinkIcon className="w-4 h-4" />
              <span>網址查詢</span>
            </Link>
            {/* Separate app (admin-console), not part of this SPA's routing —
                a plain anchor triggers a full navigation instead of wouter. */}
            <a href={__ADMIN_CONSOLE_URL__} className="text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
              <Settings className="w-4 h-4" />
              <span>後台管理</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {children}
      </main>

      <footer className="border-t py-8 mt-auto bg-card/50">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p className="font-serif">話術透視鏡 Ad Rhetoric X-Ray</p>
          <p className="mt-1">守護長輩與家人的健康消費防線</p>
        </div>
      </footer>
    </div>
  );
}
