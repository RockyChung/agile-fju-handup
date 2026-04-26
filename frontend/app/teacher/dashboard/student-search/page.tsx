"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeacherStudentSearchPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/teacher/dashboard/students");
  }, [router]);

  return (
    <main className="p-8 text-center font-semibold text-slate-600">
      轉址中...
    </main>
  );
}
