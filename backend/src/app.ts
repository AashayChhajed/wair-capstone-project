import express from "express";
import cors from "cors";
import helmet from "helmet";
import { attachUser } from "./middleware/attachUser.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import routes from "./routes/index.js";
import { env } from "./config/env.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(attachUser);

  // Health check for docker/uptime monitoring.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
