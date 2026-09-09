import type { Request, Response, NextFunction } from "express";
import * as profileService from "../services/profile.service.js";

export const getProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ profile: await profileService.getProfile(req.user!.id) });
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await profileService.updateProfile(req.user!.id, req.body);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
};

export const getSkills = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ skills: await profileService.listSkills() });
  } catch (err) {
    next(err);
  }
};
