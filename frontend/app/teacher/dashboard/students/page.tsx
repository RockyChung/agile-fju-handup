"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";
import { useRequireTeacher } from "@/hooks/use-require-teacher";

type StudentManageMode = "single" | "batch" | "search" | "grouping";

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

type StudentSearchRow = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  studentUserId: string;
  studentId: string;
  studentName: string | null;
  groupName: string | null;
  isLeader: boolean;
};

type CourseStudentRow = {
  groupName: string | null;
  isLeader: boolean;
  student: {
    id: string;
    studentId: string;
    name: string | null;
  };
};

type GroupingStudentCard = {
  id: string;
  studentId: string;
  name: string;
  groupName: string | null;
  isLeader: boolean;
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
  const [filterStudentId, setFilterStudentId] = useState("");
  const [filterStudentName, setFilterStudentName] = useState("");
  const [filterCourseId, setFilterCourseId] = useState("");
  const [searchRows, setSearchRows] = useState<StudentSearchRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingIsLeader, setEditingIsLeader] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [groupingCourseId, setGroupingCourseId] = useState("");
  const [groupingStudents, setGroupingStudents] = useState<GroupingStudentCard[]>([]);
  const [loadingGroupingStudents, setLoadingGroupingStudents] = useState(false);
  const [groupingGroupCount, setGroupingGroupCount] = useState(2);
  const [groupingSaving, setGroupingSaving] = useState(false);
  const [highlightedStudentId, setHighlightedStudentId] = useState<string | null>(null);
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

  const groupedStudents = useMemo(() => {
    const map = new Map<string, GroupingStudentCard[]>();
    for (const student of groupingStudents) {
      if (!student.groupName) {
        continue;
      }
      if (!map.has(student.groupName)) {
        map.set(student.groupName, []);
      }
      map.get(student.groupName)!.push(student);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"));
  }, [groupingStudents]);

  const ungroupedStudents = useMemo(
    () => groupingStudents.filter((student) => !student.groupName),
    [groupingStudents],
  );

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
      setGroupingCourseId((prev) => prev || rows[0]?.id || "");
      setLoadingCourses(false);
    };

    void loadCourses();
  }, [teacherId]);

  useEffect(() => {
    const loadGroupingStudents = async () => {
      if (!groupingCourseId) {
        setGroupingStudents([]);
        return;
      }

      setLoadingGroupingStudents(true);
      setErrorMessage(null);
      const token = getBackendToken();
      if (!token) {
        setErrorMessage("登入資訊已失效，請重新登入。");
        setLoadingGroupingStudents(false);
        return;
      }

      const response = await fetch(`${getBackendApiBaseUrl()}/courses/${groupingCourseId}/students`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        setErrorMessage("讀取學生名單失敗。");
        setLoadingGroupingStudents(false);
        return;
      }

      const json = (await response.json()) as { students?: CourseStudentRow[] };
      const rows = json.students ?? [];
      setGroupingStudents(
        rows.map((row) => ({
          id: row.student.id,
          studentId: row.student.studentId,
          name: row.student.name ?? "未命名同學",
          groupName: row.groupName,
          isLeader: row.isLeader,
        })),
      );
      setLoadingGroupingStudents(false);
    };

    void loadGroupingStudents();
  }, [groupingCourseId]);

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
      const groupColumnRaw = String(row[4] ?? "").trim();
      const leaderMarkRaw = String(row[5] ?? "").trim();

      if (!/^\d{8,}$/.test(studentIdRaw) && studentIdRaw) {
        currentGroupName = studentIdRaw;
        continue;
      }

      if (!/^\d{8,}$/.test(studentIdRaw)) {
        continue;
      }

      parsed.push({
        studentIdValue: studentIdRaw,
        studentNameValue: studentNameRaw || studentIdRaw,
        groupNameValue: groupColumnRaw || currentGroupName,
        isLeaderValue: Boolean(leaderMarkRaw),
      });
    }

    return parsed;
  };

  const handleDownloadTemplate = () => {
    const templateRows = [
      ["帳號", "姓名", "英文姓名", "系級", "組別", "組長"],
      ["413155020", "王小明", "Wang Xiao Ming", "(研)資訊管理學系碩士在職專班", "1", "✓"],
      ["413155021", "李小華", "Li Xiao Hua", "(研)資訊管理學系碩士在職專班", "1", ""],
      ["413155022", "陳小明", "Chen Xiao Ming", "(研)資訊管理學系碩士在職專班", "2", "✓"],
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
    setSearchRows(json.students ?? []);
    setEditingKey(null);
    setLoadingRows(false);
  };

  const beginEdit = (row: StudentSearchRow) => {
    const key = `${row.courseId}-${row.studentUserId}`;
    setEditingKey(key);
    setEditingName(row.studentName ?? "");
    setEditingGroupName(row.groupName ?? "");
    setEditingIsLeader(row.isLeader);
  };

  const handleSaveEdit = async (row: StudentSearchRow) => {
    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入資訊已失效，請重新登入。");
      return;
    }
    setSavingEdit(true);
    setErrorMessage(null);

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${row.courseId}/students/${row.studentUserId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: editingName.trim() || undefined,
        groupName: editingGroupName.trim() || null,
        isLeader: editingIsLeader,
      }),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      setErrorMessage(err.message || "儲存失敗，請稍後再試。");
      setSavingEdit(false);
      return;
    }

    const json = (await response.json()) as { student?: StudentSearchRow };
    const updatedStudent = json.student;
    if (updatedStudent) {
      setSearchRows((prev) =>
        prev.map((item) =>
          item.courseId === row.courseId && item.studentUserId === row.studentUserId ? updatedStudent : item,
        ),
      );
    }
    setEditingKey(null);
    setSavingEdit(false);
    setSuccessMessage("儲存完成。");
  };

  const updateGroupingStudent = async (
    studentUserId: string,
    patch: { groupName?: string | null; isLeader?: boolean },
    options?: { showSuccessMessage?: boolean },
  ) => {
    if (!groupingCourseId) {
      return false;
    }
    const token = getBackendToken();
    if (!token) {
      setErrorMessage("登入資訊已失效，請重新登入。");
      return false;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${groupingCourseId}/students/${studentUserId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      setErrorMessage(err.message || "更新分組失敗，請稍後再試。");
      return false;
    }

    const json = (await response.json().catch(() => ({}))) as {
      student?: { groupName: string | null; isLeader: boolean };
    };
    setGroupingStudents((prev) =>
      prev.map((student) =>
        student.id === studentUserId
          ? {
              ...student,
              groupName:
                json.student && "groupName" in json.student
                  ? json.student.groupName
                  : patch.groupName !== undefined
                    ? patch.groupName
                    : student.groupName,
              isLeader:
                json.student && "isLeader" in json.student
                  ? json.student.isLeader
                  : patch.isLeader !== undefined
                    ? patch.isLeader
                    : student.isLeader,
            }
          : student,
      ),
    );

    setHighlightedStudentId(studentUserId);
    window.setTimeout(() => {
      setHighlightedStudentId((prev) => (prev === studentUserId ? null : prev));
    }, 1000);

    if (options?.showSuccessMessage !== false) {
      setSuccessMessage("儲存完成。");
    }
    return true;
  };

  const handleRandomGrouping = async () => {
    if (!groupingCourseId || groupingStudents.length === 0) {
      return;
    }

    const normalizedCount = Math.max(2, Math.min(20, Math.floor(groupingGroupCount || 2)));
    const shuffled = [...groupingStudents].sort(() => Math.random() - 0.5);
    setGroupingSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const results = await Promise.all(
        shuffled.map((student, index) => {
          const targetGroup = `第${(index % normalizedCount) + 1}組`;
          return updateGroupingStudent(student.id, { groupName: targetGroup }, { showSuccessMessage: false });
        }),
      );
      const failedCount = results.filter((ok) => !ok).length;
      if (failedCount > 0) {
        setErrorMessage(`分組完成，但有 ${failedCount} 位學生更新失敗，請稍後重試。`);
      } else {
        setSuccessMessage(`已完成隨機分組，共 ${normalizedCount} 組。`);
      }
    } finally {
      setGroupingSaving(false);
    }
  };

  const handleDropToGroup = async (event: React.DragEvent<HTMLElement>, targetGroupName: string | null) => {
    event.preventDefault();
    const studentUserId = event.dataTransfer.getData("text/plain");
    if (!studentUserId) {
      return;
    }
    await updateGroupingStudent(studentUserId, { groupName: targetGroupName });
  };

  const handleToggleLeaderInGrouping = async (student: GroupingStudentCard) => {
    await updateGroupingStudent(student.id, { isLeader: !student.isLeader });
  };

  const allowDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800">學生資料管理</h1>
            <p className="mt-1 text-sm text-slate-500">
              單筆建立、批次匯入、查詢編輯與學生分組整併於同一頁，並可直接加入課程。
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
          <div className="flex flex-wrap gap-2">
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
            <button
              type="button"
              onClick={() => setManageMode("search")}
              className={`rounded-xl px-4 py-2 font-bold ${
                manageMode === "search"
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              學生查詢與編輯
            </button>
            <button
              type="button"
              onClick={() => setManageMode("grouping")}
              className={`rounded-xl px-4 py-2 font-bold ${
                manageMode === "grouping"
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              學生分組
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
          ) : manageMode === "batch" ? (
            <form
              key="batch-student-form"
              onSubmit={handleBatchImport}
              className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5"
            >
              <h2 className="text-lg font-bold text-slate-800">批次匯入學生（Excel）</h2>
              <p className="text-xs text-slate-500">
                請上傳 .xlsx / .xls；系統會讀取第一欄學號、第二欄姓名、第五欄組別、第六欄是否為組長。
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
          ) : manageMode === "search" ? (
            <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5">
              <h2 className="text-lg font-bold text-slate-800">學生查詢與編輯</h2>
              <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-4">
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
                      <th className="px-4 py-3 font-bold">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={6}>
                          尚無資料，請輸入條件後查詢
                        </td>
                      </tr>
                    ) : (
                      searchRows.map((row, index) => (
                        <tr key={`${row.courseId}-${row.studentUserId}-${index}`} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-semibold text-slate-800">{row.studentId}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {editingKey === `${row.courseId}-${row.studentUserId}` ? (
                              <input
                                value={editingName}
                                onChange={(event) => setEditingName(event.target.value)}
                                className="w-full rounded border border-slate-300 px-2 py-1"
                              />
                            ) : (
                              row.studentName || "-"
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {row.courseCode} {row.courseTitle}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {editingKey === `${row.courseId}-${row.studentUserId}` ? (
                              <input
                                value={editingGroupName}
                                onChange={(event) => setEditingGroupName(event.target.value)}
                                className="w-full rounded border border-slate-300 px-2 py-1"
                              />
                            ) : (
                              row.groupName || "-"
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {editingKey === `${row.courseId}-${row.studentUserId}` ? (
                              <label className="inline-flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={editingIsLeader}
                                  onChange={(event) => setEditingIsLeader(event.target.checked)}
                                />
                                組長
                              </label>
                            ) : row.isLeader ? (
                              "是"
                            ) : (
                              "否"
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {editingKey === `${row.courseId}-${row.studentUserId}` ? (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveEdit(row)}
                                  disabled={savingEdit}
                                  className="rounded bg-indigo-600 px-3 py-1 font-semibold text-white disabled:bg-slate-300"
                                >
                                  儲存
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingKey(null)}
                                  className="rounded border border-slate-300 px-3 py-1 font-semibold"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => beginEdit(row)}
                                className="rounded border border-slate-300 px-3 py-1 font-semibold"
                              >
                                編輯
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <section className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-5 md:grid-cols-4">
                <select
                  value={groupingCourseId}
                  onChange={(event) => setGroupingCourseId(event.target.value)}
                  disabled={loadingCourses}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">請選擇課程</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.courseCode} {course.title}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={groupingGroupCount}
                  onChange={(event) => setGroupingGroupCount(Number(event.target.value))}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="分組組數"
                />
                <button
                  type="button"
                  disabled={groupingSaving || loadingGroupingStudents || groupingStudents.length === 0 || !groupingCourseId}
                  onClick={() => void handleRandomGrouping()}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  {groupingSaving ? "分組中..." : "隨機分組"}
                </button>
                <div className="flex items-center text-sm font-semibold text-slate-600">總人數：{groupingStudents.length} 人</div>
              </section>

              {loadingGroupingStudents ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center font-semibold text-slate-500">
                  載入學生名單中...
                </div>
              ) : (
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {groupedStudents.map(([groupName, members]) => (
                    <article
                      key={groupName}
                      onDragOver={allowDrop}
                      onDrop={(event) => void handleDropToGroup(event, groupName)}
                      className="rounded-2xl border border-slate-100 bg-white p-4"
                    >
                      <h2 className="mb-3 text-lg font-black text-slate-800">
                        {groupName}
                        <span className="ml-2 text-sm font-semibold text-slate-500">（{members.length} 人）</span>
                      </h2>
                      <div className="space-y-2">
                        {members.map((student) => (
                          <div
                            key={student.id}
                            draggable
                            onDragStart={(event) => event.dataTransfer.setData("text/plain", student.id)}
                            className={`cursor-move rounded-xl border px-3 py-2 transition-colors ${
                              highlightedStudentId === student.id
                                ? "border-amber-300 bg-amber-100"
                                : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-slate-800">{student.name}</p>
                              <button
                                type="button"
                                onClick={() => void handleToggleLeaderInGrouping(student)}
                                className={`rounded px-2 py-1 text-xs font-bold ${
                                  student.isLeader
                                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                                    : "border border-indigo-200 bg-indigo-50 text-indigo-700"
                                }`}
                              >
                                {student.isLeader ? "取消組長" : "設為組長"}
                              </button>
                            </div>
                            <p className="text-xs text-slate-500">
                              {student.studentId} {student.isLeader ? "・組長" : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}

                  <article
                    onDragOver={allowDrop}
                    onDrop={(event) => void handleDropToGroup(event, null)}
                    className="rounded-2xl border border-dashed border-slate-300 bg-white p-4"
                  >
                    <h2 className="mb-3 text-lg font-black text-slate-700">未分組</h2>
                    <div className="space-y-2">
                      {ungroupedStudents.length === 0 ? (
                        <p className="text-sm text-slate-500">目前沒有未分組學生</p>
                      ) : (
                        ungroupedStudents.map((student) => (
                          <div
                            key={student.id}
                            draggable
                            onDragStart={(event) => event.dataTransfer.setData("text/plain", student.id)}
                            className={`cursor-move rounded-xl border px-3 py-2 transition-colors ${
                              highlightedStudentId === student.id
                                ? "border-amber-300 bg-amber-100"
                                : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-slate-800">{student.name}</p>
                              <button
                                type="button"
                                onClick={() => void handleToggleLeaderInGrouping(student)}
                                className={`rounded px-2 py-1 text-xs font-bold ${
                                  student.isLeader
                                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                                    : "border border-indigo-200 bg-indigo-50 text-indigo-700"
                                }`}
                              >
                                {student.isLeader ? "取消組長" : "設為組長"}
                              </button>
                            </div>
                            <p className="text-xs text-slate-500">
                              {student.studentId} {student.isLeader ? "・組長" : ""}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                </section>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
