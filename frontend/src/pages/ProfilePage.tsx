import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Skill } from "../types";

const LOCATIONS = ["Pune", "Mumbai", "Bangalore", "Hyderabad", "Delhi", "Chennai", "Remote"];
const ROLES = [
  "Java Developer",
  "Backend Developer",
  "Frontend Developer",
  "Full Stack Developer",
  "Python Developer",
  "Data Analyst",
  "Data Scientist",
  "Machine Learning Engineer",
  "DevOps Engineer",
  "Cloud Engineer",
  "QA Engineer",
  "Software Engineer",
];

interface ProfileForm {
  location: string;
  experience: number;
  preferredRole: string;
  preferredLocation: string;
  bio: string;
  skills: string[];
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [form, setForm] = useState<ProfileForm>({
    location: "",
    experience: 0,
    preferredRole: "",
    preferredLocation: "",
    bio: "",
    skills: [],
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSkills()
      .then((r) => setAllSkills(r.skills))
      .catch(() => undefined);
    api
      .getProfile()
      .then(({ profile }) => {
        // Profile may not exist yet; defaults are fine.
        setForm({
          location: profile?.location ?? "",
          experience: profile?.experience ?? 0,
          preferredRole: profile?.preferredRole ?? "",
          preferredLocation: profile?.preferredLocation ?? "",
          bio: profile?.bio ?? "",
          skills: [],
        });
      })
      .catch(() => undefined);
    // Load the seeker's existing skills from /auth/me payload.
    if (user?.skills) {
      setForm((f) => ({ ...f, skills: user.skills!.map((s) => s.skill.name) }));
    }
  }, [user]);

  function toggleSkill(name: string) {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(name) ? f.skills.filter((s) => s !== name) : [...f.skills, name],
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      await api.updateProfile({
        location: form.location || undefined,
        experience: form.experience,
        preferredRole: form.preferredRole || undefined,
        preferredLocation: form.preferredLocation || undefined,
        bio: form.bio || undefined,
        skills: form.skills,
      });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
      setStatus("idle");
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p className="muted small">
            Your profile powers the recommendation engine — skills, preferred role, location and
            experience all feed the match score.
          </p>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {status === "saved" && <div className="form-success">Profile saved!</div>}

      <form className="card" onSubmit={save}>
        <div className="grid grid-2">
          <div>
            <label htmlFor="location">Current location</label>
            <select
              id="location"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            >
              <option value="">Select…</option>
              {LOCATIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="experience">Experience (years)</label>
            <input
              id="experience"
              type="number"
              min={0}
              max={40}
              value={form.experience}
              onChange={(e) =>
                setForm((f) => ({ ...f, experience: Number(e.target.value) }))
              }
            />
          </div>
          <div>
            <label htmlFor="role">Preferred role</label>
            <select
              id="role"
              value={form.preferredRole}
              onChange={(e) => setForm((f) => ({ ...f, preferredRole: e.target.value }))}
            >
              <option value="">Select…</option>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="prefLoc">Preferred location</label>
            <select
              id="prefLoc"
              value={form.preferredLocation}
              onChange={(e) => setForm((f) => ({ ...f, preferredLocation: e.target.value }))}
            >
              <option value="">Select…</option>
              {LOCATIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt">
          <label>Skills (click to toggle)</label>
          <div className="tags mt" style={{ gap: 8 }}>
            {allSkills.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSkill(s.name)}
                className={`btn btn-sm ${form.skills.includes(s.name) ? "btn-primary" : "btn-outline"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt">
          <label htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            rows={4}
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            placeholder="Short professional summary…"
          />
        </div>

        <button className="btn btn-primary mt" type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save profile"}
        </button>
      </form>
    </div>
  );
}
