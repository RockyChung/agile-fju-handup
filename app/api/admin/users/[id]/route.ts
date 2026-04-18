import { fjuEmailFromStudentId } from "@/lib/fju-auth-email";
import { requireAdminFromRequest } from "@/lib/require-admin-api";
import { createServiceClient } from "@/lib/supabase-service";

type PatchBody = {
  name?: string | null;
  role?: "teacher" | "student" | "admin";
  student_id?: string | null;
  must_change_password?: boolean;
  password?: string | null;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof Response) {
    return auth;
  }
  const { id: targetId } = await context.params;
  if (!targetId) {
    return Response.json({ error: "缺少 id" }, { status: 400 });
  }
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "無效的 JSON" }, { status: 400 });
  }
  if (body.role !== undefined && !["teacher", "student", "admin"].includes(body.role)) {
    return Response.json({ error: "role 無效" }, { status: 400 });
  }
  if (
    body.role !== undefined &&
    body.role !== "admin" &&
    auth.userId === targetId
  ) {
    return Response.json({ error: "無法變更自己的管理員角色" }, { status: 400 });
  }
  if (body.password !== undefined && body.password !== null && body.password.length < 8) {
    return Response.json({ error: "密碼至少 8 碼" }, { status: 400 });
  }
  try {
    const service = createServiceClient();
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) {
      patch.name = body.name;
    }
    if (body.role !== undefined) {
      patch.role = body.role;
    }
    if (body.student_id !== undefined) {
      const trimmed = typeof body.student_id === "string" ? body.student_id.trim() : "";
      if (!trimmed) {
        return Response.json({ error: "學號不可為空" }, { status: 400 });
      }
      let newEmail: string;
      try {
        newEmail = fjuEmailFromStudentId(trimmed);
      } catch {
        return Response.json({ error: "學號無效" }, { status: 400 });
      }
      const { error: emailErr } = await service.auth.admin.updateUserById(targetId, {
        email: newEmail,
      });
      if (emailErr) {
        return Response.json({ error: emailErr.message }, { status: 400 });
      }
      patch.student_id = trimmed;
    }
    if (body.must_change_password !== undefined) {
      patch.must_change_password = body.must_change_password;
    }
    if (Object.keys(patch).length > 0) {
      const { error: profileError } = await service.from("profiles").update(patch).eq("id", targetId);
      if (profileError) {
        return Response.json({ error: profileError.message }, { status: 400 });
      }
    }
    if (typeof body.password === "string" && body.password.length > 0) {
      const { error: pwError } = await service.auth.admin.updateUserById(targetId, {
        password: body.password,
      });
      if (pwError) {
        return Response.json({ error: pwError.message }, { status: 400 });
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "伺服器錯誤";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return Response.json(
        { error: "請在伺服器環境變數設定 SUPABASE_SERVICE_ROLE_KEY 以使用管理 API。" },
        { status: 503 },
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof Response) {
    return auth;
  }
  const { id: targetId } = await context.params;
  if (!targetId) {
    return Response.json({ error: "缺少 id" }, { status: 400 });
  }
  if (targetId === auth.userId) {
    return Response.json({ error: "無法刪除自己的帳號" }, { status: 400 });
  }
  try {
    const service = createServiceClient();
    const { error } = await service.auth.admin.deleteUser(targetId);
    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "伺服器錯誤";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return Response.json(
        { error: "請在伺服器環境變數設定 SUPABASE_SERVICE_ROLE_KEY 以使用管理 API。" },
        { status: 503 },
      );
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
