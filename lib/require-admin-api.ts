import { createClient } from "@supabase/supabase-js";

export type AdminAuthOk = { userId: string };

export async function requireAdminFromRequest(request: Request): Promise<AdminAuthOk | Response> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "未授權" }, { status: 401 });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return Response.json({ error: "伺服器設定不完整" }, { status: 500 });
  }
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return Response.json({ error: "未授權" }, { status: 401 });
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError || !profile || profile.role !== "admin") {
    return Response.json({ error: "需要管理員權限" }, { status: 403 });
  }
  return { userId: user.id };
}
