"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

      if (profile.role !== "teacher") {
        router.replace("/student/dashboard");
        return;
      }

      setTeacherId(user.id);
      setTeacherName(profile.name || "老師");
      setLoading(false);
    };

    void bootstrap();
  }, [router]);

  return { loading, teacherId, teacherName };
}
