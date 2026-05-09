"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getBackendApiBaseUrl, getBackendToken } from "@/lib/backend-auth";

type HandRaiseMode = "individual" | "group";

function formatHandRaiseQueueLabel(reportOrder: string[], groupName: string | null, studentName: string): string {
  if (!groupName) {
    return studentName;
  }
  const idx = reportOrder.indexOf(groupName);
  if (idx >= 0) {
    return `第 ${idx + 1} 組－${studentName}`;
  }
  return `${groupName}－${studentName}`;
}

type QueueItem = {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  raisedAt: string;
  groupName: string | null;
};

type LoadQueueOptions = {
  silent?: boolean;
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

type ActiveGroupScoreRoundDto = {
  id: string;
  speakerStudentId: string;
  speakerName: string;
  teacherScore: number | null;
  teacherSubmitted: boolean;
  leadersRequired: number;
  leadersSubmitted: number;
  needMyLeaderVote: boolean;
};

type QueueResponse = {
  course: {
    id: string;
    title: string;
    courseCode: string;
    isActive: boolean;
    teacherId: string;
    handRaiseMode: HandRaiseMode;
    reportOrder: string[];
    currentSpeaker: {
      id: string;
      studentId: string;
      name: string | null;
      groupName?: string | null;
    } | null;
  };
  queue: {
    id: string;
    createdAt: string;
    groupName?: string | null;
    student: {
      id: string;
      studentId: string;
      name: string | null;
    };
  }[];
  viewer?: {
    groupName: string | null;
    isLeader: boolean;
  };
  activeGroupScoreRound?: ActiveGroupScoreRoundDto | null;
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

type GroupScoreboardItem = {
  groupKey: string;
  groupName: string;
  totalScore: number;
};

type GroupHistoryItem = {
  scoreId: string;
  groupKey: string;
  groupName: string;
  score: number;
  awardedAt: string;
};

type DailyScoreResponse = {
  date: string;
  scoreKind: "individual" | "group";
  scoreboard: ScoreboardItem[];
  history: ScoreHistoryItem[];
  groupScoreboard: GroupScoreboardItem[];
  groupHistory: GroupHistoryItem[];
};

type NoticeState =
  | {
      text: string;
      tone: "success" | "speaking" | "score";
    }
  | null;

export default function HandRaisePage() {
  const router = useRouter();
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const [token, setToken] = useState<string | null>(null);
  const [studentUserId, setStudentUserId] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState("課程");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreboardItem[]>([]);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryItem[]>([]);
  const [groupScoreboard, setGroupScoreboard] = useState<GroupScoreboardItem[]>([]);
  const [groupHistory, setGroupHistory] = useState<GroupHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const scoreNoticeTimerRef = useRef<number | null>(null);
  const latestSeenScoreIdRef = useRef<string | null>(null);
  const [handRaiseMode, setHandRaiseMode] = useState<HandRaiseMode>("individual");
  const [reportOrder, setReportOrder] = useState<string[]>([]);
  const [myGroupName, setMyGroupName] = useState<string | null>(null);
  const [myIsLeader, setMyIsLeader] = useState(false);
  const [activeGroupScoreRound, setActiveGroupScoreRound] = useState<ActiveGroupScoreRoundDto | null>(null);
  const [leaderInputScore, setLeaderInputScore] = useState(0);
  const [leaderSaving, setLeaderSaving] = useState(false);
  const leaderVoteRoundIdRef = useRef<string | null>(null);

  const dm = handRaiseMode === "group";
  const needLeaderVoteModal = dm && Boolean(activeGroupScoreRound?.needMyLeaderVote);

  const myOrder = useMemo(() => {
    if (!studentUserId) {
      return null;
    }
    const index = queue.findIndex((item) => item.studentId === studentUserId);
    return index >= 0 ? index + 1 : null;
  }, [queue, studentUserId]);

  const handRaiseGroupKey = (groupName: string | null, userId: string) => groupName ?? `__ungrouped__:${userId}`;

  const groupPeerHasRaised = useMemo(() => {
    if (handRaiseMode !== "group" || !studentUserId) {
      return false;
    }
    const myKey = handRaiseGroupKey(myGroupName, studentUserId);
    return queue.some((item) => {
      if (item.studentId === studentUserId) {
        return false;
      }
      return handRaiseGroupKey(item.groupName, item.studentId) === myKey;
    });
  }, [handRaiseMode, myGroupName, queue, studentUserId]);

  const myGroupKey = useMemo(() => {
    if (!studentUserId) {
      return null;
    }
    return handRaiseGroupKey(myGroupName, studentUserId);
  }, [myGroupName, studentUserId]);

  useEffect(() => {
    latestSeenScoreIdRef.current = null;
  }, [courseId, handRaiseMode]);

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
      setGroupScoreboard(json.groupScoreboard ?? []);
      setGroupHistory(json.groupHistory ?? []);

      if (!studentUserId) {
        return;
      }

      if (json.scoreKind === "group") {
        const myKey = handRaiseGroupKey(myGroupName, studentUserId);
        const latestMyGroup = (json.groupHistory ?? []).find((item) => item.groupKey === myKey);
        if (!latestMyGroup) {
          return;
        }
        if (latestSeenScoreIdRef.current === null) {
          latestSeenScoreIdRef.current = latestMyGroup.scoreId;
          return;
        }
        if (latestSeenScoreIdRef.current === latestMyGroup.scoreId) {
          return;
        }
        latestSeenScoreIdRef.current = latestMyGroup.scoreId;
        setNotice({ text: `你的組別獲得 ${latestMyGroup.score} 分（組別計分）`, tone: "score" });
        if (scoreNoticeTimerRef.current) {
          window.clearTimeout(scoreNoticeTimerRef.current);
        }
        scoreNoticeTimerRef.current = window.setTimeout(() => {
          setNotice((prev) => (prev?.tone === "score" ? null : prev));
        }, 3000);
        return;
      }

      const latestMyScore = (json.history ?? []).find((item) => item.studentUserId === studentUserId);
      if (!latestMyScore) {
        return;
      }

      if (latestSeenScoreIdRef.current === null) {
        latestSeenScoreIdRef.current = latestMyScore.scoreId;
        return;
      }
      if (latestSeenScoreIdRef.current === latestMyScore.scoreId) {
        return;
      }

      latestSeenScoreIdRef.current = latestMyScore.scoreId;
      setNotice({ text: `已獲得 ${latestMyScore.score} 分`, tone: "score" });
      if (scoreNoticeTimerRef.current) {
        window.clearTimeout(scoreNoticeTimerRef.current);
      }
      scoreNoticeTimerRef.current = window.setTimeout(() => {
        setNotice((prev) => (prev?.tone === "score" ? null : prev));
      }, 3000);
    },
    [courseId, myGroupName, studentUserId],
  );

  const loadQueue = useCallback(
    async (authToken: string, options?: LoadQueueOptions) => {
      if (!courseId) {
        return;
      }

      const silent = options?.silent ?? false;

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
            router.replace("/student/dashboard");
            return;
          }
          setErrorMessage("讀取舉手名單失敗。");
          return;
        }

        const json = (await response.json()) as QueueResponse;
        if (!json.course.isActive) {
          setNotice(null);
          router.replace("/student/dashboard");
          return;
        }
        setCourseTitle(json.course.title || "課程");
        setHandRaiseMode(json.course.handRaiseMode === "group" ? "group" : "individual");
        setReportOrder(json.course.reportOrder ?? []);
        setMyGroupName(json.viewer?.groupName ?? null);
        setMyIsLeader(json.viewer?.isLeader ?? false);
        const roundForGroup =
          json.course.handRaiseMode === "group" ? (json.activeGroupScoreRound ?? null) : null;
        setActiveGroupScoreRound(roundForGroup);
        if (roundForGroup?.needMyLeaderVote) {
          if (leaderVoteRoundIdRef.current !== roundForGroup.id) {
            leaderVoteRoundIdRef.current = roundForGroup.id;
            setLeaderInputScore(0);
          }
        } else {
          leaderVoteRoundIdRef.current = null;
        }
        setQueue(
          json.queue.map((row) => ({
            id: row.id,
            studentId: row.student.id,
            studentNo: row.student.studentId,
            studentName: row.student.name ?? "未命名同學",
            raisedAt: row.createdAt,
            groupName: row.groupName ?? null,
          })),
        );
        const currentSpeaker = json.course.currentSpeaker;
        if (currentSpeaker) {
          const speakingText =
            studentUserId && currentSpeaker.id === studentUserId
              ? "發言中..."
              : `${currentSpeaker.name ?? currentSpeaker.studentId ?? "該同學"}發言中`;
          setNotice((prev) => (prev?.tone === "score" ? prev : { text: speakingText, tone: "speaking" }));
        } else {
          setNotice((prev) => (prev?.tone === "speaking" ? null : prev));
        }
        await loadDailyScores(authToken);
      } catch {
        if (!silent) {
          setErrorMessage("無法連線到後端服務，請稍後再試。");
        }
      }
    },
    [courseId, loadDailyScores, router, studentUserId],
  );

  useEffect(() => {
    const bootstrap = async () => {
      if (!courseId) {
        router.replace("/student/dashboard");
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
      if (me.user.role !== "student") {
        if (me.user.role === "admin") {
          router.replace("/admin/dashboard");
        } else {
          router.replace("/teacher/dashboard");
        }
        return;
      }

      if (me.user.mustChangePassword) {
        router.replace("/change-password");
        return;
      }

      setStudentUserId(me.user.id);
      await loadQueue(saved);
      setLoading(false);
    };

    void bootstrap();
  }, [courseId, loadQueue, router]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const timer = setInterval(() => {
      void loadQueue(token, { silent: true });
    }, 2000);

    return () => clearInterval(timer);
  }, [loadQueue, token]);

  useEffect(() => {
    return () => {
      if (scoreNoticeTimerRef.current) {
        window.clearTimeout(scoreNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!needLeaderVoteModal) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [needLeaderVoteModal]);

  const handleLeaderScoreWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    event.preventDefault();
    setLeaderInputScore((prev) => {
      if (event.deltaY < 0) {
        return Math.min(100, prev + 1);
      }
      return Math.max(0, prev - 1);
    });
  };

  const handleSubmitLeaderScore = async () => {
    if (!token || !courseId || !activeGroupScoreRound) {
      return;
    }
    setLeaderSaving(true);
    setErrorMessage(null);
    const scoreVal = Math.max(0, Math.min(100, Math.floor(leaderInputScore)));
    const response = await fetch(
      `${getBackendApiBaseUrl()}/courses/${courseId}/group-score-rounds/${activeGroupScoreRound.id}/leader-vote`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ score: scoreVal }),
      },
    );
    setLeaderSaving(false);
    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string };
      setErrorMessage(err.message || "提交組長評分失敗。");
      return;
    }
    await loadQueue(token);
    await loadDailyScores(token);
  };

  const handleRaiseHand = async () => {
    if (!studentUserId || !courseId || !token) {
      return;
    }

    setRaising(true);
    setErrorMessage(null);
    setNotice(null);

    const alreadyRaised = queue.some((item) => item.studentId === studentUserId);
    if (alreadyRaised) {
      setErrorMessage("你已在舉手名單中。");
      setRaising(false);
      return;
    }

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/hand-raises`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 409) {
        const err = (await response.json().catch(() => ({}))) as { message?: string };
        setErrorMessage(err.message || "同組已有成員舉手。");
      } else {
        setErrorMessage("舉手失敗，請稍後重試。");
      }
      setRaising(false);
      return;
    }

    setNotice({ text: "舉手成功，老師已收到。", tone: "success" });
    await loadQueue(token);
    setRaising(false);
  };

  const handleCancelRaise = async () => {
    if (!studentUserId || !courseId || !token) {
      return;
    }

    setCancelling(true);
    setErrorMessage(null);
    setNotice(null);

    const response = await fetch(`${getBackendApiBaseUrl()}/courses/${courseId}/hand-raises/self`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setErrorMessage("取消舉手失敗，請稍後重試。");
      setCancelling(false);
      return;
    }

    setNotice({ text: "已取消舉手。", tone: "success" });
    await loadQueue(token);
    setCancelling(false);
  };

  if (loading) {
    return <main className="p-8 text-center font-semibold text-slate-600">讀取中...</main>;
  }

  return (
    <main className={dm ? "session-group-dark p-6" : "min-h-screen bg-slate-50 p-6"}>
      <div className="mx-auto max-w-6xl space-y-6">
        <header className={dm ? "g-panel p-6" : "rounded-2xl border border-slate-100 bg-white p-6"}>
          <h1 className={`text-2xl font-black ${dm ? "g-heading" : "text-slate-800"}`}>{courseTitle} - 舉手頁面</h1>
          <p className={`mt-1 text-sm ${dm ? "g-muted" : "text-slate-500"}`}>
            {handRaiseMode === "group"
              ? "分組模式（暗色畫面）：同組僅一人可舉手；老師給分後各組組長須評分。組別計分與個人計分為不同累計，此處僅顯示組別總分榜。"
              : "請按「我要舉手」，系統會依照先後順序排隊。"}
          </p>
          {dm && myIsLeader && (
            <p className="mt-2 text-xs font-semibold text-amber-300">你是組長：老師送出評分後，請於跳出視窗為發言組評分。</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRaiseHand}
              disabled={raising || Boolean(myOrder) || groupPeerHasRaised}
              className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {raising
                ? "送出中..."
                : myOrder
                  ? "已舉手"
                  : groupPeerHasRaised
                    ? "同組已有成員舉手"
                    : "我要舉手"}
            </button>
            <button
              type="button"
              onClick={handleCancelRaise}
              disabled={cancelling || !myOrder}
              className={
                dm
                  ? "rounded-xl border g-border-btn px-4 py-2 font-semibold hover:bg-slate-800 disabled:opacity-60"
                  : "rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              }
            >
              {cancelling ? "取消中..." : "取消舉手"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/student/dashboard")}
              className={
                dm
                  ? "rounded-xl border g-border-btn px-4 py-2 font-semibold hover:bg-slate-800"
                  : "rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100"
              }
            >
              回課程清單
            </button>
          </div>
          {myOrder && (
            <p className={`mt-3 text-sm font-bold ${dm ? "text-indigo-300" : "text-indigo-600"}`}>
              你目前排在第 {myOrder} 位。
            </p>
          )}
          {errorMessage && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {errorMessage}
            </p>
          )}
          {notice && (
            <p
              className={`mt-3 rounded-xl px-4 py-3 text-sm font-semibold ${
                notice.tone === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : notice.tone === "speaking"
                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                    : "border border-indigo-200 bg-indigo-50 text-indigo-700"
              }`}
            >
              {notice.text}
            </p>
          )}
        </header>

        <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3">
            {queue.length === 0 ? (
              <div
                className={
                  dm
                    ? "g-panel-dashed p-8 text-center font-semibold g-muted"
                    : "rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center font-semibold text-slate-500"
                }
              >
                目前尚無舉手紀錄
              </div>
            ) : (
              queue.map((item, index) => (
                <article
                  key={item.id}
                  className={
                    dm
                      ? "flex items-center justify-between g-panel p-5"
                      : "flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5"
                  }
                >
                  <div>
                    <p className={`text-sm font-bold ${dm ? "text-indigo-300" : "text-indigo-600"}`}>第 {index + 1} 位</p>
                    <h2 className={`text-lg font-bold ${dm ? "g-heading" : "text-slate-800"}`}>
                      {handRaiseMode === "group"
                        ? formatHandRaiseQueueLabel(reportOrder, item.groupName, item.studentName)
                        : item.studentName}
                    </h2>
                    <p className={`mt-1 text-sm ${dm ? "g-muted" : "text-slate-500"}`}>{item.studentNo}</p>
                    {handRaiseMode === "individual" && (
                      <p className={`mt-1 text-xs ${dm ? "g-muted" : "text-slate-500"}`}>
                        {item.groupName ? `組別：${item.groupName}` : "未分組"}
                      </p>
                    )}
                  </div>
                  <p className={`text-xs font-semibold ${dm ? "g-muted" : "text-slate-500"}`}>
                    {new Date(item.raisedAt).toLocaleTimeString("zh-TW", { hour12: false })}
                  </p>
                </article>
              ))
            )}
          </div>

          <aside className={dm ? "g-panel p-5" : "rounded-2xl border border-slate-100 bg-white p-5"}>
            {dm ? (
              <>
                <h2 className="text-lg font-bold g-heading">今日組別得分榜</h2>
                <p className="mt-1 text-xs g-muted">與個人模式下的「個人計分」分開累計。</p>
                <div className="mt-3 space-y-2">
                  {groupScoreboard.length === 0 ? (
                    <p className="g-panel-dashed px-3 py-4 text-center text-sm g-muted">今日尚無組別得分紀錄</p>
                  ) : (
                    groupScoreboard.map((row, index) => {
                      const mine = myGroupKey !== null && row.groupKey === myGroupKey;
                      return (
                        <article
                          key={row.groupKey}
                          className={`rounded-xl border px-3 py-2.5 ${
                            mine
                              ? "border-amber-400/70 bg-slate-800/90 ring-1 ring-amber-400/40"
                              : "border-slate-600 bg-slate-800/80"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-indigo-300">#{index + 1}</p>
                            <p className="text-base font-black g-heading">{row.totalScore} 分</p>
                          </div>
                          <p className="mt-1 text-sm font-semibold g-heading">{row.groupName}</p>
                          {mine && <p className="mt-1 text-xs font-semibold text-amber-300">你的組別</p>}
                        </article>
                      );
                    })
                  )}
                </div>
                <h3 className="mt-6 text-base font-bold g-heading">組別得分歷程</h3>
                <div className="mt-2 space-y-2">
                  {groupHistory.length === 0 ? (
                    <p className="g-panel-dashed px-3 py-3 text-center text-sm g-muted">今日尚無組別得分紀錄</p>
                  ) : (
                    groupHistory.map((row) => {
                      const mine = myGroupKey !== null && row.groupKey === myGroupKey;
                      return (
                        <article
                          key={row.scoreId}
                          className={`rounded-xl border px-3 py-2.5 ${
                            mine
                              ? "border-amber-400/50 bg-slate-800/70"
                              : "border-slate-600 bg-slate-800/60"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold g-heading">{row.groupName}</p>
                            <p className="text-sm font-black text-indigo-300">+{row.score}</p>
                          </div>
                          <p className="text-xs g-muted">
                            {new Date(row.awardedAt).toLocaleTimeString("zh-TW", { hour12: false })}
                          </p>
                        </article>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-slate-800">今日得分榜</h2>
                <div className="mt-3 space-y-2">
                  {scoreboard.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
                      今日尚無得分紀錄
                    </p>
                  ) : (
                    scoreboard.map((row, index) => (
                      <article
                        key={row.studentUserId}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                      >
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
                <h3 className="mt-6 text-base font-bold text-slate-800">得分歷程</h3>
                <div className="mt-2 space-y-2">
                  {scoreHistory.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm text-slate-500">
                      今日尚無得分紀錄
                    </p>
                  ) : (
                    scoreHistory.map((row) => (
                      <article key={row.scoreId} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800">{row.studentName}</p>
                          <p className="text-sm font-black text-indigo-600">+{row.score}</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          {row.studentId} ・ {new Date(row.awardedAt).toLocaleTimeString("zh-TW", { hour12: false })}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </>
            )}
          </aside>
        </section>
      </div>

      {needLeaderVoteModal && activeGroupScoreRound && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onWheel={(event) => event.preventDefault()}
        >
          <div className={`w-full max-w-sm rounded-2xl p-5 shadow-xl ${dm ? "g-modal" : "bg-white"}`}>
            <h2 className={`text-lg font-black ${dm ? "g-heading" : "text-slate-800"}`}>組長評分</h2>
            <p className={`mt-1 text-sm ${dm ? "g-muted" : "text-slate-600"}`}>
              請為發言組「{activeGroupScoreRound.speakerName}」評分（0–100）。將與老師分數及其他組長分數加總（單次合計上限 100 分），並以「組別計分」計入發言組總分。
            </p>
            <label className={`mt-4 block text-sm font-semibold ${dm ? "text-slate-200" : "text-slate-700"}`}>
              分數
              <input
                type="number"
                min={0}
                max={100}
                value={leaderInputScore}
                onChange={(event) => setLeaderInputScore(Number(event.target.value))}
                onWheel={handleLeaderScoreWheel}
                className={
                  dm
                    ? "g-input mt-1 w-full rounded-xl border px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    : "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-black outline-none focus:ring-2 focus:ring-indigo-500"
                }
              />
            </label>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSubmitLeaderScore()}
                disabled={leaderSaving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:bg-slate-500"
              >
                {leaderSaving ? "送出中..." : "送出評分"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
