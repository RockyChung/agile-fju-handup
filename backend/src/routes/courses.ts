import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const courseCreateSchema = z.object({
  title: z.string().trim().min(1, "title is required"),
  courseCode: z.string().trim().min(1, "courseCode is required"),
  isActive: z.boolean().optional().default(false),
  teacherId: z.string().uuid().optional(),
});

const courseUpdateSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    courseCode: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
    teacherId: z.string().uuid().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

const idParamSchema = z.object({
  id: z.string().uuid("Invalid course id"),
});

export const courseRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    if (authUser.role === "admin") {
      const courses = await app.prisma.course.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          teacher: {
            select: {
              id: true,
              studentId: true,
              name: true,
            },
          },
        },
      });
      return reply.send({ courses });
    }

    if (authUser.role === "teacher") {
      const courses = await app.prisma.course.findMany({
        where: { teacherId: authUser.id },
        orderBy: { createdAt: "desc" },
      });
      return reply.send({ courses });
    }

    const enrolled = await app.prisma.courseStudent.findMany({
      where: { studentId: authUser.id },
      select: {
        course: {
          include: {
            teacher: {
              select: {
                id: true,
                studentId: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        course: { createdAt: "desc" },
      },
    });

    return reply.send({
      courses: enrolled.map((item) => item.course),
    });
  });

  app.post("/", { preHandler: app.requireRole("admin", "teacher") }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const parsed = courseCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Validation failed", issues: parsed.error.issues });
    }

    const payload = parsed.data;
    const teacherId = authUser.role === "admin" ? payload.teacherId ?? authUser.id : authUser.id;

    const teacher = await app.prisma.user.findUnique({
      where: { id: teacherId },
      select: { id: true, role: true },
    });

    if (!teacher || teacher.role !== "teacher") {
      return reply.status(400).send({ message: "teacherId must point to a teacher user" });
    }

    try {
      const course = await app.prisma.course.create({
        data: {
          title: payload.title,
          courseCode: payload.courseCode,
          isActive: payload.isActive,
          teacherId,
        },
      });
      return reply.status(201).send({ course });
    } catch (error) {
      request.log.error(error);
      return reply.status(400).send({ message: "Failed to create course" });
    }
  });

  app.patch("/:id", { preHandler: app.requireRole("admin", "teacher") }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const body = courseUpdateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ message: "Validation failed", issues: body.error.issues });
    }

    const current = await app.prisma.course.findUnique({
      where: { id: params.data.id },
      select: { id: true, teacherId: true },
    });

    if (!current) {
      return reply.status(404).send({ message: "Course not found" });
    }

    if (authUser.role === "teacher" && current.teacherId !== authUser.id) {
      return reply.status(403).send({ message: "Forbidden" });
    }

    const updateData: {
      title?: string;
      courseCode?: string;
      isActive?: boolean;
      teacherId?: string;
    } = {
      title: body.data.title,
      courseCode: body.data.courseCode,
      isActive: body.data.isActive,
    };

    if (authUser.role === "admin" && body.data.teacherId) {
      const teacher = await app.prisma.user.findUnique({
        where: { id: body.data.teacherId },
        select: { id: true, role: true },
      });
      if (!teacher || teacher.role !== "teacher") {
        return reply.status(400).send({ message: "teacherId must point to a teacher user" });
      }
      updateData.teacherId = body.data.teacherId;
    }

    try {
      const course = await app.prisma.course.update({
        where: { id: params.data.id },
        data: updateData,
      });
      return reply.send({ course });
    } catch (error) {
      request.log.error(error);
      return reply.status(400).send({ message: "Failed to update course" });
    }
  });

  app.delete("/:id", { preHandler: app.requireRole("admin", "teacher") }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const current = await app.prisma.course.findUnique({
      where: { id: params.data.id },
      select: { id: true, teacherId: true },
    });

    if (!current) {
      return reply.status(404).send({ message: "Course not found" });
    }

    if (authUser.role === "teacher" && current.teacherId !== authUser.id) {
      return reply.status(403).send({ message: "Forbidden" });
    }

    await app.prisma.course.delete({
      where: { id: params.data.id },
    });

    return reply.status(204).send();
  });
};
