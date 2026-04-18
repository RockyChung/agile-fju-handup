import { fjuEmailFromStudentId } from "@/lib/fju-auth-email";
import { requireAdminFromRequest } from "@/lib/require-admin-api";
import { createServiceClient } from "@/lib/supabase-service";

type CreateBody = {
  /** 登入學號；Auth email 為 學號@cloud.fju.edu.tw */
  student_id: string;
  password: string;
  name?: string | null;
  role: "teacher" | "student" | "admin";
  must_change_password?: boolean;
};

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof Response) {
    return auth;
  }
  try {
    const service = createServiceClient();
    const { data: listData, error: listError } = await service.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listError) {
      return Response.json({ error: listError.message }, { status: 500 });
    }
    const users = listData?.users ?? [];
    const ids = users.map((u) => u.id);
    if (ids.length === 0) {
      return Response.json({ users: [] });
    }
    const { data: profiles, error: profilesError } = await service
      .from("profiles")
      .select("id, name, role, student_id, must_change_password")
      .in("id", ids);
    if (profilesError) {
      return Response.json({ error: profilesError.message }, { status: 500 });
    }
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const merged = users.map((u) => {
      const p = profileMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        name: p?.name ?? null,
        role: p?.role ?? "unknown",
        student_id: p?.student_id ?? null,
        must_change_password: p?.must_change_password ?? false,
      };
    });
    return Response.json({ users: merged });
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

export async function POST(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof Response) {
    return auth;
  }
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "無效的 JSON" }, { status: 400 });
  }
  const sidRaw = typeof body.student_id === "string" ? body.student_id.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role;
  if (!sidRaw || !password || !role) {
    return Response.json({ error: "學號 (student_id)、password、role 為必填" }, { status: 400 });
  }
  if (!["teacher", "student", "admin"].includes(role)) {
    return Response.json({ error: "role 必須為 teacher、student 或 admin" }, { status: 400 });
  }
  let email: string;
  try {
    email = fjuEmailFromStudentId(sidRaw);
  } catch {
    return Response.json({ error: "學號無效" }, { status: 400 });
  }
  try {
    const service = createServiceClient();
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      return Response.json({ error: createError?.message ?? "建立帳號失敗" }, { status: 400 });
    }
    const uid = created.user.id;
    const { error: profileError } = await service.from("profiles").upsert(
      {
        id: uid,
        name: body.name ?? null,
        role,
        must_change_password:
          typeof body.must_change_password === "boolean"
            ? body.must_change_password
            : role === "student",
        student_id: sidRaw,
      },
      { onConflict: "id" },
    );
    if (profileError) {
      await service.auth.admin.deleteUser(uid);
      return Response.json({ error: profileError.message }, { status: 400 });
    }
    return Response.json({
      user: {
        id: uid,
        email: created.user.email ?? email,
        name: body.name ?? null,
        role,
        student_id: sidRaw,
        must_change_password:
          typeof body.must_change_password === "boolean"
            ? body.must_change_password
            : role === "student",
      },
    });
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
