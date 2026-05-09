"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

type QueueItem = {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  raisedAt: string;
};

type ScoreboardItem = {
  studentUserId: string;
  studentId: string;
  studentName: string;
  totalScore: number;
};

type ScoreHistoryItem = {
  scoreId: string;
  studentUserId: string;
  studentId: string;
  studentName: string;
  score: number;
  awardedAt: string;
};

type LoadQueueOptions = {
  showRefreshing?: boolean;
};

type MeResponse = {
  user: {
    id: string;
    role: "admin" | "teacher" | "student";
    studentId: string;
    name: string | null;
    mustChangePassword: boolean;
  };
};

type QueueResponse = {
  course: {
    id: string;
    title: string;
    courseCode: string;
    isActive: boolean;
    teacherId: string;
    reportOrder: string[];
    currentSpeaker: {
      id: string;
      studentId: string;
      name: string | null;
    } | null;
  };
  queue: {
    id: string;
    createdAt: string;
    student: {
      id: string;
      studentId: string;
      name: string | null;
    };
  }[];
};

type DailyScoreResponse = {
  date: string;
  scoreboard: ScoreboardItem[];
  history: ScoreHistoryItem[];
};

export default function TeacherCoursePage() {
  const router = useRouter();
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState("課程");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reportOrder, setReportOrder] = useState<string[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<QueueItem | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardItem[]>([]);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryItem[]>([]);
  const [scoringModalOpen, setScoringModalOpen] = useState(false);
  const [inputScore, setInputScore] = useState(0);
  const [savingScore, setSavingScore] = useState(false);
  const [deletingScoreId, setDeletingScoreId] = useState<string | null>(null);
  const [pendingDeleteScore, setPendingDeleteScore] = useState<ScoreHistoryItem | null>(null);

  const queueCountText = useMemo(() => `目前共 ${queue.length} 位舉手`, [queue.length]);

  const loadDailyScores = useCallback(
    async (authToken: string) => {
      if (!courseId) {
        return;
      }
      const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/scores/daily`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (!response.ok) {
        return;
      }
      const json = (await response.json()) as DailyScoreResponse;
      setScoreboard(json.scoreboard ?? []);
      setScoreHistory(json.history ?? []);
    },
    [courseId],
  );

  const loadQueue = useCallback(
    async (authToken: string, options?: LoadQueueOptions) => {
      if (!courseId) {
        return;
      }

      const showRefreshing = options?.showRefreshing ?? false;
      if (showRefreshing) {
        setRefreshing(true);
      }
      setErrorMessage(null);

      try {
        const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/hand-raises`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            setErrorMessage("登入已失效，請重新登入。");
            router.replace("/");
            return;
          }
          if (response.status === 403) {
            setErrorMessage("你沒有這門課程的存取權限。");
            router.replace("/teacher/dashboard");
            return;
          }

          setErrorMessage("讀取舉手名單失敗。");
          return;
        }

        const json = (await response.json()) as QueueResponse;
        setCourseTitle(json.course.title || "課程");
        setReportOrder(json.course.reportOrder ?? []);
        setCurrentSpeaker(
          json.course.currentSpeaker
            ? {
                id: `speaker-${json.course.currentSpeaker.id}`,
                studentId: json.course.currentSpeaker.id,
                studentNo: json.course.currentSpeaker.studentId,
                studentName: json.course.currentSpeaker.name ?? "未命名同學",
                raisedAt: new Date().toISOString(),
              }
            : null,
        );
        setQueue(
          json.queue.map((row) => ({
            id: row.id,
            studentId: row.student.id,
            studentNo: row.student.studentId,
            studentName: row.student.name ?? "未命名同學",
            raisedAt: row.createdAt,
          })),
        );
        await loadDailyScores(authToken);
      } catch {
        if (!showRefreshing) {
          // Polling failure is transient (e.g. page leaving), avoid runtime crash.
          return;
        }
        setErrorMessage("無法連線到後端服務，請稍後再試。");
      } finally {
        if (showRefreshing) {
          setRefreshing(false);
        }
      }
    },
    [courseId, loadDailyScores, router],
  );

  useEffect(() => {
    const bootstrap = async () => {
      if (!courseId) {
        router.replace("/teacher/dashboard");
        return;
      }

      const saved = getBackendToken();
      if (!saved) {
        setErrorMessage("尚未取得後端登入憑證，請重新登入。");
        router.replace("/");
        return;
      }
      setToken(saved);

      const meResponse = await fetch(`${getBackendApiBaseUrl()}/auth/me`, {
        headers: {
          Authorization: `Bearer ${saved}`,
        },
      });

      if (!meResponse.ok) {
        setErrorMessage("登入狀態已失效，請重新登入。");
        router.replace("/");
        return;
      }

      const me = (await meResponse.json()) as MeResponse;
      if (me.user.role !== "teacher") {
        if (me.user.role === "admin") {
          router.replace("/admin/dashboard");
        } else {
          router.replace("/student/dashboard");
        }
        return;
      }

      setTeacherId(me.user.id);
      await loadQueue(saved);
      await loadDailyScores(saved);
      setLoading(false);
    };

    void bootstrap();
  }, [courseId, loadDailyScores, loadQueue, router]);

  useEffect(() => {
    if (!courseId || !token) {
      return;
    }

    const poller = window.setInterval(() => {
      void loadQueue(token);
    }, 1000);

    return () => {
      window.clearInterval(poller);
    };
  }, [courseId, loadQueue, token]);

  useEffect(() => {
    if (!scoringModalOpen) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [scoringModalOpen]);

  const handleClearQueue = async () => {
    if (!token || !courseId) {
      return;
    }

    setErrorMessage(null);

    for (const item of queue) {
      const response = await fetch(
        `${getBackendApiBaseUrl()}/courses/${courseId}/hand-raises/${item.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok && response.status !== 404) {
        setErrorMessage("清空舉手名單失敗，請稍後重試。");
        return;
      }
    }

    await loadQueue(token);
  };

  const handleStartSpeaking = async (item: QueueItem) => {
    if (!token || !courseId) {
      return;
    }
    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/speaking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ studentId: item.studentId }),
    });
    if (!response.ok) {
      setErrorMessage("移至發言區塊失敗，請稍後再試。");
      return;
    }

    setCurrentSpeaker(item);
    setQueue((prev) => prev.filter((row) => row.id !== item.id));
  };

  const handleScoreInputWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    event.preventDefault();
    setInputScore((prev) => {
      if (event.deltaY < 0) {
        return Math.min(100, prev + 1);
      }
      return Math.max(0, prev - 1);
    });
  };

  const handleSubmitScore = async () => {
    if (!token || !courseId || !currentSpeaker) {
      return;
    }
    setSavingScore(true);
    setErrorMessage(null);
    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/scores`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentId: currentSpeaker.studentId,
        score: Math.max(0, Math.min(100, Math.floor(inputScore))),
      }),
    });
    setSavingScore(false);

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      setErrorMessage(err.message || "給分失敗，請稍後再試。");
      return;
    }

    await loadDailyScores(token);
    setScoringModalOpen(false);
    setCurrentSpeaker(null);
  };

  const handleDeleteScore = async (scoreId: string) => {
    if (!token || !courseId) {
      return;
    }
    setDeletingScoreId(scoreId);
    setErrorMessage(null);
    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/scores/${scoreId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    setDeletingScoreId(null);

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      setErrorMessage(err.message || "刪除給分失敗，請稍後再試。");
      return;
    }

    await loadDailyScores(token);
  };

  const handleEndCourse = async () => {
    if (!teacherId || !token || !courseId) {
      setErrorMessage("老師登入資訊已失效，請重新登入。");
      return;
    }

    setErrorMessage(null);

    try {
      const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: false }),
      });

      if (!response.ok) {
        setErrorMessage("下課失敗，請稍後再試。");
        return;
      }

      router.push("/teacher/dashboard");
    } catch {
      setErrorMessage("無法連線到後端服務，請確認 backend 是否啟動。");
    }
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-100 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-slate-800">{courseTitle} - 課程頁面</h1>
              <p className="mt-1 text-sm text-slate-500">學生舉手後會依照先後順序顯示在下方名單。</p>
              <p className="mt-1 text-sm font-semibold text-indigo-600">
                報告順序：{reportOrder.length > 0 ? reportOrder.join(" → ") : "尚未設定"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => token && void loadQueue(token, { showRefreshing: true })}
                className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
              >
                {refreshing ? "更新中..." : "重新整理"}
              </button>
              <button
                type="button"
                onClick={handleClearQueue}
                className="rounded-xl border border-amber-200 px-4 py-2 font-semibold text-amber-700 hover:bg-amber-50"
              >
                清空舉手
              </button>
              <button
                type="button"
                onClick={handleEndCourse}
                className="rounded-xl bg-rose-600 px-4 py-2 font-bold text-white hover:bg-rose-700"
              >
                下課
              </button>
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold text-indigo-600">{queueCountText}</p>
          {errorMessage && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </p>
          )}
        </header>

        <section className="rounded-2xl border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">置頂發言區塊</h2>
          {!currentSpeaker ? (
            <p className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500">
              尚未選擇發言學生
            </p>
          ) : (
            <article className="mt-3 flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
              <div>
                <p className="text-sm font-bold text-indigo-600">目前發言學生</p>
                <h3 className="text-xl font-black text-slate-800">{currentSpeaker.studentName}</h3>
                <p className="mt-1 text-sm text-slate-600">{currentSpeaker.studentNo}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInputScore(0);
                  setScoringModalOpen(true);
                }}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white hover:bg-indigo-700"
              >
                給分
              </button>
            </article>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3">
            {queue.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center font-semibold text-slate-500">
                目前還沒有學生舉手
              </div>
            ) : (
              queue.map((item, index) => (
                <article
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5"
                >
                  <div>
                    <p className="text-sm font-bold text-indigo-600">第 {index + 1} 位</p>
                    <h2 className="text-lg font-bold text-slate-800">{item.studentName}</h2>
                    <p className="mt-1 text-sm text-slate-500">{item.studentNo}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => void handleStartSpeaking(item)}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      發言
                    </button>
                    <p className="text-xs font-semibold text-slate-500">
                      {new Date(item.raisedAt).toLocaleTimeString("zh-TW", { hour12: false })}
                    </p>
                  </div>
                </article>
              ))
            )}
          </div>

          <aside className="rounded-2xl border border-slate-100 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-800">當日得分版</h2>
            <div className="mt-3 space-y-2">
              {scoreboard.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
                  今日尚無得分紀錄
                </p>
              ) : (
                scoreboard.map((row, index) => (
                  <article key={row.studentUserId} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-indigo-600">#{index + 1}</p>
                      <p className="text-base font-black text-slate-800">{row.totalScore} 分</p>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{row.studentName}</p>
                    <p className="text-xs text-slate-500">{row.studentId}</p>
                  </article>
                ))
              )}
            </div>
            <h3 className="mt-6 text-base font-bold text-slate-800">給分歷程</h3>
            <div className="mt-2 space-y-2">
              {scoreHistory.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
                  今日尚無給分紀錄
                </p>
              ) : (
                scoreHistory.map((row) => (
                  <article key={row.scoreId} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">{row.studentName}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-indigo-600">+{row.score}</p>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteScore(row)}
                          disabled={deletingScoreId === row.scoreId}
                          className="rounded border border-rose-200 px-2 py-0.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          {deletingScoreId === row.scoreId ? "刪除中" : "刪除"}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {row.studentId} ・ {new Date(row.awardedAt).toLocaleTimeString("zh-TW", { hour12: false })}
                    </p>
                  </article>
                ))
              )}
            </div>
          </aside>
        </section>
      </div>

      {scoringModalOpen && currentSpeaker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onWheel={(event) => event.preventDefault()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-black text-slate-800">給分</h2>
            <p className="mt-1 text-sm text-slate-600">
              {currentSpeaker.studentName}（{currentSpeaker.studentNo}）
            </p>
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              分數（可鍵盤輸入，或滑鼠滾輪加減 1 分）
              <input
                type="number"
                min={0}
                max={100}
                value={inputScore}
                onChange={(event) => setInputScore(Number(event.target.value))}
                onWheel={handleScoreInputWheel}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setScoringModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitScore()}
                disabled={savingScore}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
              >
                {savingScore ? "儲存中..." : "確認給分"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteScore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-black text-slate-800">刪除給分確認</h2>
            <p className="mt-2 text-sm text-slate-600">
              確定要刪除這筆給分嗎？
              <br />
              {pendingDeleteScore.studentName}（{pendingDeleteScore.studentId}）+{pendingDeleteScore.score} 分
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteScore(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = pendingDeleteScore;
                  setPendingDeleteScore(null);
                  if (!target) {
                    return;
                  }
                  await handleDeleteScore(target.scoreId);
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
