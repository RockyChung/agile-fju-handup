"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

type CourseRow = {
  id: string;
  title: string;
  courseCode: string;
  isActive: boolean;
  teacherId: string;
  createdAt: string;
};

type UserOption = {
  id: string;
  studentId: string;
  name: string | null;
};

async function authHeaders() {
  const token = getBackendToken();
  if (!token) {
    return null;
  }
  return { Authorization: `Bearer ${token}` };
}

export function CoursesPanel() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [teachers, setTeachers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newTeacherId, setNewTeacherId] = useState("");
  const [newActive, setNewActive] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editTeacherId, setEditTeacherId] = useState("");
  const [editActive, setEditActive] = useState(false);
  const [saving, setSaving] = useState(false);

  const [enrollCourseId, setEnrollCourseId] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<
    { studentId: string; name: string | null; studentNo: string | null }[]
  >([]);
  const [allStudents, setAllStudents] = useState<UserOption[]>([]);
  const [addStudentId, setAddStudentId] = useState("");
  const [enrollLoading, setEnrollLoading] = useState(false);

  const teacherNameMap = useMemo(() => {
    const map = new Map<string, string>();
    teachers.forEach((teacher) => {
      map.set(teacher.id, teacher.name || teacher.studentId);
    });
    return map;
  }, [teachers]);

  const loadCore = useCallback(async () => {
    setErrorMessage(null);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效，請重新登入。");
      setLoading(false);
      return;
    }

    const [courseRes, teacherRes] = await Promise.all([
      fetch(`${getBackendApiBaseUrl()}/courses`, { headers }),
      fetch(`${getBackendApiBaseUrl()}/users?role=teacher`, { headers }),
    ]);

    if (!courseRes.ok) {
      const payload = (await courseRes.json().catch(() => ({}))) as { message?: string };
      setErrorMessage(payload.message ?? "讀取課程失敗");
      setLoading(false);
      return;
    }

    if (!teacherRes.ok) {
      const payload = (await teacherRes.json().catch(() => ({}))) as { message?: string };
      setErrorMessage(payload.message ?? "讀取老師清單失敗");
      setLoading(false);
      return;
    }

    const courseJson = (await courseRes.json()) as { courses?: CourseRow[] };
    const teacherJson = (await teacherRes.json()) as {
      users?: { id: string; studentId: string; name: string | null }[];
    };

    const teacherList = (teacherJson.users ?? []).map((row) => ({
      id: row.id,
      studentId: row.studentId,
      name: row.name,
    }));

    setCourses(courseJson.courses ?? []);
    setTeachers(teacherList);
    setNewTeacherId((previous) => previous || teacherList[0]?.id || "");
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadCore();
    });
    return () => cancelAnimationFrame(id);
  }, [loadCore]);

  const loadEnrollment = useCallback(async (courseId: string) => {
    setEnrollLoading(true);
    setErrorMessage(null);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效，請重新登入。");
      setEnrollLoading(false);
      return;
    }

    const [enrollRes, studentsRes] = await Promise.all([
      fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/students`, { headers }),
      fetch(`${getBackendApiBaseUrl()}/users?role=student`, { headers }),
    ]);

    if (!enrollRes.ok || !studentsRes.ok) {
      setErrorMessage("讀取選課資料失敗");
      setEnrollLoading(false);
      return;
    }

    const enrollJson = (await enrollRes.json()) as {
      students?: {
        student: {
          id: string;
          studentId: string;
          name: string | null;
        };
      }[];
    };

    const studentJson = (await studentsRes.json()) as {
      users?: { id: string; studentId: string; name: string | null }[];
    };

    const all = (studentJson.users ?? []).map((student) => ({
      id: student.id,
      studentId: student.studentId,
      name: student.name,
    }));
    setAllStudents(all);

    const enrolledRows = (enrollJson.students ?? []).map((row) => ({
      studentId: row.student.id,
      name: row.student.name,
      studentNo: row.student.studentId,
    }));
    setEnrolled(enrolledRows);

    const enrolledSet = new Set(enrolledRows.map((row) => row.studentId));
    const firstAvailable = all.find((student) => !enrolledSet.has(student.id));
    setAddStudentId(firstAvailable?.id ?? "");

    setEnrollLoading(false);
  }, []);

  useEffect(() => {
    if (!enrollCourseId) {
      return;
    }

    const id = requestAnimationFrame(() => {
      void loadEnrollment(enrollCourseId);
    });

    return () => cancelAnimationFrame(id);
  }, [enrollCourseId, loadEnrollment]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();

    if (!newTeacherId) {
      setErrorMessage("請先建立至少一位老師帳號。");
      return;
    }

    setCreating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效，請重新登入。");
      setCreating(false);
      return;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: newTitle.trim(),
        courseCode: newCode.trim(),
        teacherId: newTeacherId,
        isActive: newActive,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setErrorMessage(payload.message ?? "建立課程失敗");
      setCreating(false);
      return;
    }

    setSuccessMessage("已建立課程");
    setNewTitle("");
    setNewCode("");
    setNewActive(false);
    setCreating(false);
    await loadCore();
  };

  const startEdit = (course: CourseRow) => {
    setEditingId(course.id);
    setEditTitle(course.title);
    setEditCode(course.courseCode);
    setEditTeacherId(course.teacherId);
    setEditActive(course.isActive);
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    setErrorMessage(null);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效，請重新登入。");
      setSaving(false);
      return;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${id}`, {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: editTitle.trim(),
        courseCode: editCode.trim(),
        teacherId: editTeacherId,
        isActive: editActive,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setErrorMessage(payload.message ?? "更新課程失敗");
      setSaving(false);
      return;
    }

    setSuccessMessage("已更新課程");
    setEditingId(null);
    setSaving(false);
    await loadCore();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("確定刪除此課程？相關選課與舉手紀錄會一併刪除。")) {
      return;
    }

    setErrorMessage(null);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效，請重新登入。");
      return;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${id}`, {
      method: "DELETE",
      headers,
    });

    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok && response.status !== 204) {
      setErrorMessage(payload.message ?? "刪除課程失敗");
      return;
    }

    setSuccessMessage("已刪除課程");
    if (enrollCourseId === id) {
      setEnrollCourseId(null);
    }
    await loadCore();
  };

  const handleAddEnrollment = async () => {
    if (!enrollCourseId || !addStudentId) {
      return;
    }

    setEnrollLoading(true);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效，請重新登入。");
      setEnrollLoading(false);
      return;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${enrollCourseId}/students`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ studentId: addStudentId }),
    });

    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setErrorMessage(payload.message ?? "加入選課失敗");
      setEnrollLoading(false);
      return;
    }

    setSuccessMessage("已加入選課");
    await loadEnrollment(enrollCourseId);
  };

  const handleRemoveEnrollment = async (studentId: string) => {
    if (!enrollCourseId) {
      return;
    }

    setEnrollLoading(true);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效，請重新登入。");
      setEnrollLoading(false);
      return;
    }

    const response = await fetch(
      `${getBackendApiBaseUrl()}/courses/${enrollCourseId}/students/${studentId}`,
      {
        method: "DELETE",
        headers,
      },
    );

    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok && response.status !== 204) {
      setErrorMessage(payload.message ?? "移除選課失敗");
      setEnrollLoading(false);
      return;
    }

    setSuccessMessage("已移除選課");
    await loadEnrollment(enrollCourseId);
  };

  const enrollOptions = useMemo(() => {
    const enrolledSet = new Set(enrolled.map((row) => row.studentId));
    return allStudents.filter((student) => !enrolledSet.has(student.id));
  }, [allStudents, enrolled]);

  if (loading) {
    return <p className="text-center font-medium text-slate-900">讀取課程中...</p>;
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-3"
      >
        <h3 className="text-lg font-black text-slate-800">新增課程</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-900">
            課程名稱
            <input
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-black"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-900">
            課程代碼
            <input
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-black"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-900">
            授課老師
            <select
              required
              value={newTeacherId}
              onChange={(e) => setNewTeacherId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-black"
            >
              {teachers.length === 0 ? (
                <option value="">（尚無老師）</option>
              ) : (
                teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name || teacher.studentId}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <input
              type="checkbox"
              checked={newActive}
              onChange={(e) => setNewActive(e.target.checked)}
            />
            開課中
          </label>
        </div>
        <button
          type="submit"
          disabled={creating || teachers.length === 0}
          className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-800"
        >
          {creating ? "建立中..." : "建立課程"}
        </button>
      </form>

      {errorMessage && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
          {errorMessage}
        </p>
      )}
      {successMessage && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {successMessage}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm text-slate-900">
          <thead className="bg-slate-100 text-slate-900">
            <tr>
              <th className="px-4 py-3 font-bold">課程名稱</th>
              <th className="px-4 py-3 font-bold">代碼</th>
              <th className="px-4 py-3 font-bold">老師</th>
              <th className="px-4 py-3 font-bold">開課</th>
              <th className="px-4 py-3 font-bold">操作</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course) => (
              <tr key={course.id} className="border-t border-slate-100 align-top">
                {editingId === course.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1 text-black"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        className="w-full min-w-[100px] rounded border border-slate-200 px-2 py-1 text-black"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={editTeacherId}
                        onChange={(e) => setEditTeacherId(e.target.value)}
                        className="rounded border border-slate-200 px-2 py-1 text-black"
                      >
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.name || teacher.studentId}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={editActive}
                        onChange={(e) => setEditActive(e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(course.id)}
                        disabled={saving}
                        className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white"
                      >
                        儲存
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600"
                      >
                        取消
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-slate-900">{course.title}</td>
                    <td className="px-4 py-3 text-slate-900">{course.courseCode}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {teacherNameMap.get(course.teacherId) ?? course.teacherId}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{course.isActive ? "是" : "否"}</td>
                    <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(course)}
                        className="text-indigo-600 font-bold hover:underline"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => setEnrollCourseId(enrollCourseId === course.id ? null : course.id)}
                        className="text-indigo-700 font-bold hover:underline"
                      >
                        {enrollCourseId === course.id ? "關閉選課" : "選課名單"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(course.id)}
                        className="text-rose-600 font-bold hover:underline"
                      >
                        刪除
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {enrollCourseId && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 space-y-4">
          <h4 className="font-black text-slate-800">課程選課管理</h4>
          {enrollLoading ? (
            <p className="text-sm font-medium text-slate-900">載入中...</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-semibold text-slate-900">
                  加入學生
                  <select
                    value={addStudentId}
                    onChange={(e) => setAddStudentId(e.target.value)}
                    className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-black"
                  >
                    {enrollOptions.length === 0 ? (
                      <option value="">（無可加入學生）</option>
                    ) : (
                      enrollOptions.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.studentId} {student.name ?? ""}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void handleAddEnrollment()}
                  disabled={!addStudentId}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-800"
                >
                  加入
                </button>
              </div>
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-100 bg-white">
                {enrolled.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-slate-800">尚無學生選課</li>
                ) : (
                  enrolled.map((row) => (
                    <li
                      key={row.studentId}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-sm text-slate-900"
                    >
                      <span className="font-medium">
                        {row.studentNo ?? "—"} {row.name ? ` ${row.name}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveEnrollment(row.studentId)}
                        className="text-rose-600 font-bold hover:underline"
                      >
                        移除
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
