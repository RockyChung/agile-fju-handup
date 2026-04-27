import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const roleSchema = z.enum(["admin", "teacher", "student"]);

const listQuerySchema = z.object({
  role: roleSchema.optional(),
});

const createBodySchema = z.object({
  studentId: z.string().trim().min(1, "studentId is required"),
  password: z.string().min(8, "password must be at least 8 chars"),
  name: z.string().trim().optional().nullable(),
  role: roleSchema,
  mustChangePassword: z.boolean().optional(),
});
const createStudentBodySchema = z.object({
  studentId: z.string().trim().min(1, "studentId is required"),
  password: z.string().min(8, "password must be at least 8 chars"),
  name: z.string().trim().optional().nullable(),
  mustChangePassword: z.boolean().optional(),
  courseId: z.string().uuid().optional(),
  groupName: z.string().trim().max(80).optional().nullable(),
  isLeader: z.boolean().optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid("Invalid user id"),
});

const updateBodySchema = z
  .object({
    studentId: z.string().trim().min(1).optional(),
    password: z.string().min(8).optional(),
    name: z.string().trim().optional().nullable(),
    role: roleSchema.optional(),
    mustChangePassword: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required",
  });

const EMAIL_DOMAIN = "@cloud.fju.edu.tw";

function makeEmail(studentId: string): string {
  return `${studentId}${EMAIL_DOMAIN}`;
}

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.post("/students", { preHandler: app.requireRole("admin", "teacher") }, async (request, reply) => {
    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const parsed = createStudentBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Validation failed", issues: parsed.error.issues });
    }

    const payload = parsed.data;

    const existing = await app.prisma.user.findUnique({
      where: { studentId: payload.studentId },
      select: { id: true },
    });
    if (existing) {
      return reply.status(409).send({ message: "學號已存在" });
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    try {
      const user = await app.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            studentId: payload.studentId,
            email: makeEmail(payload.studentId),
            passwordHash,
            name: payload.name ?? null,
            role: "student",
            mustChangePassword: payload.mustChangePassword ?? true,
          },
          select: {
            id: true,
            studentId: true,
            email: true,
            name: true,
            role: true,
            mustChangePassword: true,
          },
        });

        if (payload.courseId) {
          const targetCourse = await tx.course.findUnique({
            where: { id: payload.courseId },
            select: { id: true, teacherId: true },
          });

          if (!targetCourse) {
            throw new Error("COURSE_NOT_FOUND");
          }
          if (authUser.role === "teacher" && targetCourse.teacherId !== authUser.id) {
            throw new Error("FORBIDDEN_COURSE");
          }

          await tx.courseStudent.upsert({
            where: {
              courseId_studentId: {
                courseId: payload.courseId,
                studentId: createdUser.id,
              },
            },
            update: {
              groupName: payload.groupName ?? null,
              isLeader: payload.isLeader ?? false,
            },
            create: {
              courseId: payload.courseId,
              studentId: createdUser.id,
              groupName: payload.groupName ?? null,
              isLeader: payload.isLeader ?? false,
            },
          });
        }

        return createdUser;
      });

      return reply.status(201).send({ user });
    } catch (error) {
      if (error instanceof Error && error.message === "COURSE_NOT_FOUND") {
        return reply.status(404).send({ message: "找不到課程" });
      }
      if (error instanceof Error && error.message === "FORBIDDEN_COURSE") {
        return reply.status(403).send({ message: "不可加入非自己課程" });
      }
      request.log.error(error);
      return reply.status(400).send({ message: "建立學生失敗" });
    }
  });

  app.get("/", { preHandler: app.requireAdmin }, async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Validation failed", issues: parsed.error.issues });
    }

    const users = await app.prisma.user.findMany({
      where: parsed.data.role ? { role: parsed.data.role as Role } : undefined,
      orderBy: [{ role: "asc" }, { studentId: "asc" }],
      select: {
        id: true,
        studentId: true,
        email: true,
        name: true,
        role: true,
        mustChangePassword: true,
      },
    });

    return reply.send({ users });
  });

  app.post("/", { preHandler: app.requireAdmin }, async (request, reply) => {
    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: "Validation failed", issues: parsed.error.issues });
    }

    const payload = parsed.data;

    const existing = await app.prisma.user.findUnique({
      where: { studentId: payload.studentId },
      select: { id: true },
    });
    if (existing) {
      return reply.status(409).send({ message: "學號已存在" });
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);

    try {
      const user = await app.prisma.user.create({
        data: {
          studentId: payload.studentId,
          email: makeEmail(payload.studentId),
          passwordHash,
          name: payload.name ?? null,
          role: payload.role,
          mustChangePassword:
            payload.mustChangePassword ?? payload.role === "student",
        },
        select: {
          id: true,
          studentId: true,
          email: true,
          name: true,
          role: true,
          mustChangePassword: true,
        },
      });

      return reply.status(201).send({ user });
    } catch (error) {
      request.log.error(error);
      return reply.status(400).send({ message: "建立帳號失敗" });
    }
  });

  app.patch("/:id", { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const body = updateBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ message: "Validation failed", issues: body.error.issues });
    }

    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    if (body.data.role && body.data.role !== "admin" && authUser.id === params.data.id) {
      return reply.status(400).send({ message: "無法把自己的角色改成非管理員" });
    }

    const updateData: {
      studentId?: string;
      email?: string;
      passwordHash?: string;
      name?: string | null;
      role?: Role;
      mustChangePassword?: boolean;
    } = {};

    if (body.data.studentId !== undefined) {
      updateData.studentId = body.data.studentId;
      updateData.email = makeEmail(body.data.studentId);
    }
    if (body.data.password) {
      updateData.passwordHash = await bcrypt.hash(body.data.password, 10);
    }
    if (body.data.name !== undefined) {
      updateData.name = body.data.name ?? null;
    }
    if (body.data.role) {
      updateData.role = body.data.role;
    }
    if (body.data.mustChangePassword !== undefined) {
      updateData.mustChangePassword = body.data.mustChangePassword;
    }

    try {
      const user = await app.prisma.user.update({
        where: { id: params.data.id },
        data: updateData,
        select: {
          id: true,
          studentId: true,
          email: true,
          name: true,
          role: true,
          mustChangePassword: true,
        },
      });
      return reply.send({ user });
    } catch (error) {
      request.log.error(error);
      return reply.status(400).send({ message: "更新帳號失敗" });
    }
  });

  app.delete("/:id", { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ message: "Validation failed", issues: params.error.issues });
    }

    const authUser = request.authUser;
    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    if (authUser.id === params.data.id) {
      return reply.status(400).send({ message: "無法刪除自己的帳號" });
    }

    try {
      await app.prisma.user.delete({
        where: { id: params.data.id },
      });
      return reply.status(204).send();
    } catch (error) {
      request.log.error(error);
      return reply.status(400).send({ message: "刪除帳號失敗" });
    }
  });
};
