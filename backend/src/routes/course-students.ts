import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";

const courseIdParamSchema = z.object({
  courseId: z.string().uuid("Invalid course id"),
});

const courseStudentParamSchema = z.object({
  courseId: z.string().uuid("Invalid course id"),
  studentId: z.string().uuid("Invalid student id"),
});

const enrollBodySchema = z.object({
  studentId: z.string().uuid().optional(),
  groupName: z.string().trim().max(80).optional().nullable(),
  isLeader: z.boolean().optional(),
});
const teacherStudentSearchQuerySchema = z.object({
  studentId: z.string().trim().optional(),
  name: z.string().trim().optional(),
  courseId: z.string().uuid().optional(),
});

async function getCourseOr404(app: FastifyInstance, courseId: string) {
  return app.prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, teacherId: true, title: true, courseCode: true, isActive: true },
  });
}

export const courseStudentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/teacher/students", { preHandler: app.requireRole("admin", "teacher") }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const parsed = teacherStudentSearchQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ message: "Validation failed", issues: parsed.error.issues });
    }

    const studentId = parsed.data.studentId?.trim();
    const name = parsed.data.name?.trim();
    const courseId = parsed.data.courseId;

    const where: {
      courseId?: string;
      course?: { teacherId: string };
      student?: { studentId?: { contains: string; mode: "insensitive" }; name?: { contains: string; mode: "insensitive" } };
    } = {};

    if (courseId) {
      where.courseId = courseId;
    }
    if (authUser.role === "teacher") {
      where.course = { teacherId: authUser.id };
    }
    if (studentId || name) {
      where.student = {};
      if (studentId) {
        where.student.studentId = { contains: studentId, mode: "insensitive" };
      }
      if (name) {
        where.student.name = { contains: name, mode: "insensitive" };
      }
    }

    const rows = await app.prisma.courseStudent.findMany({
      where,
      include: {
        course: {
          select: {
            id: true,
            title: true,
            courseCode: true,
            teacherId: true,
          },
        },
        student: {
          select: {
            id: true,
            studentId: true,
            name: true,
          },
        },
      },
      orderBy: [{ courseId: "asc" }, { enrolledAt: "asc" }],
    });

    return reply.send({
      students: rows.map((row) => ({
        courseId: row.courseId,
        courseCode: row.course.courseCode,
        courseTitle: row.course.title,
        studentId: row.student.studentId,
        studentName: row.student.name,
        groupName: row.groupName,
        isLeader: row.isLeader,
      })),
    });
  });

  // Teacher/Admin: inspect full enrolled list for any course they are allowed to manage.
  app.get("/courses/:courseId/students", { preHandler: app.requireRole("admin", "teacher") }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const params = courseIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const course = await getCourseOr404(app, params.data.courseId);
    if (!course) {
      return reply.status(404).send({ message: "Course not found" });
    }

    if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
      return reply.status(403).send({ message: "Forbidden" });
    }

    const rows = await app.prisma.courseStudent.findMany({
      where: { courseId: course.id },
      include: {
        student: {
          select: {
            id: true,
            studentId: true,
            name: true,
            role: true,
            mustChangePassword: true,
          },
        },
      },
      orderBy: { enrolledAt: "asc" },
    });

    return reply.send({
      course,
      students: rows.map((row) => ({
        enrolledAt: row.enrolledAt,
        groupName: row.groupName,
        isLeader: row.isLeader,
        student: row.student,
      })),
    });
  });

  // Enroll flow:
  // - student can enroll self only
  // - teacher can enroll any student only on own courses
  // - admin can enroll any student on any course
  app.post("/courses/:courseId/students", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const params = courseIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const body = enrollBodySchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ message: "Validation failed", issues: body.error.issues });
    }

    const course = await getCourseOr404(app, params.data.courseId);
    if (!course) {
      return reply.status(404).send({ message: "Course not found" });
    }

    let targetStudentId = body.data.studentId ?? authUser.id;

    if (authUser.role === "student") {
      if (targetStudentId !== authUser.id) {
        return reply.status(403).send({ message: "Students can only enroll themselves" });
      }
    } else if (authUser.role === "teacher") {
      if (course.teacherId !== authUser.id) {
        return reply.status(403).send({ message: "Forbidden" });
      }
    }

    const targetStudent = await app.prisma.user.findUnique({
      where: { id: targetStudentId },
      select: { id: true, role: true, studentId: true, name: true },
    });

    if (!targetStudent || targetStudent.role !== "student") {
      return reply.status(400).send({ message: "Target user must be a student" });
    }

    try {
      const enrolled = await app.prisma.courseStudent.upsert({
        where: {
          courseId_studentId: {
            courseId: course.id,
            studentId: targetStudentId,
          },
        },
        update: {
          groupName: body.data.groupName ?? null,
          isLeader: body.data.isLeader ?? false,
        },
        create: {
          courseId: course.id,
          studentId: targetStudentId,
          groupName: body.data.groupName ?? null,
          isLeader: body.data.isLeader ?? false,
        },
        include: {
          student: {
            select: {
              id: true,
              studentId: true,
              name: true,
              role: true,
              mustChangePassword: true,
            },
          },
        },
      });

      return reply.status(201).send({
        course,
        enrollment: {
          enrolledAt: enrolled.enrolledAt,
          groupName: enrolled.groupName,
          isLeader: enrolled.isLeader,
          student: enrolled.student,
        },
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(400).send({ message: "Failed to enroll student" });
    }
  });

  // Remove enrollment:
  // - student can remove self only
  // - teacher can remove any student only on own courses
  // - admin can remove any student from any course
  app.delete("/courses/:courseId/students/:studentId", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const params = courseStudentParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const course = await getCourseOr404(app, params.data.courseId);
    if (!course) {
      return reply.status(404).send({ message: "Course not found" });
    }

    if (authUser.role === "student" && params.data.studentId !== authUser.id) {
      return reply.status(403).send({ message: "Students can only remove themselves" });
    }

    if (authUser.role === "teacher" && course.teacherId !== authUser.id) {
      return reply.status(403).send({ message: "Forbidden" });
    }

    const existing = await app.prisma.courseStudent.findUnique({
      where: {
        courseId_studentId: {
          courseId: params.data.courseId,
          studentId: params.data.studentId,
        },
      },
      select: { courseId: true, studentId: true },
    });

    if (!existing) {
      return reply.status(404).send({ message: "Enrollment not found" });
    }

    await app.prisma.courseStudent.delete({
      where: {
        courseId_studentId: {
          courseId: params.data.courseId,
          studentId: params.data.studentId,
        },
      },
    });

    return reply.status(204).send();
  });
};
