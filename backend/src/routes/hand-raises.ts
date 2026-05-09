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
const createScoreBodySchema = z.object({
  studentId: z.string().uuid("Invalid student id"),
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

async function getCourse(app: FastifyInstance, courseId: string) {
  return app.prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      courseCode: true,
      isActive: true,
      teacherId: true,
      reportOrder: true,
      currentSpeakerId: true,
      currentSpeaker: {
        select: {
          id: true,
          studentId: true,
          name: true,
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
          },
        },
      },
    });

    return reply.send({
      course,
      queue,
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
};
