import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";

const courseIdParamSchema = z.object({
  courseId: z.string().uuid("Invalid course id"),
});

const handRaiseParamSchema = z.object({
  courseId: z.string().uuid("Invalid course id"),
  handRaiseId: z.string().uuid("Invalid hand raise id"),
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
};
