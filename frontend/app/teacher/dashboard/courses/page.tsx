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
  reportOrder: string[];
};

type CourseGroupRow = {
  groupName: string;
  studentCount: number;
};

type CourseManageMode = "create" | "reportOrder";

export default function TeacherCourseManagementPage() {
  const router = useRouter();
  const { loading, teacherId } = useRequireTeacher();
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [savingCourse, setSavingCourse] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [selectedOrderCourseId, setSelectedOrderCourseId] = useState("");
  const [orderingGroups, setOrderingGroups] = useState<CourseGroupRow[]>([]);
  const [loadingOrderGroups, setLoadingOrderGroups] = useState(false);
  const [savingReportOrder, setSavingReportOrder] = useState(false);
  const [manageMode, setManageMode] = useState<CourseManageMode>("create");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeCourseId = useMemo(() => courses.find((course) => course.isActive)?.id ?? "", [courses]);

  const fetchCourseGroups = useCallback(async (courseId: string) => {
    if (!courseId) {
      setOrderingGroups([]);
      return;
    }

    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入資訊已失效，請重新登入。");
      return;
    }

    setLoadingOrderGroups(true);
    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/groups`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setErrorMessage("讀取課程組別失敗，請稍後再試。");
      setLoadingOrderGroups(false);
      return;
    }

    const json = (await response.json()) as {
      reportOrder?: string[];
      groups?: CourseGroupRow[];
    };

    const groups = json.groups ?? [];
    const reportOrder = json.reportOrder ?? [];
    const groupMap = new Map(groups.map((group) => [group.groupName, group]));
    const sortedGroups: CourseGroupRow[] = [];
    for (const groupName of reportOrder) {
      const target = groupMap.get(groupName);
      if (target) {
        sortedGroups.push(target);
        groupMap.delete(groupName);
      }
    }
    sortedGroups.push(...Array.from(groupMap.values()).sort((a, b) => a.groupName.localeCompare(b.groupName, "zh-Hant")));

    setOrderingGroups(sortedGroups);
    setLoadingOrderGroups(false);
    setErrorMessage(null);
  }, []);

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
    const nextCourses = json.courses ?? [];
    setCourses(nextCourses);
    setSelectedOrderCourseId((prev) => {
      const nextCourseId = prev || nextCourses[0]?.id || "";
      if (nextCourseId) {
        void fetchCourseGroups(nextCourseId);
      }
      return nextCourseId;
    });
    setErrorMessage(null);
  }, [fetchCourseGroups]);

  useEffect(() => {
    if (!teacherId) {
      return;
    }
    const id = requestAnimationFrame(() => {
      void fetchCourses();
    });
    return () => cancelAnimationFrame(id);
  }, [fetchCourses, teacherId]);

  const moveGroup = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= orderingGroups.length) {
      return;
    }

    setOrderingGroups((prev) => {
      const next = [...prev];
      const [target] = next.splice(index, 1);
      next.splice(nextIndex, 0, target);
      return next;
    });
  };

  const handleSaveReportOrder = async () => {
    if (!selectedOrderCourseId) {
      setErrorMessage("請先選擇課程。");
      return;
    }
    if (orderingGroups.length === 0) {
      setErrorMessage("該課程尚無組別可設定報告順序。");
      return;
    }

    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入資訊已失效，請重新登入。");
      return;
    }

    setSavingReportOrder(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${selectedOrderCourseId}/report-order`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reportOrder: orderingGroups.map((group) => group.groupName),
      }),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      setErrorMessage(err.message || "儲存報告順序失敗。");
      setSavingReportOrder(false);
      return;
    }

    await fetchCourses();
    setSavingReportOrder(false);
    setSuccessMessage("組別報告順序已儲存。");
  };

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

        <section className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setManageMode("create")}
              className={`rounded-xl px-4 py-2 font-bold ${
                manageMode === "create"
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              建立課堂資料
            </button>
            <button
              type="button"
              onClick={() => setManageMode("reportOrder")}
              className={`rounded-xl px-4 py-2 font-bold ${
                manageMode === "reportOrder"
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              組別報告順序管理
            </button>
          </div>

          {manageMode === "create" ? (
            <>
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
                        {course.isActive && course.reportOrder.length > 0 && (
                          <p className="mt-1 text-xs font-semibold text-indigo-600">
                            報告順序：{course.reportOrder.join(" → ")}
                          </p>
                        )}
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
            </>
          ) : (
            <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5">
              <h2 className="text-lg font-bold text-slate-800">組別報告順序管理</h2>
              <label className="block text-sm font-semibold text-slate-700">
                選擇課程
                <select
                  value={selectedOrderCourseId}
                  onChange={(event) => {
                    const courseId = event.target.value;
                    setSelectedOrderCourseId(courseId);
                    void fetchCourseGroups(courseId);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={courses.length === 0 || loadingOrderGroups}
                >
                  {courses.length === 0 ? (
                    <option value="">（尚無課程可選）</option>
                  ) : (
                    courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.courseCode} {course.title}
                      </option>
                    ))
                  )}
                </select>
              </label>

              {loadingOrderGroups ? (
                <p className="text-sm font-semibold text-slate-500">讀取組別中...</p>
              ) : orderingGroups.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  該課程目前沒有已分組的學生，請先到學生資料管理完成分組。
                </p>
              ) : (
                <div className="space-y-2">
                  {orderingGroups.map((group, index) => (
                    <div
                      key={group.groupName}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-bold text-indigo-600">第 {index + 1} 順位</p>
                        <p className="font-semibold text-slate-800">{group.groupName}</p>
                        <p className="text-xs text-slate-500">{group.studentCount} 人</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => moveGroup(index, -1)}
                          disabled={index === 0}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 disabled:opacity-40"
                        >
                          上移
                        </button>
                        <button
                          type="button"
                          onClick={() => moveGroup(index, 1)}
                          disabled={index === orderingGroups.length - 1}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700 disabled:opacity-40"
                        >
                          下移
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleSaveReportOrder()}
                disabled={savingReportOrder || orderingGroups.length === 0 || !selectedOrderCourseId}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
              >
                {savingReportOrder ? "儲存中..." : "儲存報告順序"}
              </button>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
