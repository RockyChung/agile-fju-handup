"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseIsolated } from "@/lib/supabase";
import { useRequireTeacher } from "@/hooks/use-require-teacher";

type TeacherCourse = {
  id: string;
  title: string;
  course_code: string;
};

const EMAIL_DOMAIN = "@cloud.fju.edu.tw";

export default function TeacherStudentManagementPage() {
  const router = useRouter();
  const { loading, teacherId } = useRequireTeacher();
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [savingStudent, setSavingStudent] = useState(false);
  const [importing, setImporting] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [singleAssignCourseId, setSingleAssignCourseId] = useState<string>("");
  const [batchRows, setBatchRows] = useState("");
  const [batchAssignCourseId, setBatchAssignCourseId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchCourses = useCallback(async (teacherIdValue: string) => {
    const { data: courseData } = await supabase
      .from("courses")
      .select("id, title, course_code")
      .eq("teacher_id", teacherIdValue)
      .order("created_at", { ascending: false });

    setCourses(courseData ?? []);
  }, []);

  useEffect(() => {
    if (!teacherId) {
      return;
    }
    void fetchCourses(teacherId);
  }, [fetchCourses, teacherId]);

  const normalizeStudentId = (value: string) => value.trim().replace(/\s+/g, "");

  const createStudentRecord = async ({
    studentIdValue,
    studentNameValue,
    passwordValue,
    courseId,
  }: {
    studentIdValue: string;
    studentNameValue: string;
    passwordValue: string;
    courseId?: string;
  }) => {
    const normalizedStudentId = normalizeStudentId(studentIdValue);
    if (!normalizedStudentId) {
      throw new Error("學號不可為空。");
    }

    const email = `${normalizedStudentId}${EMAIL_DOMAIN}`;
    const { data: signUpData, error: signUpError } = await supabaseIsolated.auth.signUp({
      email,
      password: passwordValue,
    });

    if (signUpError) {
      if (signUpError.message === "User already registered") {
        throw new Error(`學號 ${normalizedStudentId} 已經存在。`);
      }
      throw new Error(`建立學號 ${normalizedStudentId} 失敗。`);
    }

    const user = signUpData.user;
    if (!user) {
      throw new Error(`學號 ${normalizedStudentId} 建立失敗（無法取得使用者）。`);
    }

    const { error: profileError } = await supabaseIsolated.from("profiles").upsert({
      id: user.id,
      name: studentNameValue.trim() || normalizedStudentId,
      role: "student",
      must_change_password: true,
      student_id: normalizedStudentId,
    });

    if (profileError) {
      throw new Error(`學號 ${normalizedStudentId} 建立失敗（profile 寫入失敗）。`);
    }

    if (courseId) {
      const { error: courseStudentError } = await supabase.from("course_students").upsert({
        course_id: courseId,
        student_id: user.id,
      });

      if (courseStudentError) {
        throw new Error(`學號 ${normalizedStudentId} 已建立，但加入課程失敗。`);
      }
    }
  };

  const handleCreateSingleStudent = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const defaultPassword = studentPassword.trim() || normalizeStudentId(studentId);
    if (defaultPassword.length < 8) {
      setErrorMessage("預設密碼至少需 8 碼。");
      return;
    }

    setSavingStudent(true);
    try {
      await createStudentRecord({
        studentIdValue: studentId,
        studentNameValue: studentName,
        passwordValue: defaultPassword,
        courseId: singleAssignCourseId || undefined,
      });
      setStudentId("");
      setStudentName("");
      setStudentPassword("");
      setSuccessMessage("學生建立完成，並已設定首次登入需改密碼。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "建立學生失敗。");
    } finally {
      setSavingStudent(false);
    }
  };

  const handleBatchImport = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const lines = batchRows
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setErrorMessage("請先貼上學生資料。");
      return;
    }

    const parsedRows = lines.map((line) => {
      const columns = line.split(/[,\t]/).map((item) => item.trim());
      return {
        studentIdValue: columns[0] || "",
        studentNameValue: columns[1] || "",
      };
    });

    setImporting(true);
    let successCount = 0;
    const failedRows: string[] = [];

    for (const row of parsedRows) {
      const passwordValue = normalizeStudentId(row.studentIdValue);
      if (passwordValue.length < 8) {
        failedRows.push(`${row.studentIdValue || "空白學號"}（密碼不足 8 碼）`);
        continue;
      }

      try {
        await createStudentRecord({
          studentIdValue: row.studentIdValue,
          studentNameValue: row.studentNameValue,
          passwordValue,
          courseId: batchAssignCourseId || undefined,
        });
        successCount += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "未知錯誤";
        failedRows.push(`${row.studentIdValue || "空白學號"}（${reason}）`);
      }
    }

    setImporting(false);

    if (failedRows.length === 0) {
      setBatchRows("");
      setSuccessMessage(`批次匯入完成，共 ${successCount} 位成功。`);
      return;
    }

    setErrorMessage(
      `成功 ${successCount} 位，失敗 ${failedRows.length} 位：${failedRows.slice(0, 3).join("、")}${
        failedRows.length > 3 ? " ..." : ""
      }`
    );
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800">學生資料管理</h1>
            <p className="mt-1 text-sm text-slate-500">單筆建立學生與整批匯入學生。</p>
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

        <section className="grid gap-4 lg:grid-cols-2">
          <form
            onSubmit={handleCreateSingleStudent}
            className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5"
          >
            <h2 className="text-lg font-bold text-slate-800">單筆建立學生</h2>
            <input
              type="text"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              placeholder="學號"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <input
              type="text"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="姓名"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <input
              type="text"
              value={studentPassword}
              onChange={(event) => setStudentPassword(event.target.value)}
              placeholder="預設密碼（留白=學號）"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={singleAssignCourseId}
              onChange={(event) => setSingleAssignCourseId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">不加入課程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={savingStudent}
              className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {savingStudent ? "建立中..." : "建立學生"}
            </button>
          </form>

          <form onSubmit={handleBatchImport} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-800">批次匯入學生</h2>
            <p className="text-xs text-slate-500">每行一筆：學號,姓名（預設密碼為學號）</p>
            <textarea
              value={batchRows}
              onChange={(event) => setBatchRows(event.target.value)}
              placeholder={`410012345,王小明\n410012346,李小華`}
              className="h-36 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <select
              value={batchAssignCourseId}
              onChange={(event) => setBatchAssignCourseId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">不加入課程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={importing}
              className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {importing ? "匯入中..." : "批次匯入"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
