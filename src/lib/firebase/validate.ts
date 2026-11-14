import { HttpError } from "./admin";
import type { Role } from "@/lib/types";

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  return ((await request.json().catch(() => ({}))) ?? {}) as Partial<T>;
}

export function requireName(value: unknown, what = "Name"): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new HttpError(400, `${what} is required`);
  if (name.length > 80) throw new HttpError(400, `${what} must be 80 characters or fewer`);
  return name;
}

export function requireMemberRole(value: unknown): Exclude<Role, "owner"> {
  if (value === "editor" || value === "viewer") return value;
  throw new HttpError(400, "Role must be editor or viewer");
}
