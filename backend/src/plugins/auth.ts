import fp from "fastify-plugin";
import { FastifyReply, FastifyRequest } from "fastify";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

export type AuthUser = {
  id: string;
  role: "admin" | "teacher" | "student";
  studentId: string;
  name: string | null;
};
export type AuthRole = AuthUser["role"];
export type AuthPreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
  }

  interface FastifyInstance {
    jwtSign: (payload: AuthUser) => string;
    jwtVerify: (token: string) => AuthUser;
    authenticate: AuthPreHandler;
    requireRole: (...roles: AuthRole[]) => AuthPreHandler;
    requireAdmin: AuthPreHandler;
    requireTeacher: AuthPreHandler;
    requireStudent: AuthPreHandler;
  }
}

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

export const authPlugin = fp(async (app) => {
  const jwtSecret = process.env.JWT_SECRET ?? "dev-only-change-me";
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];

  app.decorate("jwtSign", (payload: AuthUser) => {
    return jwt.sign(payload, jwtSecret, { expiresIn });
  });

  app.decorate("jwtVerify", (token: string) => {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload & AuthUser;

    if (!decoded?.id || !decoded?.role || !decoded?.studentId) {
      throw new Error("Invalid token payload");
    }

    return {
      id: decoded.id,
      role: decoded.role,
      studentId: decoded.studentId,
      name: decoded.name ?? null,
    };
  });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = parseBearerToken(request);

    if (!token) {
      void reply.status(401).send({ message: "Unauthorized" });
      return;
    }

    try {
      const authUser = app.jwtVerify(token);
      request.authUser = authUser;
    } catch {
      void reply.status(401).send({ message: "Unauthorized" });
    }
  });

  app.decorate("requireRole", (...roles: AuthRole[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(request, reply);
      if (reply.sent) {
        return;
      }

      const role = request.authUser?.role;
      if (!role || !roles.includes(role)) {
        void reply.status(403).send({
          message: "Forbidden",
          requiredRoles: roles,
        });
      }
    };
  });

  app.decorate("requireAdmin", app.requireRole("admin"));
  app.decorate("requireTeacher", app.requireRole("teacher"));
  app.decorate("requireStudent", app.requireRole("student"));
});
