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

export default function HandRaisePage() {
  const router = useRouter();
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

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

  const loadQueue = useCallback(async () => {
    if (!courseId) {
      return;
    }

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
      const row = profile as ProfileRow;
      profileMap.set(row.id, row);
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
  }, [courseId]);

  useEffect(() => {
    const bootstrap = async () => {
      if (!courseId) {
        router.replace("/student/dashboard");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, must_change_password")
        .eq("id", user.id)
        .single();

      if (!profile) {
        router.replace("/");
        return;
      }

      if (profile.role === "teacher") {
        router.replace("/teacher/dashboard");
        return;
      }

      if (profile.must_change_password) {
        router.replace("/change-password");
        return;
      }

      const { data: joinedCourse } = await supabase
        .from("course_students")
        .select("id")
        .eq("course_id", courseId)
        .eq("student_id", user.id)
        .single();

      if (!joinedCourse) {
        router.replace("/student/dashboard");
        return;
      }

      const { data: course } = await supabase
        .from("courses")
        .select("title, is_active")
        .eq("id", courseId)
        .single();

      if (!course || !course.is_active) {
        router.replace("/student/dashboard");
        return;
      }

      setStudentUserId(user.id);
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
      .channel(`student-handraise-${courseId}`)
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

  const handleRaiseHand = async () => {
    if (!studentUserId || !courseId) {
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

    const { error } = await supabase.from("hand_raises").insert({
      course_id: courseId,
      student_id: studentUserId,
    });

    if (error) {
      setErrorMessage("舉手失敗，請稍後重試。");
      setRaising(false);
      return;
    }

    setSuccessMessage("舉手成功，老師已收到。");
    await loadQueue();
    setRaising(false);
  };

  const handleCancelRaise = async () => {
    if (!studentUserId || !courseId) {
      return;
    }

    setCancelling(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { error } = await supabase
      .from("hand_raises")
      .delete()
      .eq("course_id", courseId)
      .eq("student_id", studentUserId);

    if (error) {
      setErrorMessage("取消舉手失敗，請稍後重試。");
      setCancelling(false);
      return;
    }

    setSuccessMessage("已取消舉手。");
    await loadQueue();
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
