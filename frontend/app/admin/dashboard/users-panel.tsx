"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { FJU_EMAIL_DOMAIN } from "@/lib/fju-auth-email";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "teacher" | "student" | "admin";
  studentId: string;
  mustChangePassword: boolean;
};

function accountStudentId(u: AdminUserRow): string {
  return u.studentId?.trim() || u.email?.split("@")[0] || "";
}

async function authHeaders() {
  const token = getBackendToken();
  if (!token) {
    return null;
  }
  return { Authorization: `Bearer ${token}` };
}

export function UsersPanel() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [createStudentId, setCreateStudentId] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<"teacher" | "student" | "admin">("student");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"teacher" | "student" | "admin">("student");
  const [editStudentId, setEditStudentId] = useState("");
  const [editMustChange, setEditMustChange] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadUsers = useCallback(async () => {
    setErrorMessage(null);
    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效，請重新登入。");
      setLoading(false);
      return;
    }

    const res = await fetch(`${getBackendApiBaseUrl()}/users`, { headers });
    const json = (await res.json()) as { users?: AdminUserRow[]; message?: string };

    if (!res.ok) {
      setErrorMessage(json.message ?? "讀取帳號失敗");
      setLoading(false);
      return;
    }

    setUsers(json.users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadUsers();
    });
    return () => cancelAnimationFrame(id);
  }, [loadUsers]);

  const startEdit = (u: AdminUserRow) => {
    setEditingId(u.id);
    setEditName(u.name ?? "");
    setEditRole(u.role);
    setEditStudentId(accountStudentId(u));
    setEditMustChange(u.mustChangePassword);
    setEditPassword("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPassword("");
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createStudentId.trim()) {
      setErrorMessage("請輸入學號。");
      return;
    }

    setCreating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效。");
      setCreating(false);
      return;
    }

    const res = await fetch(`${getBackendApiBaseUrl()}/users`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentId: createStudentId.trim(),
        password: createPassword,
        name: createName.trim() || null,
        role: createRole,
      }),
    });

    const json = (await res.json()) as { message?: string };
    if (!res.ok) {
      setErrorMessage(json.message ?? "建立失敗");
      setCreating(false);
      return;
    }

    setSuccessMessage("已建立帳號");
    setCreateStudentId("");
    setCreatePassword("");
    setCreateName("");
    setCreating(false);
    await loadUsers();
  };

  const handleSaveEdit = async (userId: string) => {
    if (!editStudentId.trim()) {
      setErrorMessage("學號不可為空。");
      return;
    }

    setSavingEdit(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效。");
      setSavingEdit(false);
      return;
    }

    const res = await fetch(`${getBackendApiBaseUrl()}/users/${userId}`, {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: editName.trim() || null,
        role: editRole,
        mustChangePassword: editMustChange,
        studentId: editStudentId.trim(),
        ...(editPassword.trim() ? { password: editPassword } : {}),
      }),
    });

    const json = (await res.json()) as { message?: string };
    if (!res.ok) {
      setErrorMessage(json.message ?? "更新失敗");
      setSavingEdit(false);
      return;
    }

    setSuccessMessage("已更新");
    setEditingId(null);
    setEditPassword("");
    setSavingEdit(false);
    await loadUsers();
  };

  const handleDelete = async (userId: string) => {
    if (!window.confirm("確定要刪除此帳號？此動作無法復原。")) {
      return;
    }

    setErrorMessage(null);

    const headers = await authHeaders();
    if (!headers) {
      setErrorMessage("登入已失效。");
      return;
    }

    const res = await fetch(`${getBackendApiBaseUrl()}/users/${userId}`, {
      method: "DELETE",
      headers,
    });

    const json = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      setErrorMessage(json.message ?? "刪除失敗");
      return;
    }

    setSuccessMessage("已刪除帳號");
    await loadUsers();
  };

  if (loading) {
    return <p className="text-center font-medium text-slate-800">讀取帳號清單中...</p>;
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-3"
      >
        <h3 className="text-lg font-black text-slate-800">新增帳號</h3>
        <p className="text-sm leading-relaxed text-slate-800">
          登入帳號為 學號{FJU_EMAIL_DOMAIN}，現在由 Railway backend 直接建立帳號與密碼。
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-900 md:col-span-2">
            學號（登入帳號）
            <input
              type="text"
              required
              autoComplete="off"
              value={createStudentId}
              onChange={(e) => setCreateStudentId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-black"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-900">
            初始密碼
            <input
              type="password"
              required
              minLength={8}
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-black"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-900">
            顯示名稱
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-black"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-900">
            角色
            <select
              value={createRole}
              onChange={(e) =>
                setCreateRole(e.target.value as "teacher" | "student" | "admin")
              }
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-black"
            >
              <option value="student">學生</option>
              <option value="teacher">老師</option>
              <option value="admin">管理員</option>
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-800"
        >
          {creating ? "建立中..." : "建立帳號"}
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
              <th className="px-4 py-3 font-bold">學號</th>
              <th className="px-4 py-3 font-bold">名稱</th>
              <th className="px-4 py-3 font-bold">角色</th>
              <th className="px-4 py-3 font-bold">須改密碼</th>
              <th className="px-4 py-3 font-bold">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                {editingId === u.id ? (
                  <>
                    <td className="px-4 py-3">
                      <input
                        value={editStudentId}
                        onChange={(e) => setEditStudentId(e.target.value)}
                        className="w-full min-w-[120px] rounded border border-slate-200 px-2 py-1 text-black"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full min-w-[120px] rounded border border-slate-200 px-2 py-1 text-black"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as "teacher" | "student" | "admin")}
                        className="rounded border border-slate-200 px-2 py-1 text-black"
                      >
                        <option value="student">學生</option>
                        <option value="teacher">老師</option>
                        <option value="admin">管理員</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={editMustChange}
                        onChange={(e) => setEditMustChange(e.target.checked)}
                      />
                    </td>
                    <td className="px-4 py-3 space-y-2">
                      <input
                        type="password"
                        placeholder="新密碼（選填）"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        className="w-full min-w-[140px] rounded border border-slate-200 px-2 py-1 text-black"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(u.id)}
                          disabled={savingEdit}
                          className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white"
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600"
                        >
                          取消
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-slate-900">{accountStudentId(u) || "—"}</td>
                    <td className="px-4 py-3 text-slate-900">{u.name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {u.role === "teacher"
                        ? "老師"
                        : u.role === "admin"
                          ? "管理員"
                          : u.role === "student"
                            ? "學生"
                            : u.role}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{u.mustChangePassword ? "是" : "否"}</td>
                    <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => startEdit(u)}
                        className="text-indigo-600 font-bold hover:underline"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(u.id)}
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
    </div>
  );
}
