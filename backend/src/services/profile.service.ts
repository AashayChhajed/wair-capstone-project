import { prisma } from "../lib/prisma.js";
import { notFound } from "../lib/errors.js";

export interface ProfileInput {
  name?: string;
  location?: string;
  experience?: number;
  preferredRole?: string;
  preferredLocation?: string;
  bio?: string;
  skills?: string[];
}

/**
 * Update the seeker profile. Skills are stored in the normalized Skill /
 * UserSkill tables — the array replaces the current skill set.
 */
export async function updateProfile(userId: string, input: ProfileInput) {
  const { name, skills, ...profileFields } = input;

  if (name !== undefined) {
    await prisma.user.update({ where: { id: userId }, data: { name } });
  }

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...profileFields },
    update: profileFields,
  });

  if (skills !== undefined) {
    await setUserSkills(userId, skills);
  }

  return getProfile(userId);
}

/** Ensure skills exist and link them to the user (replaces current set). */
async function setUserSkills(userId: string, skillNames: string[]) {
  const cleaned = [...new Set(skillNames.map((s) => s.trim()).filter(Boolean))].map(
    (s) => s[0].toUpperCase() + s.slice(1),
  );

  await prisma.$transaction([
    prisma.userSkill.deleteMany({ where: { userId } }),
    ...cleaned.map((name) =>
      prisma.skill.upsert({
        where: { name },
        create: { name },
        update: {},
      }),
    ),
  ]);

  const skillRecords = await prisma.skill.findMany({
    where: { name: { in: cleaned } },
    select: { id: true },
  });
  if (skillRecords.length > 0) {
    await prisma.userSkill.createMany({
      data: skillRecords.map((s) => ({ userId, skillId: s.id })),
      skipDuplicates: true,
    });
  }
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      skills: { include: { skill: { select: { name: true } } } },
    },
  });
  if (!user) throw notFound("User not found");

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    location: user.profile?.location ?? null,
    experience: user.profile?.experience ?? null,
    preferredRole: user.profile?.preferredRole ?? null,
    preferredLocation: user.profile?.preferredLocation ?? null,
    bio: user.profile?.bio ?? null,
    skills: user.skills.map((s) => s.skill.name),
  };
}

/** Distinct skill names for autocomplete chips. */
export async function listSkills() {
  const skills = await prisma.skill.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return skills;
}
