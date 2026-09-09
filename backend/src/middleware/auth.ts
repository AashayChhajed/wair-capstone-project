import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodSchema } from "zod";
import { HttpError } from "../lib/errors.js";

export interface AuthUser {
  id: string;
  name: string;
  role: "JOB_SEEKER" | "RECRUITER" | "ADMIN";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Validate req.body (and merge parsed value back). */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new HttpError(400, "Validation failed", err.flatten().fieldErrors));
      } else next(err);
    }
  };
}

/** Validate req.query and expose parsed value on req.query. */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new HttpError(400, "Invalid query parameters", err.flatten().fieldErrors));
      } else next(err);
    }
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, "Authentication required"));
  next();
}

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, "Authentication required"));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, "You do not have permission to perform this action"));
    }
    next();
  };
}
