"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";
import { useRequireTeacher } from "@/hooks/use-require-teacher";

type StudentManageMode = "single" | "batch";

type CourseOption = {
  id: string;
  title: string;
  courseCode: string;
};

type BatchStudentRow = {
  studentIdValue: string;
  studentNameValue: string;
  groupNameValue: string | null;
  isLeaderValue: boolean;
};

type CreatedStudent = {
  id: string;
  studentId: string;
};

export default function TeacherStudentManagementPage() {
  const router = useRouter();
  const { loading, teacherId } = useRequireTeacher();
  const [savingStudent, setSavingStudent] = useState(false);
  const [importing, setImporting] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [singleGroupName, setSingleGroupName] = useState("");
  const [singleIsLeader, setSingleIsLeader] = useState(false);
  const [singleCourseId, setSingleCourseId] = useState("");
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchPreviewCount, setBatchPreviewCount] = useState(0);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [batchCourseId, setBatchCourseId] = useState("");
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [manageMode, setManageMode] = useState<StudentManageMode>("single");

  const normalizeStudentId = (value: string) => value.trim().replace(/\s+/g, "");

  const selectedBatchCourseLabel = useMemo(() => {
    const target = courses.find((item) => item.id === batchCourseId);
    if (!target) {
      return "";
    }
    return `${target.courseCode} ${target.title}`;
  }, [batchCourseId, courses]);

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
        setErrorMessage("讀取課程清單失敗，請稍後再試。");
        setLoadingCourses(false);
        return;
      }

      const json = (await response.json()) as { courses?: CourseOption[] };
      const rows = json.courses ?? [];
      setCourses(rows);
      setSingleCourseId((prev) => prev || rows[0]?.id || "");
      setBatchCourseId((prev) => prev || rows[0]?.id || "");
      setLoadingCourses(false);
    };

    void loadCourses();
  }, [teacherId]);

  const createStudentRecord = async ({
    studentIdValue,
    studentNameValue,
    passwordValue,
    courseId,
    groupName,
    isLeader,
  }: {
    studentIdValue: string;
    studentNameValue: string;
    passwordValue: string;
    courseId?: string;
    groupName?: string | null;
    isLeader?: boolean;
  }): Promise<CreatedStudent> => {
    const normalizedStudentId = normalizeStudentId(studentIdValue);
    if (!normalizedStudentId) {
      throw new Error("學號不可為空。");
    }

    const token = getBackendToken();
    if (!token) {
      throw new Error("登入資訊已失效，請重新登入。");
    }

    const createResponse = await fetch(`${getBackendApiBaseUrl()}/users/students`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        studentId: normalizedStudentId,
        name: studentNameValue.trim() || normalizedStudentId,
        password: passwordValue,
        mustChangePassword: true,
        courseId: courseId || undefined,
        groupName: groupName?.trim() || null,
        isLeader: isLeader ?? false,
      }),
    });

    const createPayload = (await createResponse.json().catch(() => ({}))) as {
      message?: string;
      user?: CreatedStudent;
    };
    if (!createResponse.ok || !createPayload.user) {
      throw new Error(createPayload.message || `建立學號 ${normalizedStudentId} 失敗。`);
    }

    return createPayload.user;
  };

  const parseExcelFile = async (file: File): Promise<BatchStudentRow[]> => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("Excel 檔案沒有工作表。");
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    const parsed: BatchStudentRow[] = [];
    let currentGroupName: string | null = null;

    for (const row of rows) {
      const studentIdRaw = String(row[0] ?? "").trim();
      const studentNameRaw = String(row[1] ?? "").trim();
      const leaderMarkRaw = String(row[5] ?? "").trim();

      // 分組標題列，例如：第一組(L)
      if (!/^\d{8,}$/.test(studentIdRaw) && studentIdRaw) {
        currentGroupName = studentIdRaw;
        continue;
      }

      // 只抓像學號的列，忽略標題/分組列
      if (!/^\d{8,}$/.test(studentIdRaw)) {
        continue;
      }

      parsed.push({
        studentIdValue: studentIdRaw,
        studentNameValue: studentNameRaw || studentIdRaw,
        groupNameValue: currentGroupName,
        isLeaderValue: Boolean(leaderMarkRaw),
      });
    }

    return parsed;
  };

  const handleDownloadTemplate = () => {
    const templateRows = [
      ["帳號", "姓名", "英文姓名", "系級", "成員數", "組長"],
      ["第一組(L)", "", "", "", "2", ""],
      ["413155020", "王小明", "Wang Xiao Ming", "(研)資訊管理學系碩士在職專班", "", "✓"],
      ["413155021", "李小華", "Li Xiao Hua", "(研)資訊管理學系碩士在職專班", "", ""],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(templateRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "學生名單");
    XLSX.writeFile(workbook, "students-import-template.xlsx");
  };

  const handleBatchFileChange = async (file: File | null) => {
    setBatchFile(file);
    setBatchPreviewCount(0);
    setErrorMessage(null);

    if (!file) {
      return;
    }

    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        setErrorMessage("Excel 中找不到有效學生資料（學號需在第一欄）。");
        return;
      }
      setBatchPreviewCount(parsed.length);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "解析 Excel 失敗。");
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
    if (!singleCourseId) {
      setErrorMessage("請先選擇單筆建立要加入的課程。");
      return;
    }

    setSavingStudent(true);
    try {
      await createStudentRecord({
        studentIdValue: studentId,
        studentNameValue: studentName,
        passwordValue: defaultPassword,
        courseId: singleCourseId,
        groupName: singleGroupName,
        isLeader: singleIsLeader,
      });
      setStudentId("");
      setStudentName("");
      setStudentPassword("");
      setSingleGroupName("");
      setSingleIsLeader(false);
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

    if (!batchFile) {
      setErrorMessage("請先上傳 Excel 檔案。");
      return;
    }

    if (!batchCourseId) {
      setErrorMessage("請先選擇匯入課程。");
      return;
    }

    let parsedRows: BatchStudentRow[] = [];
    try {
      parsedRows = await parseExcelFile(batchFile);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "解析 Excel 失敗。");
      return;
    }

    if (parsedRows.length === 0) {
      setErrorMessage("Excel 中找不到有效學生資料（學號需在第一欄）。");
      return;
    }

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
          courseId: batchCourseId,
          groupName: row.groupNameValue,
          isLeader: row.isLeaderValue,
        });
        successCount += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "未知錯誤";
        failedRows.push(`${row.studentIdValue || "空白學號"}（${reason}）`);
      }
    }

    setImporting(false);

    if (successCount > 0) {
      setSuccessMessage(
        `批次匯入完成，共 ${successCount} 位成功，加入課程：${selectedBatchCourseLabel || "（未命名課程）"}`,
      );
    } else {
      setSuccessMessage(null);
    }

    if (failedRows.length === 0) {
      setBatchFile(null);
      setBatchPreviewCount(0);
      return;
    }

    setErrorMessage(
      `成功 ${successCount} 位，失敗 ${failedRows.length} 位：${failedRows.slice(0, 3).join("、")}${
        failedRows.length > 3 ? " ..." : ""
      }`,
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
            <p className="mt-1 text-sm text-slate-500">
              單筆建立學生或批次上傳 Excel；批次匯入會將學生加入你選擇的課程。
            </p>
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
              key="single-student-form"
              onSubmit={handleCreateSingleStudent}
              className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5"
            >
              <h2 className="text-lg font-bold text-slate-800">單筆建立學生</h2>
              <input
                type="text"
                value={String(studentId ?? "")}
                onChange={(event) => setStudentId(event.target.value ?? "")}
                placeholder="學號"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <input
                type="text"
                value={String(studentName ?? "")}
                onChange={(event) => setStudentName(event.target.value ?? "")}
                placeholder="姓名"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <input
                type="text"
                value={String(studentPassword ?? "")}
                onChange={(event) => setStudentPassword(event.target.value ?? "")}
                placeholder="預設密碼（留白=學號）"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                value={String(singleGroupName ?? "")}
                onChange={(event) => setSingleGroupName(event.target.value ?? "")}
                placeholder="組別（例如：第一組(L)）"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={singleIsLeader}
                  onChange={(event) => setSingleIsLeader(event.target.checked)}
                  className="h-4 w-4"
                />
                設為組長
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                建立後加入課程
                <select
                  value={String(singleCourseId ?? "")}
                  onChange={(event) => setSingleCourseId(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loadingCourses || courses.length === 0}
                  required
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
              <button
                type="submit"
                disabled={savingStudent || !singleCourseId}
                className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
              >
                {savingStudent ? "建立中..." : "建立學生"}
              </button>
            </form>
          ) : (
            <form
              key="batch-student-form"
              onSubmit={handleBatchImport}
              className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5"
            >
              <h2 className="text-lg font-bold text-slate-800">批次匯入學生（Excel）</h2>
              <p className="text-xs text-slate-500">
                請上傳 .xlsx / .xls；系統會讀取第一欄學號、第二欄姓名、分組標題列，以及第六欄是否為組長。
              </p>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                下載 Excel 範本
              </button>

              <label className="block text-sm font-semibold text-slate-700">
                匯入後加入課程
                <select
                  value={String(batchCourseId ?? "")}
                  onChange={(event) => setBatchCourseId(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loadingCourses || courses.length === 0}
                  required
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

              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => {
                  void handleBatchFileChange(event.target.files?.[0] ?? null);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-700"
                required
              />

              {batchFile && (
                <p className="text-xs font-semibold text-slate-600">
                  已選擇檔案：{batchFile.name}（預計匯入 {batchPreviewCount} 位）
                </p>
              )}

              <button
                type="submit"
                disabled={importing || !batchFile || !batchCourseId}
                className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
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
