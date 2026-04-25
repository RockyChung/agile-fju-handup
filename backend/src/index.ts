import "dotenv/config";
import { buildServer } from "./server";

async function main() {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 8080);
  const host = "0.0.0.0";

  try {
    await app.listen({ port, host });
    app.log.info(`Backend listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
