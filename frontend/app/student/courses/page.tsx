"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearBackendToken, getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

type CourseRow = {
  id: string;
  title: string;
  courseCode: string;
  isActive: boolean;
};

export default function StudentCoursesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingCourseId, setSavingCourseId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const enrolledSet = useMemo(() => new Set(enrolledIds), [enrolledIds]);

  const loadData = useCallback(async (token: string) => {
    const response = await fetch(`${getBackendApiBaseUrl()}/courses`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      setErrorMessage("讀取課程清單失敗。");
      return;
    }

    const json = (await response.json()) as { courses?: CourseRow[] };
    const allCourses = json.courses ?? [];
    setCourses(allCourses);
    setEnrolledIds(allCourses.map((row) => row.id));
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const token = getBackendToken();
      if (!token) {
        router.replace("/");
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
        return;
      }
      const me = (await meResponse.json()) as {
        user?: { id: string; role: "admin" | "teacher" | "student"; mustChangePassword: boolean };
      };
      const profile = me.user;
      if (!profile) {
        clearBackendToken();
        router.replace("/");
        return;
      }

      if (profile.role === "admin") {
        router.replace("/admin/dashboard");
        return;
      }

      if (profile.role === "teacher") {
        router.replace("/teacher/dashboard");
        return;
      }

      if (profile.mustChangePassword) {
        router.replace("/change-password");
        return;
      }

      setStudentId(profile.id);
      await loadData(token);
      setLoading(false);
    };

    void bootstrap();
  }, [loadData, router]);

  const handleJoinCourse = async (courseId: string) => {
    if (!studentId) {
      setErrorMessage("學生登入資訊已失效，請重新登入。");
      return;
    }

    setSavingCourseId(courseId);
    setErrorMessage(null);
    setSuccessMessage(null);

    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入資訊已失效，請重新登入。");
      setSavingCourseId(null);
      return;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/students`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      setErrorMessage("加入課程失敗，請稍後再試。");
      setSavingCourseId(null);
      return;
    }

    setEnrolledIds((prev) => Array.from(new Set([...prev, courseId])));
    setSuccessMessage("加入課程成功。");
    setSavingCourseId(null);
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800">學生選課</h1>
            <p className="mt-1 text-sm text-slate-500">選擇要加入的課程，加入後可回首頁進入舉手頁。</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/student/dashboard")}
            className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
          >
            回學生首頁
          </button>
        </header>

        {(errorMessage || successMessage) && (
          <section className="space-y-2">
            {errorMessage && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {errorMessage}
              </p>
            )}
            {successMessage && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {successMessage}
              </p>
            )}
          </section>
        )}

        <section className="space-y-3">
          {courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center font-semibold text-slate-500">
              目前沒有可選課程
            </div>
          ) : (
            courses.map((course) => {
              const joined = enrolledSet.has(course.id);
              return (
                <article
                  key={course.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5"
                >
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">{course.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{course.courseCode}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      {course.isActive ? "老師已開課" : "老師尚未開課"}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={joined || savingCourseId === course.id}
                    onClick={() => void handleJoinCourse(course.id)}
                    className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white disabled:bg-slate-300"
                  >
                    {savingCourseId === course.id ? "加入中..." : joined ? "已加入" : "加入課程"}
                  </button>
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
