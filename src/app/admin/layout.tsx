"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "▣" },
  { href: "/admin/products", label: "Products", icon: "▤" },
  { href: "/admin/service-templates", label: "Service Templates", icon: "◈" },
  { href: "/admin/orders", label: "Orders", icon: "▦" },
  { href: "/admin/shopify-sync", label: "Shopify Sync", icon: "⟳" },
  { href: "/admin/settings", label: "Digistore Settings", icon: "⚙" },
  { href: "/admin/logs", label: "Logs", icon: "≡" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string>("");

  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    const supabase = supabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/admin/login");
        return;
      }
      setEmail(data.session.user.email ?? "");
      setReady(true);
    });
  }, [isLogin, router]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/admin/login");
  }

  if (isLogin) return <>{children}</>;
  if (!ready) return <div className="min-h-screen grid place-items-center text-ink-muted">Loading…</div>;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-surface-border bg-white flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-surface-border">
          <div className="h-8 w-8 rounded-lg bg-brand-600 text-white grid place-items-center font-bold text-sm">
            S
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">SRD Digital</p>
            <p className="text-[11px] text-ink-subtle">Checkout Bridge</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-ink-muted hover:bg-surface-soft hover:text-ink"
                }`}
              >
                <span className="w-4 text-center text-xs">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-surface-border">
          <p className="text-xs text-ink-subtle px-3 truncate mb-2">{email}</p>
          <button onClick={signOut} className="btn-ghost w-full text-xs">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
