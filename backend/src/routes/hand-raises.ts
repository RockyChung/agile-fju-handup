import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";

const courseIdParamSchema = z.object({
  courseId: z.string().uuid("Invalid course id"),
});

const handRaiseParamSchema = z.object({
  courseId: z.string().uuid("Invalid course id"),
  handRaiseId: z.string().uuid("Invalid hand raise id"),
});
const scoreParamSchema = z.object({
  courseId: z.string().uuid("Invalid course id"),
  scoreId: z.string().uuid("Invalid score id"),
});
const groupScoreParamSchema = z.object({
  courseId: z.string().uuid("Invalid course id"),
  groupScoreId: z.string().uuid("Invalid group score id"),
});
const createScoreBodySchema = z.object({
  studentId: z.string().uuid("Invalid student id"),
  score: z.number().int().min(0).max(100),
});
const batchScoreBodySchema = z.object({
  studentIds: z.array(z.string().uuid("Invalid student id")).min(1).max(200),
  score: z.number().int().min(0).max(100),
});
const setSpeakingBodySchema = z.object({
  studentId: z.string().uuid("Invalid student id"),
});
const dailyScoreQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date format must be YYYY-MM-DD")
    .optional(),
});
const groupRoundIdParamSchema = z.object({
  courseId: z.string().uuid("Invalid course id"),
  roundId: z.string().uuid("Invalid round id"),
});
const createGroupScoreRoundBodySchema = z.object({
  speakerStudentId: z.string().uuid("Invalid student id"),
});
const teacherGroupRoundScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
});
const leaderGroupRoundVoteSchema = z.object({
  score: z.number().int().min(0).max(100),
});

async function getCourse(app: FastifyInstance, courseId: string) {
  return app.prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      courseCode: true,
      isActive: true,
      handRaiseMode: true,
      teacherId: true,
      reportOrder: true,
      currentSpeakerId: true,
      currentSpeaker: {
        select: {
          id: true,
          studentId: true,
          name: true,
          courseStudents: {
            where: { courseId },
            select: { groupName: true },
            take: 1,
          },
        },
      },
    },
  });
}

async function isEnrolled(app: FastifyInstance, courseId: string, studentId: string) {
  const row = await app.prisma.courseStudent.findUnique({
    where: {
      courseId_studentId: {
        courseId,
        studentId,
      },
    },
    select: { courseId: true },
  });

  return !!row;
}

function handRaiseGroupKey(groupName: string | null, studentUserId: string): string {
  return groupName ?? `__ungrouped__:${studentUserId}`;
}

async function getEligibleLeaderUserIds(app: FastifyInstance, courseId: string, speakerStudentId: string): Promise<string[]> {
  const speakerRow = await app.prisma.courseStudent.findUnique({
    where: { courseId_studentId: { courseId, studentId: speakerStudentId } },
    select: { groupName: true },
  });
  const speakerKey = handRaiseGroupKey(speakerRow?.groupName ?? null, speakerStudentId);
  const leaders = await app.prisma.courseStudent.findMany({
    where: { courseId, isLeader: true },
    select: { studentId: true, groupName: true },
  });
  return leaders
    .filter((row) => row.studentId !== speakerStudentId)
    .filter((row) => handRaiseGroupKey(row.groupName ?? null, row.studentId) !== speakerKey)
    .map((row) => row.studentId);
}

async function tryFinalizeGroupScoreRound(app: FastifyInstance, roundId: string): Promise<boolean> {
  const roundPreview = await app.prisma.courseGroupScoreRound.findUnique({
    where: { id: roundId },
    include: { leaderVotes: true },
  });
  if (!roundPreview || roundPreview.status !== "open" || roundPreview.teacherScore === null) {
    return false;
  }

  const eligibleIds = await getEligibleLeaderUserIds(app, roundPreview.courseId, roundPreview.speakerStudentId);
  const voted = new Set(roundPreview.leaderVotes.map((v) => v.leaderId));
  if (eligibleIds.length > 0) {
    for (const id of eligibleIds) {
      if (!voted.has(id)) {
        return false;
      }
    }
  }

  const leaderSum = roundPreview.leaderVotes
    .filter((v) => eligibleIds.includes(v.leaderId))
    .reduce((sum, v) => sum + v.score, 0);
  const total = Math.max(0, Math.min(100, roundPreview.teacherScore + leaderSum));

  try {
    await app.prisma.$transaction(async (tx) => {
      const fresh = await tx.courseGroupScoreRound.findUnique({ where: { id: roundId } });
      if (!fresh || fresh.status !== "open" || fresh.teacherScore === null) {
        throw new Error("stale_round");
      }
      const courseRow = await tx.course.findUnique({
        where: { id: roundPreview.courseId },
        select: { reportOrder: true },
      });
      const reportOrder = courseRow?.reportOrder ?? [];
      const speakerRow = await tx.courseStudent.findUnique({
        where: {
          courseId_studentId: {
            courseId: roundPreview.courseId,
            studentId: roundPreview.speakerStudentId,
          },
        },
        select: { groupName: true },
      });
      const groupName = speakerRow?.groupName ?? null;
      const groupKey = handRaiseGroupKey(groupName, roundPreview.speakerStudentId);
      let groupDisplayName = "未分組";
      if (groupName) {
        const idx = reportOrder.indexOf(groupName);
        groupDisplayName = idx >= 0 ? `第 ${idx + 1} 組（${groupName}）` : groupName;
      }
      await tx.courseGroupScore.create({
        data: {
          courseId: roundPreview.courseId,
          roundId: roundId,
          groupKey,
          groupDisplayName,
          score: total,
        },
      });
      await tx.course.update({
        where: { id: roundPreview.courseId },
        data: { currentSpeakerId: null },
      });
      await tx.courseGroupScoreRound.update({
        where: { id: roundId },
        data: { status: "finalized", finalizedAt: new Date() },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "stale_round") {
      return false;
    }
    throw e;
  }
  return true;
}

function toTaipeiDayRange(dateText?: string): { date: string; startUtc: Date; endUtc: Date } {
  const target = dateText ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const [year, month, day] = target.split("-").map(Number);
  const startUtc = new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month - 1, day + 1, -8, 0, 0, 0));
  return {
    date: target,
    startUtc,
    endUtc,
  };
}

export const handRaiseRoutes: FastifyPluginAsync = async (app) => {
  // Queue view:
  // - admin: any course
  // - teacher: own course
  // - student: only courses they enrolled in
  app.get("/courses/:courseId/hand-raises", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const params = courseIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const course = await getCourse(app, params.data.courseId);
    if (!course) {
      return reply.status(404).send({ message: "Course not found" });
    }

    if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
      return reply.status(403).send({ message: "Forbidden" });
    }

    if (authUser.role === "student") {
      const enrolled = await isEnrolled(app, course.id, authUser.id);
      if (!enrolled) {
        return reply.status(403).send({ message: "Forbidden" });
      }
    }

    const queue = await app.prisma.handRaise.findMany({
      where: { courseId: course.id },
      orderBy: { createdAt: "asc" },
      include: {
        student: {
          select: {
            id: true,
            studentId: true,
            name: true,
            courseStudents: {
              where: { courseId: course.id },
              select: { groupName: true },
              take: 1,
            },
          },
        },
      },
    });

    const { currentSpeaker: currentSpeakerRaw, ...courseFields } = course;
    const coursePayload = {
      ...courseFields,
      currentSpeaker: currentSpeakerRaw
        ? {
            id: currentSpeakerRaw.id,
            studentId: currentSpeakerRaw.studentId,
            name: currentSpeakerRaw.name,
            groupName: currentSpeakerRaw.courseStudents[0]?.groupName ?? null,
          }
        : null,
    };

    let viewer: { groupName: string | null; isLeader: boolean } | undefined;
    if (authUser.role === "student") {
      const enrollment = await app.prisma.courseStudent.findUnique({
        where: { courseId_studentId: { courseId: course.id, studentId: authUser.id } },
        select: { groupName: true, isLeader: true },
      });
      viewer = {
        groupName: enrollment?.groupName ?? null,
        isLeader: enrollment?.isLeader ?? false,
      };
    }

    let activeGroupScoreRound: {
      id: string;
      speakerStudentId: string;
      speakerName: string;
      teacherScore: number | null;
      teacherSubmitted: boolean;
      leadersRequired: number;
      leadersSubmitted: number;
      needMyLeaderVote: boolean;
    } | null = null;

    if (course.handRaiseMode === "group") {
      const openRound = await app.prisma.courseGroupScoreRound.findFirst({
        where: { courseId: course.id, status: "open" },
        include: { leaderVotes: true },
      });
      if (openRound) {
        const eligibleIds = await getEligibleLeaderUserIds(app, course.id, openRound.speakerStudentId);
        const sp = await app.prisma.user.findUnique({
          where: { id: openRound.speakerStudentId },
          select: { name: true },
        });
        const voted = new Set(openRound.leaderVotes.map((v) => v.leaderId));
        const leadersSubmitted = eligibleIds.filter((id) => voted.has(id)).length;
        let needMyLeaderVote = false;
        if (authUser.role === "student") {
          needMyLeaderVote = eligibleIds.includes(authUser.id) && !voted.has(authUser.id);
        }
        activeGroupScoreRound = {
          id: openRound.id,
          speakerStudentId: openRound.speakerStudentId,
          speakerName: sp?.name ?? "未命名同學",
          teacherScore: openRound.teacherScore,
          teacherSubmitted: openRound.teacherScore !== null,
          leadersRequired: eligibleIds.length,
          leadersSubmitted,
          needMyLeaderVote,
        };
      }
    }

    return reply.send({
      course: coursePayload,
      queue: queue.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        groupName: row.student.courseStudents[0]?.groupName ?? null,
        student: {
          id: row.student.id,
          studentId: row.student.studentId,
          name: row.student.name,
        },
      })),
      ...(viewer ? { viewer } : {}),
      ...(course.handRaiseMode === "group" ? { activeGroupScoreRound } : {}),
    });
  });

  app.post(
    "/courses/:courseId/speaking",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = courseIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }
      const body = setSpeakingBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ message: "Validation failed", issues: body.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }
      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const enrolled = await isEnrolled(app, course.id, body.data.studentId);
      if (!enrolled) {
        return reply.status(400).send({ message: "只能指定本課程學生發言" });
      }

      const updated = await app.prisma.$transaction(async (tx) => {
        await tx.courseGroupScoreRound.updateMany({
          where: { courseId: course.id, status: "open" },
          data: { status: "cancelled" },
        });
        await tx.handRaise.deleteMany({
          where: {
            courseId: course.id,
            studentId: body.data.studentId,
          },
        });
        return tx.course.update({
          where: { id: course.id },
          data: {
            currentSpeakerId: body.data.studentId,
          },
          select: {
            id: true,
            currentSpeaker: {
              select: {
                id: true,
                studentId: true,
                name: true,
              },
            },
          },
        });
      });

      return reply.send({
        courseId: updated.id,
        currentSpeaker: updated.currentSpeaker,
      });
    },
  );

  // Student raise hand for own enrolled active course.
  app.post("/courses/:courseId/hand-raises", { preHandler: app.requireRole("student") }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const params = courseIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const course = await getCourse(app, params.data.courseId);
    if (!course) {
      return reply.status(404).send({ message: "Course not found" });
    }

    const enrolled = await isEnrolled(app, course.id, authUser.id);
    if (!enrolled) {
      return reply.status(403).send({ message: "Only enrolled students can raise hand" });
    }

    if (!course.isActive) {
      return reply.status(400).send({ message: "Course is not active" });
    }

    if (course.handRaiseMode === "group") {
      const myEnrollment = await app.prisma.courseStudent.findUnique({
        where: { courseId_studentId: { courseId: course.id, studentId: authUser.id } },
        select: { groupName: true },
      });
      const myKey = handRaiseGroupKey(myEnrollment?.groupName ?? null, authUser.id);

      const otherRaises = await app.prisma.handRaise.findMany({
        where: { courseId: course.id, studentId: { not: authUser.id } },
        include: {
          student: {
            select: {
              id: true,
              courseStudents: {
                where: { courseId: course.id },
                select: { groupName: true },
                take: 1,
              },
            },
          },
        },
      });

      for (const row of otherRaises) {
        const theirGroupName = row.student.courseStudents[0]?.groupName ?? null;
        const theirKey = handRaiseGroupKey(theirGroupName, row.studentId);
        if (theirKey === myKey) {
          return reply.status(409).send({ message: "同組已有成員舉手，無法重複舉手。" });
        }
      }
    }

    try {
      const handRaise = await app.prisma.handRaise.upsert({
        where: {
          courseId_studentId: {
            courseId: course.id,
            studentId: authUser.id,
          },
        },
        update: {},
        create: {
          courseId: course.id,
          studentId: authUser.id,
        },
      });

      return reply.status(201).send({ handRaise });
    } catch (error) {
      request.log.error(error);
      return reply.status(400).send({ message: "Failed to raise hand" });
    }
  });

  // Student cancels own hand raise in a course.
  app.delete("/courses/:courseId/hand-raises/self", { preHandler: app.requireRole("student") }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const params = courseIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const existing = await app.prisma.handRaise.findUnique({
      where: {
        courseId_studentId: {
          courseId: params.data.courseId,
          studentId: authUser.id,
        },
      },
      select: { id: true },
    });

    if (!existing) {
      return reply.status(404).send({ message: "Hand raise not found" });
    }

    await app.prisma.handRaise.delete({
      where: {
        courseId_studentId: {
          courseId: params.data.courseId,
          studentId: authUser.id,
        },
      },
    });

    return reply.status(204).send();
  });

  // Teacher/Admin removes a specific queue item.
  app.delete(
    "/courses/:courseId/hand-raises/:handRaiseId",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = handRaiseParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }

      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const existing = await app.prisma.handRaise.findUnique({
        where: { id: params.data.handRaiseId },
        select: { id: true, courseId: true },
      });

      if (!existing || existing.courseId !== course.id) {
        return reply.status(404).send({ message: "Hand raise not found" });
      }

      await app.prisma.handRaise.delete({
        where: { id: params.data.handRaiseId },
      });

      return reply.status(204).send();
    },
  );

  // Teacher/Admin pop next hand raise (FIFO).
  app.post(
    "/courses/:courseId/hand-raises/next",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = courseIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }

      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const next = await app.prisma.handRaise.findFirst({
        where: { courseId: course.id },
        orderBy: { createdAt: "asc" },
      });

      if (!next) {
        return reply.status(404).send({ message: "Queue is empty" });
      }

      await app.prisma.handRaise.delete({
        where: { id: next.id },
      });

      return reply.send({ popped: next });
    },
  );

  app.get(
    "/courses/:courseId/scores/daily",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = courseIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }
      const query = dailyScoreQuerySchema.safeParse(request.query ?? {});
      if (!query.success) {
        return reply.status(400).send({ message: "Validation failed", issues: query.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }
      if (authUser.role === "student") {
        const enrolled = await isEnrolled(app, course.id, authUser.id);
        if (!enrolled) {
          return reply.status(403).send({ message: "Forbidden" });
        }
      }
      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const dayRange = toTaipeiDayRange(query.data.date);

      if (course.handRaiseMode === "group") {
        const dayRows = await app.prisma.courseGroupScore.findMany({
          where: {
            courseId: course.id,
            awardedAt: {
              gte: dayRange.startUtc,
              lt: dayRange.endUtc,
            },
          },
          select: {
            id: true,
            groupKey: true,
            groupDisplayName: true,
            score: true,
            awardedAt: true,
          },
          orderBy: { awardedAt: "desc" },
        });
        const totals = new Map<string, number>();
        const label = new Map<string, string>();
        for (const row of dayRows) {
          totals.set(row.groupKey, (totals.get(row.groupKey) ?? 0) + row.score);
          if (!label.has(row.groupKey)) {
            label.set(row.groupKey, row.groupDisplayName);
          }
        }
        const groupScoreboard = [...totals.entries()]
          .map(([groupKey, totalScore]) => ({
            groupKey,
            groupName: label.get(groupKey) ?? groupKey,
            totalScore,
          }))
          .sort((a, b) => b.totalScore - a.totalScore);
        const groupHistory = dayRows.slice(0, 50).map((row) => ({
          scoreId: row.id,
          groupKey: row.groupKey,
          groupName: row.groupDisplayName,
          score: row.score,
          awardedAt: row.awardedAt,
        }));
        return reply.send({
          date: dayRange.date,
          scoreKind: "group" as const,
          scoreboard: [],
          history: [],
          groupScoreboard,
          groupHistory,
        });
      }

      const grouped = await app.prisma.courseScore.groupBy({
        by: ["studentId"],
        where: {
          courseId: course.id,
          awardedAt: {
            gte: dayRange.startUtc,
            lt: dayRange.endUtc,
          },
        },
        _sum: {
          score: true,
        },
        orderBy: {
          _sum: {
            score: "desc",
          },
        },
      });

      const studentIds = grouped.map((item) => item.studentId);
      const students = studentIds.length
        ? await app.prisma.user.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, studentId: true, name: true },
          })
        : [];
      const studentMap = new Map(students.map((item) => [item.id, item]));
      const historyRows = await app.prisma.courseScore.findMany({
        where: {
          courseId: course.id,
          awardedAt: {
            gte: dayRange.startUtc,
            lt: dayRange.endUtc,
          },
        },
        include: {
          student: {
            select: {
              id: true,
              studentId: true,
              name: true,
            },
          },
        },
        orderBy: {
          awardedAt: "desc",
        },
        take: 50,
      });

      return reply.send({
        date: dayRange.date,
        scoreKind: "individual" as const,
        scoreboard: grouped.map((item) => ({
          studentUserId: item.studentId,
          studentId: studentMap.get(item.studentId)?.studentId ?? "-",
          studentName: studentMap.get(item.studentId)?.name ?? "未命名同學",
          totalScore: item._sum.score ?? 0,
        })),
        history: historyRows.map((row) => ({
          scoreId: row.id,
          studentUserId: row.student.id,
          studentId: row.student.studentId,
          studentName: row.student.name ?? "未命名同學",
          score: row.score,
          awardedAt: row.awardedAt,
        })),
        groupScoreboard: [],
        groupHistory: [],
      });
    },
  );

  app.post(
    "/courses/:courseId/scores",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = courseIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }
      const body = createScoreBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ message: "Validation failed", issues: body.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }
      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }
      if (course.handRaiseMode === "group") {
        return reply.status(400).send({ message: "分組模式下使用組別合分流程，無法新增個人計分" });
      }

      const enrolled = await isEnrolled(app, course.id, body.data.studentId);
      if (!enrolled) {
        return reply.status(400).send({ message: "只能對本課程學生給分" });
      }

      const created = await app.prisma.$transaction(async (tx) => {
        const record = await tx.courseScore.create({
          data: {
            courseId: course.id,
            studentId: body.data.studentId,
            score: body.data.score,
          },
        });
        await tx.course.update({
          where: { id: course.id },
          data: { currentSpeakerId: null },
        });
        return record;
      });

      return reply.status(201).send({
        score: {
          id: created.id,
          courseId: created.courseId,
          studentId: created.studentId,
          value: created.score,
          awardedAt: created.awardedAt,
        },
      });
    },
  );

  app.post(
    "/courses/:courseId/scores/batch",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = courseIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }
      const body = batchScoreBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ message: "Validation failed", issues: body.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }
      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }
      if (course.handRaiseMode === "group") {
        return reply.status(400).send({ message: "分組模式下使用組別合分流程，無法新增個人計分" });
      }

      const uniqueIds = [...new Set(body.data.studentIds)];
      const enrollments = await app.prisma.courseStudent.findMany({
        where: { courseId: course.id, studentId: { in: uniqueIds } },
        select: { studentId: true },
      });
      if (enrollments.length !== uniqueIds.length) {
        return reply.status(400).send({ message: "部分學生未加入此課程" });
      }

      await app.prisma.$transaction(async (tx) => {
        await tx.courseScore.createMany({
          data: uniqueIds.map((studentId) => ({
            courseId: course.id,
            studentId,
            score: body.data.score,
          })),
        });
        await tx.course.update({
          where: { id: course.id },
          data: { currentSpeakerId: null },
        });
      });

      return reply.status(201).send({ createdCount: uniqueIds.length });
    },
  );

  app.post(
    "/courses/:courseId/group-score-rounds",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = courseIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }
      const body = createGroupScoreRoundBodySchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ message: "Validation failed", issues: body.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }
      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }
      if (course.handRaiseMode !== "group") {
        return reply.status(400).send({ message: "僅分組模式下可建立組長合分流程" });
      }
      if (course.currentSpeakerId !== body.data.speakerStudentId) {
        return reply.status(400).send({ message: "請先將學生移至發言區塊" });
      }

      const existing = await app.prisma.courseGroupScoreRound.findFirst({
        where: { courseId: course.id, status: "open" },
      });
      if (existing) {
        if (existing.speakerStudentId !== body.data.speakerStudentId) {
          return reply.status(409).send({ message: "尚有未完成的給分流程" });
        }
        return reply.send({ round: { id: existing.id } });
      }

      const round = await app.prisma.courseGroupScoreRound.create({
        data: {
          courseId: course.id,
          speakerStudentId: body.data.speakerStudentId,
        },
      });
      return reply.status(201).send({ round: { id: round.id } });
    },
  );

  app.patch(
    "/courses/:courseId/group-score-rounds/:roundId/teacher",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = groupRoundIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }
      const body = teacherGroupRoundScoreSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ message: "Validation failed", issues: body.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }
      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const round = await app.prisma.courseGroupScoreRound.findFirst({
        where: { id: params.data.roundId, courseId: course.id },
      });
      if (!round) {
        return reply.status(404).send({ message: "Round not found" });
      }
      if (round.status !== "open") {
        return reply.status(400).send({ message: "此給分流程已結束" });
      }
      if (round.teacherScore !== null) {
        return reply.status(400).send({ message: "老師分數已送出" });
      }

      await app.prisma.courseGroupScoreRound.update({
        where: { id: round.id },
        data: { teacherScore: body.data.score },
      });

      const finalized = await tryFinalizeGroupScoreRound(app, round.id);
      return reply.send({ finalized });
    },
  );

  app.post(
    "/courses/:courseId/group-score-rounds/:roundId/leader-vote",
    { preHandler: app.requireRole("student") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = groupRoundIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }
      const body = leaderGroupRoundVoteSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ message: "Validation failed", issues: body.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }

      const enrolled = await app.prisma.courseStudent.findUnique({
        where: { courseId_studentId: { courseId: course.id, studentId: authUser.id } },
        select: { isLeader: true },
      });
      if (!enrolled?.isLeader) {
        return reply.status(403).send({ message: "僅組長可評分" });
      }

      const round = await app.prisma.courseGroupScoreRound.findFirst({
        where: { id: params.data.roundId, courseId: course.id },
        include: { leaderVotes: true },
      });
      if (!round) {
        return reply.status(404).send({ message: "Round not found" });
      }
      if (round.status !== "open") {
        return reply.status(400).send({ message: "此給分流程已結束" });
      }

      const eligibleIds = await getEligibleLeaderUserIds(app, course.id, round.speakerStudentId);
      if (!eligibleIds.includes(authUser.id)) {
        return reply.status(403).send({ message: "你不需要為此組別評分" });
      }
      if (round.leaderVotes.some((v) => v.leaderId === authUser.id)) {
        return reply.status(400).send({ message: "你已提交過評分" });
      }

      await app.prisma.courseGroupScoreLeaderVote.create({
        data: {
          roundId: round.id,
          leaderId: authUser.id,
          score: body.data.score,
        },
      });

      const finalized = await tryFinalizeGroupScoreRound(app, round.id);
      return reply.status(201).send({ finalized });
    },
  );

  app.delete(
    "/courses/:courseId/group-score-rounds/:roundId",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = groupRoundIdParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }
      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const round = await app.prisma.courseGroupScoreRound.findFirst({
        where: { id: params.data.roundId, courseId: course.id },
      });
      if (!round) {
        return reply.status(404).send({ message: "Round not found" });
      }
      if (round.status !== "open") {
        return reply.status(400).send({ message: "此給分流程已結束" });
      }
      if (round.teacherScore !== null) {
        return reply.status(400).send({ message: "老師已送出分數，無法取消" });
      }

      await app.prisma.courseGroupScoreRound.update({
        where: { id: round.id },
        data: { status: "cancelled" },
      });

      return reply.status(204).send();
    },
  );

  app.delete(
    "/courses/:courseId/scores/:scoreId",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = scoreParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }
      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const score = await app.prisma.courseScore.findUnique({
        where: { id: params.data.scoreId },
        select: { id: true, courseId: true },
      });
      if (!score || score.courseId !== course.id) {
        return reply.status(404).send({ message: "Score record not found" });
      }

      await app.prisma.courseScore.delete({
        where: { id: score.id },
      });

      return reply.status(204).send();
    },
  );

  app.delete(
    "/courses/:courseId/group-scores/:groupScoreId",
    { preHandler: app.requireRole("admin", "teacher") },
    async (request, reply) => {
      const authUser = request.authUser;
      if (!authUser) {
        return reply.status(401).send({ message: "Unauthorized" });
      }

      const params = groupScoreParamSchema.safeParse(request.params);
      if (!params.success) {
        return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
      }

      const course = await getCourse(app, params.data.courseId);
      if (!course) {
        return reply.status(404).send({ message: "Course not found" });
      }
      if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }
      if (course.handRaiseMode !== "group") {
        return reply.status(400).send({ message: "僅分組模式下可刪除組別計分" });
      }

      const row = await app.prisma.courseGroupScore.findUnique({
        where: { id: params.data.groupScoreId },
        select: { id: true, courseId: true },
      });
      if (!row || row.courseId !== course.id) {
        return reply.status(404).send({ message: "Group score record not found" });
      }

      await app.prisma.courseGroupScore.delete({
        where: { id: row.id },
      });

      return reply.status(204).send();
    },
  );
};
