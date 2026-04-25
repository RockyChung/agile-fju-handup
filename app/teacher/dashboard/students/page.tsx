"use client";

import { FormEvent, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fjuEmailFromStudentId } from "@/lib/fju-auth-email";
import { supabaseIsolated } from "@/lib/supabase"; // 關鍵：改回使用隔離的客戶端
import { useRequireTeacher } from "@/hooks/use-require-teacher";

type StudentManageMode = "single" | "batch";

interface Course {
  id: string;
  title: string;
  course_code: string;
}

export default function TeacherStudentManagementPage() {
  const router = useRouter();
  const { loading, teacherId } = useRequireTeacher();
  
  const [savingStudent, setSavingStudent] = useState(false);
  const [importing, setImporting] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  const [batchRows, setBatchRows] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [manageMode, setManageMode] = useState<StudentManageMode>("single");

  // 使用 supabaseIsolated 獲取課程資訊，確保一致性
  const fetchCourses = useCallback(async (tId: string) => {
    setLoadingCourses(true);
    const { data, error } = await supabaseIsolated
      .from("courses")
      .select("*")
      .eq("teacher_id", tId);
    
    if (error) {
      console.error("載入課程失敗:", error.message);
    } else {
      const normalized = (data ?? []).map((row: any) => ({
        id: String(row.id),
        title: String(row.title || "未命名課程"),
        course_code: String(row.course_code || "未設定代碼"),
      }));
      setCourses(normalized);
    }
    setLoadingCourses(false);
  }, []);

  useEffect(() => {
    if (!teacherId) return;
    const frameId = requestAnimationFrame(() => {
      void fetchCourses(teacherId);
    });
    return () => cancelAnimationFrame(frameId);
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

    const email = fjuEmailFromStudentId(normalizedStudentId);
    
    // 使用 supabaseIsolated 建立帳號，這不會影響老師目前的登入狀態
    const { data: signUpData, error: signUpError } = await supabaseIsolated.auth.signUp({
      email,
      password: passwordValue,
    });

    if (signUpError) {
      if (signUpError.message === "User already registered") {
        throw new Error(`學號 ${normalizedStudentId} 已經存在。`);
      }
      throw new Error(`建立學號 ${normalizedStudentId} 失敗：${signUpError.message}`);
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
      const { error: mappingError } = await supabaseIsolated.from("course_students").insert({
        course_id: courseId,
        student_id: user.id,
      });

      if (mappingError) {
        throw new Error(`帳號建立成功，但加入課程失敗（${mappingError.message}）。`);
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
        courseId: selectedCourseId || undefined,
      });
      setStudentId("");
      setStudentName("");
      setStudentPassword("");
      setSelectedCourseId(""); 
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
      const columns = line.split(/[\s,\t]+/).map((item) => item.trim()).filter(Boolean);
      return {
        studentIdValue: columns[0] || "",
        studentNameValue: columns.slice(1).join(" "),
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
        <header className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-black text-slate-800">學生資料管理</h1>
            <p className="mt-1 text-sm text-slate-500">管理學籍資料與課堂分組配置。</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push("/teacher/dashboard/student-group")}
              className="rounded-xl bg-indigo-50 px-4 py-2 font-bold text-indigo-600 hover:bg-indigo-100 transition-colors border border-indigo-100 flex items-center gap-2"
            >
              <span>👥</span> 學生分組
            </button>
            <button
              type="button"
              onClick={() => router.push("/teacher/dashboard")}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              回管理首頁
            </button>
          </div>
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
              onClick={() => setManageMode("single")}
              className={`rounded-xl px-4 py-2 font-bold ${
                manageMode === "single"
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              單筆建立學生
            </button>
            <button
              type="button"
              onClick={() => setManageMode("batch")}
              className={`rounded-xl px-4 py-2 font-bold ${
                manageMode === "batch"
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              批次匯入學生
            </button>
          </div>

          {manageMode === "single" ? (
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
              
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 ml-1">選擇加入課程 (選填)</p>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">-- 僅建立帳號，暫不加入課堂 --</option>
                  {loadingCourses ? (
                    <option disabled>讀取課程中...</option>
                  ) : courses.map((c) => (
                    <option key={c.id} value={c.id}>[{c.course_code}] {c.title}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={savingStudent}
                className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300 transition-colors"
              >
                {savingStudent ? "建立中..." : "建立學生"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleBatchImport} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5">
              <h2 className="text-lg font-bold text-slate-800">批次匯入學生</h2>
              <p className="text-xs text-slate-500">每行一筆：學號 姓名（預設密碼為學號）</p>
              <textarea
                value={batchRows}
                onChange={(event) => setBatchRows(event.target.value)}
                placeholder={`410012345 王小明\n410012346 李小華`}
                className="h-36 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                required
              />
              <button
                type="submit"
                disabled={importing}
                className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300 transition-colors"
              >
                {importing ? "匯入中..." : "批次匯入"}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}