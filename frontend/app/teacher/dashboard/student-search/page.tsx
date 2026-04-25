"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";
import { useRequireTeacher } from "@/hooks/use-require-teacher";

type CourseOption = {
  id: string;
  title: string;
  courseCode: string;
};

type StudentSearchRow = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  studentId: string;
  studentName: string | null;
  groupName: string | null;
  isLeader: boolean;
};

export default function TeacherStudentSearchPage() {
  const router = useRouter();
  const { loading, teacherId } = useRequireTeacher();
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [filterStudentId, setFilterStudentId] = useState("");
  const [filterStudentName, setFilterStudentName] = useState("");
  const [filterCourseId, setFilterCourseId] = useState("");
  const [rows, setRows] = useState<StudentSearchRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadCourses = async () => {
      if (!teacherId) {
        return;
      }
      setLoadingCourses(true);

      const token = getBackendToken();
      if (!token) {
        setErrorMessage("登入資訊已失效，請重新登入。");
        setLoadingCourses(false);
        return;
      }

      const response = await fetch(`${getBackendApiBaseUrl()}/courses`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        setErrorMessage("讀取課程清單失敗。");
        setLoadingCourses(false);
        return;
      }

      const json = (await response.json()) as { courses?: CourseOption[] };
      setCourses(json.courses ?? []);
      setLoadingCourses(false);
    };

    void loadCourses();
  }, [teacherId]);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setLoadingRows(true);

    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入資訊已失效，請重新登入。");
      setLoadingRows(false);
      return;
    }

    const query = new URLSearchParams();
    if (filterStudentId.trim()) {
      query.set("studentId", filterStudentId.trim());
    }
    if (filterStudentName.trim()) {
      query.set("name", filterStudentName.trim());
    }
    if (filterCourseId) {
      query.set("courseId", filterCourseId);
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/teacher/students?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setErrorMessage("查詢學生失敗，請稍後再試。");
      setLoadingRows(false);
      return;
    }

    const json = (await response.json()) as { students?: StudentSearchRow[] };
    setRows(json.students ?? []);
    setLoadingRows(false);
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800">學生查詢</h1>
            <p className="mt-1 text-sm text-slate-500">可用學號、姓名、課程交叉篩選。</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/teacher/dashboard")}
            className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
          >
            回管理首頁
          </button>
        </header>

        {errorMessage && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {errorMessage}
          </p>
        )}

        <form onSubmit={handleSearch} className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-5 md:grid-cols-4">
          <input
            type="text"
            value={filterStudentId}
            onChange={(event) => setFilterStudentId(event.target.value)}
            placeholder="學號"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="text"
            value={filterStudentName}
            onChange={(event) => setFilterStudentName(event.target.value)}
            placeholder="姓名"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={filterCourseId}
            onChange={(event) => setFilterCourseId(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
            disabled={loadingCourses}
          >
            <option value="">全部課程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.courseCode} {course.title}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loadingRows}
            className="rounded-xl bg-indigo-600 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
          >
            {loadingRows ? "查詢中..." : "查詢"}
          </button>
        </form>

        <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-4 py-3 font-bold">學號</th>
                <th className="px-4 py-3 font-bold">姓名</th>
                <th className="px-4 py-3 font-bold">課程</th>
                <th className="px-4 py-3 font-bold">組別</th>
                <th className="px-4 py-3 font-bold">組長</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                    尚無資料，請輸入條件後查詢
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${row.courseId}-${row.studentId}-${index}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.studentId}</td>
                    <td className="px-4 py-3 text-slate-700">{row.studentName || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.courseCode} {row.courseTitle}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.groupName || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{row.isLeader ? "是" : "否"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
