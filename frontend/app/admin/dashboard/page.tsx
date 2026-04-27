"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearBackendToken } from "@/lib/backend-auth";
import { useRequireAdmin } from "@/hooks/use-require-admin";
import { UsersPanel } from "./users-panel";
import { CoursesPanel } from "./courses-panel";

type Tab = "users" | "courses";

export default function AdminDashboardPage() {
  const router = useRouter();
  const { loading, adminName } = useRequireAdmin();
  const [tab, setTab] = useState<Tab>("users");

  const handleLogout = () => {
    clearBackendToken();
    router.push("/");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-center font-semibold text-slate-900">
        讀取中...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800">{adminName}，管理後台</h1>
            <p className="mt-1 text-sm text-slate-800">管理帳號、角色與全站課程資料。</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-rose-100 px-4 py-2 font-bold text-rose-600 hover:bg-rose-50"
          >
            登出
          </button>
        </header>

        <nav className="flex gap-2 rounded-2xl border border-slate-100 bg-white p-2">
          <button
            type="button"
            onClick={() => setTab("users")}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${
              tab === "users"
                ? "bg-indigo-600 text-white"
                : "text-slate-900 hover:bg-slate-50"
            }`}
          >
            帳號與角色
          </button>
          <button
            type="button"
            onClick={() => setTab("courses")}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${
              tab === "courses"
                ? "bg-indigo-600 text-white"
                : "text-slate-900 hover:bg-slate-50"
            }`}
          >
            課程與選課
          </button>
        </nav>

        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          {tab === "users" ? <UsersPanel /> : <CoursesPanel />}
        </section>
      </div>
    </main>
  );
}
