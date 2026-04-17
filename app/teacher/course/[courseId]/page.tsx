"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type HandRaiseRow = {
  id: string;
  student_id: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  name: string | null;
  student_id: string | null;
};

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

export default function TeacherCoursePage() {
  const router = useRouter();
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState("課程");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const queueCountText = useMemo(() => `目前共 ${queue.length} 位舉手`, [queue.length]);

  const loadQueue = useCallback(async (options?: LoadQueueOptions) => {
    if (!courseId) {
      return;
    }

    const showRefreshing = options?.showRefreshing ?? false;
    if (showRefreshing) {
      setRefreshing(true);
    }
    setErrorMessage(null);

    try {
      const { data: handRows, error: handError } = await supabase
        .from("hand_raises")
        .select("id, student_id, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: true });

      if (handError) {
        setErrorMessage("讀取舉手名單失敗。");
        return;
      }

      const rows = (handRows ?? []) as HandRaiseRow[];
      if (rows.length === 0) {
        setQueue([]);
        return;
      }

      const studentIds = Array.from(new Set(rows.map((row) => row.student_id)));
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, name, student_id")
        .in("id", studentIds);

      const profileMap = new Map<string, ProfileRow>();
      (profileRows ?? []).forEach((profile) => {
        const item = profile as ProfileRow;
        profileMap.set(item.id, item);
      });

      const queueRows = rows.map((row) => {
        const profile = profileMap.get(row.student_id);
        return {
          id: row.id,
          studentId: row.student_id,
          studentNo: profile?.student_id ?? "未知學號",
          studentName: profile?.name ?? "未命名同學",
          raisedAt: row.created_at,
        };
      });

      setQueue(queueRows);
    } finally {
      if (showRefreshing) {
        setRefreshing(false);
      }
    }
  }, [courseId]);

  useEffect(() => {
    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "teacher") {
        router.replace("/");
        return;
      }

      const { data: course } = await supabase
        .from("courses")
        .select("id, title, teacher_id, is_active")
        .eq("id", courseId)
        .single();

      if (!course || course.teacher_id !== user.id) {
        router.replace("/teacher/dashboard");
        return;
      }

      setTeacherId(user.id);
      setCourseTitle(course.title);
      await loadQueue();
      setLoading(false);
    };

    void bootstrap();
  }, [courseId, loadQueue, router]);

  useEffect(() => {
    if (!courseId) {
      return;
    }

    const channel = supabase
      .channel(`teacher-course-${courseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hand_raises", filter: `course_id=eq.${courseId}` },
        () => {
          void loadQueue();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [courseId, loadQueue]);

  useEffect(() => {
    if (!courseId) {
      return;
    }

    // Fallback polling ensures queue still auto-refreshes
    // if Realtime events are delayed or unavailable.
    const poller = window.setInterval(() => {
      void loadQueue();
    }, 1000);

    return () => {
      window.clearInterval(poller);
    };
  }, [courseId, loadQueue]);

  const handleClearQueue = async () => {
    setErrorMessage(null);
    const { error } = await supabase.from("hand_raises").delete().eq("course_id", courseId);

    if (error) {
      setErrorMessage("清空舉手名單失敗，請稍後重試。");
      return;
    }

    await loadQueue();
  };

  const handleEndCourse = async () => {
    if (!teacherId) {
      setErrorMessage("老師登入資訊已失效，請重新登入。");
      return;
    }

    setErrorMessage(null);
    const { error } = await supabase
      .from("courses")
      .update({ is_active: false })
      .eq("id", courseId)
      .eq("teacher_id", teacherId);

    if (error) {
      setErrorMessage("下課失敗，請稍後再試。");
      return;
    }

    router.push("/teacher/dashboard");
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
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadQueue({ showRefreshing: true })}
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
