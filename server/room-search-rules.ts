import { z } from "zod";
const name = z.string().trim().min(1).max(100);
export const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const searchFiltersSchema = z
  .object({
    building: name,
    floor: name,
    date: z.iso.date(),
    start: clock,
    end: clock,
    capacity: z.number().int().min(0).max(10000),
    equip: z.array(name).max(30),
  })
  .strict();
export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export const assistantFields = z.enum([
  "date",
  "start",
  "end",
  "capacity",
  "equip",
  "building",
  "floor",
]);
export const intentSchema = z
  .object({
    date: z.iso.date().nullable(),
    start: clock.nullable(),
    end: clock.nullable(),
    capacity: z.number().int().min(0).max(10000).nullable(),
    building: name.nullable(),
    floor: name.nullable(),
    equip: z.array(name).max(30),
    preferredBuilding: name.nullable(),
    question: z.string().trim().max(300).nullable(),
    action: z.enum(["ask", "search", "reply"]).optional(),
    reply: z.string().trim().max(1200).optional(),
    fields: z.array(assistantFields).max(7).optional(),
  })
  .strict();
export type SearchIntent = z.infer<typeof intentSchema>;
// Selected requirements are hard constraints; language can add but never relax them.
export function mergeIntent(base: SearchFilters, intent: SearchIntent) {
  for (const field of ["building", "floor"] as const) {
    if (base[field] !== "all" && intent[field] && base[field] !== intent[field])
      return {
        filters: base,
        question: `你已筛选${base[field]}，请先调整${field === "building" ? "楼栋" : "楼层"}筛选后再查找。`,
      };
  }
  return {
    filters: searchFiltersSchema.parse({
      ...base,
      date: intent.date ?? base.date,
      start: intent.start ?? base.start,
      end: intent.end ?? base.end,
      capacity: Math.max(base.capacity, intent.capacity ?? 0),
      building:
        base.building !== "all" ? base.building : (intent.building ?? "all"),
      floor: base.floor !== "all" ? base.floor : (intent.floor ?? "all"),
      equip: [...new Set([...base.equip, ...intent.equip])],
    }),
    question: intent.question,
  };
}
export function matchesRequirements(
  room: {
    building: string;
    floor: string;
    capacity: number;
    equip: string[];
  },
  filters: SearchFilters,
) {
  return (
    (filters.building === "all" || filters.building === room.building) &&
    (filters.floor === "all" || filters.floor === room.floor) &&
    room.capacity >= filters.capacity &&
    filters.equip.every((e) => room.equip.includes(e))
  );
}
export function validSearchWindow(filters: SearchFilters, now = Date.now()) {
  const start = new Date(`${filters.date}T${filters.start}:00+08:00`).valueOf();
  const end = new Date(`${filters.date}T${filters.end}:00+08:00`).valueOf();
  return start < end && start > now && end <= now + 366 * 86400000;
}
