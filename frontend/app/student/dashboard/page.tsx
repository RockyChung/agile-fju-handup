"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearBackendToken, getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

type StudentCourse = {
  id: string;
  title: string;
  courseCode: string;
  isActive: boolean;
};

export default function StudentDashboardPage() {
  const router = useRouter();
  const [name, setName] = useState("同學");
  const [studentUserId, setStudentUserId] = useState<string | null>(null);
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCourses = useCallback(async (token: string) => {
    const response = await fetch(`${getBackendApiBaseUrl()}/courses`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      return;
    }
    const json = (await response.json()) as { courses?: StudentCourse[] };
    setCourses(json.courses ?? []);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
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
        user?: {
          id: string;
          name: string | null;
          role: "admin" | "teacher" | "student";
          mustChangePassword: boolean;
        };
      };
      const profile = json.user;

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

      setName(profile.name || "同學");
      setStudentUserId(profile.id);
      await loadCourses(token);
      setLoading(false);
    };

    void bootstrap();
  }, [loadCourses, router]);

  useEffect(() => {
    if (!studentUserId) {
      return;
    }

    const poller = window.setInterval(() => {
      const token = getBackendToken();
      if (!token) {
        return;
      }
      void loadCourses(token);
    }, 2000);

    return () => {
      window.clearInterval(poller);
    };
  }, [loadCourses, studentUserId]);

  const handleLogout = async () => {
    clearBackendToken();
    router.push("/");
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800">{name}，你好</h1>
            <p className="mt-1 text-sm text-slate-500">請先選課，再進入已加入課程的舉手頁面。</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/student/courses")}
              className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-700 hover:bg-slate-100"
            >
              前往選課
            </button>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-rose-100 px-4 py-2 font-bold text-rose-600 hover:bg-rose-50"
            >
              登出
            </button>
          </div>
        </header>

        <section className="space-y-3">
          {courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center font-semibold text-slate-500">
              目前尚未加入任何課程
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
                <button
                  type="button"
                  disabled={!course.isActive}
                  onClick={() => router.push(`/handraise/${course.id}`)}
                  className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white disabled:bg-slate-300"
                >
                  {course.isActive ? "進入課程" : "尚未啟動"}
                </button>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
