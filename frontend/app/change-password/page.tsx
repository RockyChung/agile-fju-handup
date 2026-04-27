"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearBackendToken, getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      const token = getBackendToken();
      if (!token) {
        router.replace("/");
        return;
      }

      const response = await fetch(`${getBackendApiBaseUrl()}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        clearBackendToken();
        router.replace("/");
        return;
      }
      const json = (await response.json()) as {
        user?: { role: "admin" | "teacher" | "student"; mustChangePassword: boolean };
      };
      const profile = json.user;

      if (!profile) {
        clearBackendToken();
        router.replace("/");
        return;
      }

      if (profile.role === "admin" && !profile.mustChangePassword) {
        router.replace("/admin/dashboard");
        return;
      }

      if (profile.role === "teacher" && !profile.mustChangePassword) {
        router.replace("/teacher/dashboard");
        return;
      }

      if (profile.role === "student" && !profile.mustChangePassword) {
        router.replace("/student/dashboard");
      }
    };

    void checkStatus();
  }, [router]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage("密碼至少需要 8 碼。");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("兩次輸入的密碼不一致。");
      return;
    }

    setLoading(true);

    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入狀態已失效，請重新登入。");
      setLoading(false);
      clearBackendToken();
      router.replace("/");
      return;
    }

    const updateResponse = await fetch(`${getBackendApiBaseUrl()}/auth/change-password`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        newPassword,
      }),
    });

    if (!updateResponse.ok) {
      setErrorMessage("更新密碼失敗，請稍後重試。");
      setLoading(false);
      return;
    }

    const meResponse = await fetch(`${getBackendApiBaseUrl()}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!meResponse.ok) {
      clearBackendToken();
      router.replace("/");
      setLoading(false);
      return;
    }
    const me = (await meResponse.json()) as {
      user?: { role: "admin" | "teacher" | "student" };
    };

    setSuccessMessage("密碼更新完成，將前往學生首頁。");
    setLoading(false);

    setTimeout(() => {
      if (me.user?.role === "admin") {
        router.push("/admin/dashboard");
      } else if (me.user?.role === "teacher") {
        router.push("/teacher/dashboard");
      } else {
        router.push("/student/dashboard");
      }
    }, 900);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-black text-slate-800">首次登入請修改密碼</h1>
        <p className="mt-2 text-sm text-slate-500">為了帳號安全，請先設定新的密碼。</p>

        <form className="mt-6 space-y-4" onSubmit={handleSave}>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="新密碼（至少 8 碼）"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="再次輸入新密碼"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />

          {errorMessage && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
              {errorMessage}
            </p>
          )}
          {successMessage && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              {successMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {loading ? "更新中..." : "更新密碼"}
          </button>
        </form>
      </div>
    </main>
  );
}
