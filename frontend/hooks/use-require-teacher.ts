"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

type UseRequireTeacherResult = {
  loading: boolean;
  teacherId: string | null;
  teacherName: string;
};

export function useRequireTeacher(): UseRequireTeacherResult {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState("老師");

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

      if (user.role === "admin") {
        router.replace("/admin/dashboard");
        return;
      }

      if (user.role !== "teacher") {
        router.replace("/student/dashboard");
        return;
      }

      setTeacherId(user.id);
      setTeacherName(user.name || "老師");
      setLoading(false);
    };

    void bootstrap();
  }, [router]);

  return { loading, teacherId, teacherName };
}
