import pino from "pino";

export const logger = pino({
  name: "invoice-review-portal-worker",
  level: process.env.LOG_LEVEL ?? "info",
});
