"use client";

import { useRouter } from "next/navigation";
import { clearBackendToken } from "@/lib/backend-auth";
import { useRequireTeacher } from "@/hooks/use-require-teacher";

export default function TeacherDashboardPage() {
  const router = useRouter();
  const { loading, teacherName } = useRequireTeacher();

  const handleLogout = () => {
    clearBackendToken();
    router.push("/");
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800">{teacherName}，你好</h1>
            <p className="mt-1 text-sm text-slate-500">請選擇要進入的管理頁面。</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-xl border border-rose-100 px-4 py-2 font-bold text-rose-600 hover:bg-rose-50"
          >
            登出
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-100 bg-white p-6">
            <h2 className="text-xl font-black text-slate-800">課程資料管理</h2>
            <p className="mt-2 text-sm text-slate-500">建立課程、查看課程狀態與啟動開課。</p>
            <button
              type="button"
              onClick={() => router.push("/teacher/dashboard/courses")}
              className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white hover:bg-indigo-700"
            >
              進入課程資料管理
            </button>
          </article>

          <article className="rounded-2xl border border-slate-100 bg-white p-6">
            <h2 className="text-xl font-black text-slate-800">學生資料管理</h2>
            <p className="mt-2 text-sm text-slate-500">
              單筆建立、批次匯入、學生查詢編輯與分組整併於同一頁，可選擇加入課程。
            </p>
            <button
              type="button"
              onClick={() => router.push("/teacher/dashboard/students")}
              className="mt-5 rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white hover:bg-indigo-700"
            >
              進入學生資料管理
            </button>
          </article>
        </section>
      </div>
    </main>
  );
}
