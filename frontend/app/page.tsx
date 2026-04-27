"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { clearBackendToken, loginBackend, setBackendToken } from "@/lib/backend-auth";
import { FJU_EMAIL_DOMAIN, fjuEmailFromStudentId } from "@/lib/fju-auth-email";

export default function LoginPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const routeAfterLogin = (profile: { role: "admin" | "teacher" | "student"; mustChangePassword: boolean }) => {
    if (profile.role === "student" && profile.mustChangePassword) {
      router.push("/change-password");
      return;
    }

    if (profile.role === "admin") {
      router.push("/admin/dashboard");
      return;
    }

    if (profile.role === "teacher") {
      router.push("/teacher/dashboard");
      return;
    }

    router.push("/student/dashboard");
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const normalizedId = studentId.trim();
    if (!normalizedId) {
      setErrorMessage("請輸入學號。");
      return;
    }

    setLoading(true);

    try {
      void fjuEmailFromStudentId(normalizedId);
    } catch {
      setErrorMessage("請輸入學號。");
      setLoading(false);
      return;
    }

    let backendLogin;
    try {
      backendLogin = await loginBackend(normalizedId, password);
    } catch {
      setErrorMessage("後端連線失敗，請確認 API 服務已啟動。");
      setLoading(false);
      clearBackendToken();
      return;
    }

    if (!backendLogin) {
      setErrorMessage("學號或密碼錯誤，請重新確認。");
      setLoading(false);
      clearBackendToken();
      return;
    }

    setBackendToken(backendLogin.token);
    routeAfterLogin({
      role: backendLogin.user.role,
      mustChangePassword: backendLogin.user.mustChangePassword,
    });
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-black text-slate-800">輔仁大學上課舉手發問系統</h1>
        <p className="mt-2 text-sm text-slate-500">請輸入學號與密碼登入系統。</p>

        <form className="mt-6 space-y-4" onSubmit={handleLogin}>
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">學號</label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="例如 410012345"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <p className="mt-1 text-xs text-slate-400">登入帳號為 學號{FJU_EMAIL_DOMAIN}</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          {errorMessage && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {loading ? "登入中..." : "登入"}
          </button>
        </form>
      </div>
    </main>
  );
}
