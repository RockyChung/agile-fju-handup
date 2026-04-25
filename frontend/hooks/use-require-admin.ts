"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

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
      const token = getBackendToken();
      if (!token) {
        router.replace("/");
        return;
      }

      const response = await fetch(`${getBackendApiBaseUrl()}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        router.replace("/");
        return;
      }

      const json = (await response.json()) as {
        user?: {
          id: string;
          role: "admin" | "teacher" | "student";
          name: string | null;
        };
      };
      const user = json.user;

      if (!user) {
        router.replace("/");
        return;
      }

      if (user.role !== "admin") {
        if (user.role === "teacher") {
          router.replace("/teacher/dashboard");
        } else {
          router.replace("/student/dashboard");
        }
        return;
      }

      setAdminId(user.id);
      setAdminName(user.name || "管理員");
      setLoading(false);
    };

    void bootstrap();
  }, [router]);

  return { loading, adminId, adminName };
}
