import type { Booking, Filters, Room } from "./types";
export const today = () => new Date().toLocaleDateString("sv-SE");
export const initialFilters = (): Filters => ({
  building: "all",
  floor: "all",
  date: today(),
  start: "10:00",
  end: "11:00",
  capacity: 0,
  equip: [],
});
export const overlap = (a: string, b: string, c: string, d: string) =>
  a < d && c < b;
export function available(
  room: Room,
  filters: Filters,
  bookings: Booking[],
  admin: boolean,
) {
  return (
    room.canBook !== false &&
    room.status === "enabled" &&
    (room.rule !== "admin" || admin) &&
    filters.start < filters.end &&
    !bookings.some(
      (b) =>
        b.roomId === room.id &&
        b.date === filters.date &&
        ["confirmed", "pending"].includes(b.status) &&
        overlap(filters.start, filters.end, b.start, b.end),
    )
  );
}
export const statusLabels = {
  confirmed: "已确认",
  pending: "待审批",
  cancelled: "已取消",
  rejected: "已拒绝",
  expired: "已过期",
  updated: "已修改",
};
export const ruleLabels = {
  instant: "直接预订",
  approval: "管理员审批",
  admin: "仅管理员",
};
export const roomStatusLabels = {
  enabled: "启用",
  disabled: "停用",
  hidden: "隐藏",
  maintenance: "维护",
};
export const splitEquipment = (value: FormDataEntryValue | null) =>
  String(value || "")
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
export const value = (form: FormData, name: string) =>
  String(form.get(name) || "");
