import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service.js";
import { trackEvent } from "../services/tracking.service.js";

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    authService.assertValidRegistration(req.body);
    const result = await authService.registerUser(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getMe(req.user!.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.body?.sessionId as string | undefined;
    if (sessionId) {
      await trackEvent({
        userId: req.user?.id ?? null,
        sessionId,
        eventType: "SESSION_END",
      });
      const { endSession } = await import("../services/tracking.service.js");
      await endSession(sessionId);
    }
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
};
