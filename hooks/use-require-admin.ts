"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type UseRequireAdminResult = {
  loading: boolean;
  adminId: string | null;
  adminName: string;
};

export function useRequireAdmin(): UseRequireAdminResult {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [adminName, setAdminName] = useState("管理員");

  useEffect(() => {
    const bootstrap = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("name, role")
        .eq("id", user.id)
        .single();

      if (!profile) {
        router.replace("/");
        return;
      }

      if (profile.role !== "admin") {
        if (profile.role === "teacher") {
          router.replace("/teacher/dashboard");
        } else {
          router.replace("/student/dashboard");
        }
        return;
      }

      setAdminId(user.id);
      setAdminName(profile.name || "管理員");
      setLoading(false);
    };

    void bootstrap();
  }, [router]);

  return { loading, adminId, adminName };
}
