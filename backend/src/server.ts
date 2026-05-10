import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { authPlugin } from "./plugins/auth";
import { prismaPlugin } from "./plugins/prisma";
import { authRoutes } from "./routes/auth";
import { courseStudentRoutes } from "./routes/course-students";
import { courseRoutes } from "./routes/courses";
import { handRaiseRoutes } from "./routes/hand-raises";
import { healthRoutes } from "./routes/health";
import { userRoutes } from "./routes/users";

export function buildServer() {
  const app = Fastify({
    logger: true,
  });

  const corsOriginEnv = process.env.CORS_ORIGIN ?? "http://localhost:3000";
  const corsOrigins = corsOriginEnv
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigin = corsOrigins.length <= 1 ? (corsOrigins[0] ?? "http://localhost:3000") : corsOrigins;

  void app.register(cors, {
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Render / browser often request `/` and `/favicon.ico`; this API has no static site.
  app.get("/", async () => ({
    ok: true,
    service: "agile-fju-handup-backend",
    message: "API is running. Frontend is a separate deployment; use /auth, /courses, etc.",
  }));
  app.get("/favicon.ico", async (_request, reply) => reply.status(204).send());

  void app.register(prismaPlugin);
  void app.register(authPlugin);
  void app.register(healthRoutes, { prefix: "/health" });
  void app.register(authRoutes, { prefix: "/auth" });
  void app.register(userRoutes, { prefix: "/users" });
  void app.register(courseRoutes, { prefix: "/courses" });
  void app.register(courseStudentRoutes, { prefix: "/" });
  void app.register(handRaiseRoutes, { prefix: "/" });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: "Validation failed",
        issues: error.issues,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      message: "Internal Server Error",
    });
  });

  return app;
}
