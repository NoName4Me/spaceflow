import { z } from "zod";
export type Identity = {
  id: string;
  role: "admin" | "member";
  department_id?: string | null;
};
const ids = z.array(z.uuid()).max(500).default([]);
export const accessSchema = z
  .object({
    viewRestricted: z.boolean().default(false),
    bookRestricted: z.boolean().default(false),
    viewDepartments: ids,
    bookDepartments: ids,
    viewUsers: ids,
    bookUsers: ids,
    denyViewUsers: ids,
    denyBookUsers: ids,
  })
  .strict();
export function canView(room: any, user: Identity) {
  if (user.role === "admin") return true;
  if (room.status === "hidden") return false;
  const a = room.access || {};
  return (
    !(a.denyViewUsers || []).includes(user.id) &&
    (!a.viewRestricted ||
      (a.viewUsers || []).includes(user.id) ||
      (a.viewDepartments || []).includes(user.department_id))
  );
}
export function canBook(room: any, user: Identity) {
  if (!canView(room, user) || ["disabled", "maintenance"].includes(room.status))
    return false;
  if (user.role === "admin") return true;
  if (room.rule === "admin") return false;
  const a = room.access || {};
  return (
    !(a.denyBookUsers || []).includes(user.id) &&
    (!a.bookRestricted ||
      (a.bookUsers || []).includes(user.id) ||
      (a.bookDepartments || []).includes(user.department_id))
  );
}
