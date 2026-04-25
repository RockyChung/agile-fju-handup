import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const loginBodySchema = z.object({
  studentId: z.string().trim().min(1, "studentId is required"),
  password: z.string().min(1, "password is required"),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/login", async (request, reply) => {
    const parsed = loginBodySchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        message: "Validation failed",
        issues: parsed.error.issues,
      });
    }

    const { studentId, password } = parsed.data;

    const user = await app.prisma.user.findUnique({
      where: { studentId },
      select: {
        id: true,
        role: true,
        studentId: true,
        name: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    });

    if (!user) {
      return reply.status(401).send({ message: "學號或密碼錯誤" });
    }

    const matched = await bcrypt.compare(password, user.passwordHash);

    if (!matched) {
      return reply.status(401).send({ message: "學號或密碼錯誤" });
    }

    const token = app.jwtSign({
      id: user.id,
      role: user.role,
      studentId: user.studentId,
      name: user.name,
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        role: user.role,
        studentId: user.studentId,
        name: user.name,
        mustChangePassword: user.mustChangePassword,
      },
    });
  });

  app.get("/me", { preHandler: app.authenticate }, async (request, reply) => {
    const authUser = request.authUser;

    if (!authUser) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    const user = await app.prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        role: true,
        studentId: true,
        name: true,
        mustChangePassword: true,
      },
    });

    if (!user) {
      return reply.status(401).send({ message: "Unauthorized" });
    }

    return reply.send({
      user: {
        id: user.id,
        role: user.role,
        studentId: user.studentId,
        name: user.name,
        mustChangePassword: user.mustChangePassword,
      },
    });
  });

  app.get("/roles", async () => {
    return {
      roles: Object.values(Role),
    };
  });
};
