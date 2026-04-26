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

type LoadQueueOptions = {
  showRefreshing?: boolean;
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
    reportOrder: string[];
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

export default function TeacherCoursePage() {
  const router = useRouter();
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState("課程");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reportOrder, setReportOrder] = useState<string[]>([]);

  const queueCountText = useMemo(() => `目前共 ${queue.length} 位舉手`, [queue.length]);

  const loadQueue = useCallback(
    async (authToken: string, options?: LoadQueueOptions) => {
      if (!courseId) {
        return;
      }

      const showRefreshing = options?.showRefreshing ?? false;
      if (showRefreshing) {
        setRefreshing(true);
      }
      setErrorMessage(null);

      try {
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
            router.replace("/teacher/dashboard");
            return;
          }

          setErrorMessage("讀取舉手名單失敗。");
          return;
        }

        const json = (await response.json()) as QueueResponse;
        setCourseTitle(json.course.title || "課程");
        setReportOrder(json.course.reportOrder ?? []);
        setQueue(
          json.queue.map((row) => ({
            id: row.id,
            studentId: row.student.id,
            studentNo: row.student.studentId,
            studentName: row.student.name ?? "未命名同學",
            raisedAt: row.createdAt,
          })),
        );
      } catch {
        if (!showRefreshing) {
          // Polling failure is transient (e.g. page leaving), avoid runtime crash.
          return;
        }
        setErrorMessage("無法連線到後端服務，請稍後再試。");
      } finally {
        if (showRefreshing) {
          setRefreshing(false);
        }
      }
    },
    [courseId, router],
  );

  useEffect(() => {
    const bootstrap = async () => {
      if (!courseId) {
        router.replace("/teacher/dashboard");
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
      if (me.user.role !== "teacher") {
        if (me.user.role === "admin") {
          router.replace("/admin/dashboard");
        } else {
          router.replace("/student/dashboard");
        }
        return;
      }

      setTeacherId(me.user.id);
      await loadQueue(saved);
      setLoading(false);
    };

    void bootstrap();
  }, [courseId, loadQueue, router]);

  useEffect(() => {
    if (!courseId || !token) {
      return;
    }

    const poller = window.setInterval(() => {
      void loadQueue(token);
    }, 1000);

    return () => {
      window.clearInterval(poller);
    };
  }, [courseId, loadQueue, token]);

  const handleClearQueue = async () => {
    if (!token || !courseId) {
      return;
    }

    setErrorMessage(null);

    for (const item of queue) {
      const response = await fetch(
        `${getBackendApiBaseUrl()}/courses/${courseId}/hand-raises/${item.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok && response.status !== 404) {
        setErrorMessage("清空舉手名單失敗，請稍後重試。");
        return;
      }
    }

    await loadQueue(token);
  };

  const handleEndCourse = async () => {
    if (!teacherId || !token || !courseId) {
      setErrorMessage("老師登入資訊已失效，請重新登入。");
      return;
    }

    setErrorMessage(null);

    try {
      const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: false }),
      });

      if (!response.ok) {
        setErrorMessage("下課失敗，請稍後再試。");
        return;
      }

      router.push("/teacher/dashboard");
    } catch {
      setErrorMessage("無法連線到後端服務，請確認 backend 是否啟動。");
    }
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-2xl border border-slate-100 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-slate-800">{courseTitle} - 課程頁面</h1>
              <p className="mt-1 text-sm text-slate-500">學生舉手後會依照先後順序顯示在下方名單。</p>
              <p className="mt-1 text-sm font-semibold text-indigo-600">
                報告順序：{reportOrder.length > 0 ? reportOrder.join(" → ") : "尚未設定"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => token && void loadQueue(token, { showRefreshing: true })}
                className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
              >
                {refreshing ? "更新中..." : "重新整理"}
              </button>
              <button
                type="button"
                onClick={handleClearQueue}
                className="rounded-xl border border-amber-200 px-4 py-2 font-semibold text-amber-700 hover:bg-amber-50"
              >
                清空舉手
              </button>
              <button
                type="button"
                onClick={handleEndCourse}
                className="rounded-xl bg-rose-600 px-4 py-2 font-bold text-white hover:bg-rose-700"
              >
                下課
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold text-indigo-600">{queueCountText}</p>
          {errorMessage && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </p>
          )}
        </header>

        <section className="space-y-3">
          {queue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center font-semibold text-slate-500">
              目前還沒有學生舉手
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
