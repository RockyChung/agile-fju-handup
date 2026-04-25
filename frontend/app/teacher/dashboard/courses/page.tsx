"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";
import { useRequireTeacher } from "@/hooks/use-require-teacher";

type TeacherCourse = {
  id: string;
  title: string;
  courseCode: string;
  isActive: boolean;
};

export default function TeacherCourseManagementPage() {
  const router = useRouter();
  const { loading, teacherId } = useRequireTeacher();
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeCourseId = useMemo(() => courses.find((course) => course.isActive)?.id ?? "", [courses]);

  const fetchCourses = useCallback(async () => {
    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入資訊已失效，請重新登入。");
      return;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      setErrorMessage("讀取課程清單失敗，請稍後再試。");
      return;
    }

    const json = (await response.json()) as { courses?: TeacherCourse[] };
    setCourses(json.courses ?? []);
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (!teacherId) {
      return;
    }
    const id = requestAnimationFrame(() => {
      void fetchCourses();
    });
    return () => cancelAnimationFrame(id);
  }, [fetchCourses, teacherId]);

  const handleCreateCourse = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedTitle = courseTitle.trim();
    const normalizedCode = courseCode.trim().toUpperCase();

    if (!teacherId) {
      setErrorMessage("老師登入資訊已失效，請重新登入。");
      return;
    }

    if (!normalizedTitle || !normalizedCode) {
      setErrorMessage("課程名稱與課程代碼不可為空。");
      return;
    }

    setSavingCourse(true);
    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入資訊已失效，請重新登入。");
      setSavingCourse(false);
      return;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: normalizedTitle,
        courseCode: normalizedCode,
        isActive: false,
      }),
    });

    if (!response.ok) {
      setErrorMessage("建立課程失敗，請確認課程代碼是否重複。");
      setSavingCourse(false);
      return;
    }

    await fetchCourses();
    setCourseTitle("");
    setCourseCode("");
    setSuccessMessage("課程建立完成。");
    setSavingCourse(false);
  };

  const handleStartCourse = async (courseId: string) => {
    if (!teacherId) {
      setErrorMessage("老師登入資訊已失效，請重新登入。");
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入資訊已失效，請重新登入。");
      return;
    }

    const coursesResponse = await fetch(`${getBackendApiBaseUrl()}/courses`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!coursesResponse.ok) {
      setErrorMessage("啟動課程失敗，請稍後再試。");
      return;
    }
    const coursesJson = (await coursesResponse.json()) as { courses?: TeacherCourse[] };
    const activeCourse = (coursesJson.courses ?? []).find((item) => item.isActive && item.id !== courseId);

    if (activeCourse) {
      const closeResponse = await fetch(`${getBackendApiBaseUrl()}/courses/${activeCourse.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: false }),
      });
      if (!closeResponse.ok) {
        setErrorMessage("啟動課程失敗，請稍後再試。");
        return;
      }
    }

    const activateResponse = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isActive: true }),
    });

    if (!activateResponse.ok) {
      setErrorMessage("啟動課程失敗，請稍後再試。");
      return;
    }

    await fetchCourses();
    router.push(`/teacher/course/${courseId}`);
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800">課程資料管理</h1>
            <p className="mt-1 text-sm text-slate-500">建立課程、管理課程狀態與啟動開課。</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/teacher/dashboard")}
            className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
          >
            回管理首頁
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

        <form onSubmit={handleCreateCourse} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">建立課堂資料</h2>
          <input
            type="text"
            value={courseTitle}
            onChange={(event) => setCourseTitle(event.target.value)}
            placeholder="課程名稱"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          <input
            type="text"
            value={courseCode}
            onChange={(event) => setCourseCode(event.target.value)}
            placeholder="課程代碼（例如 CS101）"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
          <button
            type="submit"
            disabled={savingCourse}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {savingCourse ? "建立中..." : "建立課堂"}
          </button>
        </form>

        <section className="space-y-3">
          {courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center font-semibold text-slate-500">
              尚未建立任何課程
            </div>
          ) : (
            courses.map((course) => (
              <article
                key={course.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5"
              >
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{course.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{course.courseCode}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      course.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {course.isActive ? "上課中" : "未啟動"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (course.isActive) {
                        router.push(`/teacher/course/${course.id}`);
                        return;
                      }
                      void handleStartCourse(course.id);
                    }}
                    disabled={Boolean(activeCourseId) && activeCourseId !== course.id && !course.isActive}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
                  >
                    {course.isActive ? "進入課程" : "啟動課程"}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
