"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

type QueueItem = {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  raisedAt: string;
};

type MeResponse = {
  user: {
    id: string;
    role: "admin" | "teacher" | "student";
    studentId: string;
    name: string | null;
    mustChangePassword: boolean;
  };
};

type QueueResponse = {
  course: {
    id: string;
    title: string;
    courseCode: string;
    isActive: boolean;
    teacherId: string;
  };
  queue: {
    id: string;
    createdAt: string;
    student: {
      id: string;
      studentId: string;
      name: string | null;
    };
  }[];
};

export default function HandRaisePage() {
  const router = useRouter();
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const [token, setToken] = useState<string | null>(null);
  const [studentUserId, setStudentUserId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState("課程");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const myOrder = useMemo(() => {
    if (!studentUserId) {
      return null;
    }
    const index = queue.findIndex((item) => item.studentId === studentUserId);
    return index >= 0 ? index + 1 : null;
  }, [queue, studentUserId]);

  const loadQueue = useCallback(
    async (authToken: string) => {
      if (!courseId) {
        return;
      }

      const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/hand-raises`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setErrorMessage("登入已失效，請重新登入。");
          router.replace("/");
          return;
        }
        if (response.status === 403) {
          setErrorMessage("你沒有這門課程的存取權限。");
          router.replace("/student/dashboard");
          return;
        }
        setErrorMessage("讀取舉手名單失敗。");
        return;
      }

      const json = (await response.json()) as QueueResponse;
      setCourseTitle(json.course.title || "課程");
      setQueue(
        json.queue.map((row) => ({
          id: row.id,
          studentId: row.student.id,
          studentNo: row.student.studentId,
          studentName: row.student.name ?? "未命名同學",
          raisedAt: row.createdAt,
        })),
      );
    },
    [courseId, router],
  );

  useEffect(() => {
    const bootstrap = async () => {
      if (!courseId) {
        router.replace("/student/dashboard");
        return;
      }

      const saved = getBackendToken();
      if (!saved) {
        setErrorMessage("尚未取得後端登入憑證，請重新登入。");
        router.replace("/");
        return;
      }
      setToken(saved);

      const meResponse = await fetch(`${getBackendApiBaseUrl()}/auth/me`, {
        headers: {
          Authorization: `Bearer ${saved}`,
        },
      });

      if (!meResponse.ok) {
        setErrorMessage("登入狀態已失效，請重新登入。");
        router.replace("/");
        return;
      }

      const me = (await meResponse.json()) as MeResponse;
      if (me.user.role !== "student") {
        if (me.user.role === "admin") {
          router.replace("/admin/dashboard");
        } else {
          router.replace("/teacher/dashboard");
        }
        return;
      }

      if (me.user.mustChangePassword) {
        router.replace("/change-password");
        return;
      }

      setStudentUserId(me.user.id);
      await loadQueue(saved);
      setLoading(false);
    };

    void bootstrap();
  }, [courseId, loadQueue, router]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const timer = setInterval(() => {
      void loadQueue(token);
    }, 2000);

    return () => clearInterval(timer);
  }, [loadQueue, token]);

  const handleRaiseHand = async () => {
    if (!studentUserId || !courseId || !token) {
      return;
    }

    setRaising(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const alreadyRaised = queue.some((item) => item.studentId === studentUserId);
    if (alreadyRaised) {
      setErrorMessage("你已在舉手名單中。");
      setRaising(false);
      return;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/hand-raises`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setErrorMessage("舉手失敗，請稍後重試。");
      setRaising(false);
      return;
    }

    setSuccessMessage("舉手成功，老師已收到。");
    await loadQueue(token);
    setRaising(false);
  };

  const handleCancelRaise = async () => {
    if (!studentUserId || !courseId || !token) {
      return;
    }

    setCancelling(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/hand-raises/self`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setErrorMessage("取消舉手失敗，請稍後重試。");
      setCancelling(false);
      return;
    }

    setSuccessMessage("已取消舉手。");
    await loadQueue(token);
    setCancelling(false);
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border border-slate-100 bg-white p-6">
          <h1 className="text-2xl font-black text-slate-800">{courseTitle} - 舉手頁面</h1>
          <p className="mt-1 text-sm text-slate-500">請按「我要舉手」，系統會依照先後順序排隊。</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRaiseHand}
              disabled={raising || Boolean(myOrder)}
              className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {raising ? "送出中..." : myOrder ? "已舉手" : "我要舉手"}
            </button>
            <button
              type="button"
              onClick={handleCancelRaise}
              disabled={cancelling || !myOrder}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {cancelling ? "取消中..." : "取消舉手"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/student/dashboard")}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
            >
              回課程清單
            </button>
          </div>
          {myOrder && <p className="mt-3 text-sm font-bold text-indigo-600">你目前排在第 {myOrder} 位。</p>}
          {errorMessage && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </p>
          )}
          {successMessage && (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {successMessage}
            </p>
          )}
        </header>

        <section className="space-y-3">
          {queue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center font-semibold text-slate-500">
              目前尚無舉手紀錄
            </div>
          ) : (
            queue.map((item, index) => (
              <article
                key={item.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5"
              >
                <div>
                  <p className="text-sm font-bold text-indigo-600">第 {index + 1} 位</p>
                  <h2 className="text-lg font-bold text-slate-800">{item.studentName}</h2>
                  <p className="mt-1 text-sm text-slate-500">{item.studentNo}</p>
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  {new Date(item.raisedAt).toLocaleTimeString("zh-TW", { hour12: false })}
                </p>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
