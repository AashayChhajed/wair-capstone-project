import { prisma } from "../lib/prisma.js";
import { hashPassword, signToken, verifyPassword } from "../lib/auth.js";
import { badRequest, conflict, unauthorized } from "../lib/errors.js";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: "JOB_SEEKER" | "RECRUITER" | "ADMIN";
  companyName?: string;
}

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw conflict("An account with this email already exists");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: input.role,
      profile: { create: {} },
      ...(input.role === "RECRUITER" && input.companyName
        ? { companies: { create: { name: input.companyName } } }
        : {}),
    },
  });

  const token = signToken({ sub: user.id, role: user.role, name: user.name });
  return { token, user: publicUser(user) };
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw unauthorized("Invalid email or password");
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw unauthorized("Invalid email or password");

  const token = signToken({ sub: user.id, role: user.role, name: user.name });
  return { token, user: publicUser(user) };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true, companies: true, skills: { include: { skill: true } } },
  });
  if (!user) throw unauthorized("User no longer exists");
  return publicUser(user);
}

export function publicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  profile?: unknown;
  companies?: unknown;
  skills?: unknown;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    ...(user.profile !== undefined ? { profile: user.profile } : {}),
    ...(user.companies !== undefined ? { companies: user.companies } : {}),
    ...(user.skills !== undefined ? { skills: user.skills } : {}),
  };
}

export function assertValidRegistration(input: RegisterInput) {
  if (input.password.length < 8) {
    throw badRequest("Password must be at least 8 characters");
  }
}
