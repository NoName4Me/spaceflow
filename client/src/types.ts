import type { z } from "zod";
import type { elementsSchema } from "../../server/layout-schema";
export type Page =
  | "explore"
  | "schedule"
  | "mine"
  | "rooms"
  | "users"
  | "reservations"
  | "audit"
  | "approvals"
  | "editor"
  | "settings"
  | "account"
  | "notifications";
export type Rule = "instant" | "approval" | "admin";
export type RoomStatus = "enabled" | "disabled" | "hidden" | "maintenance";
export type BookingStatus =
  "confirmed" | "pending" | "cancelled" | "rejected" | "expired";
export type LayoutElement = z.infer<typeof elementsSchema>[number];
export type ShapeType = LayoutElement["type"];
export interface LayoutTemplate {
  id: string;
  name: string;
  type: string;
  layout: LayoutElement[];
  version: number;
  is_builtin: boolean;
}
export interface LayoutVersion {
  version: number;
  created_at: string;
  actor: string | null;
}
export interface User {
  id: string;
  name: string;
  username: string;
  role: "admin" | "member";
  email: string | null;
  department_id: string | null;
}
export interface DirectoryUser extends User {
  active: boolean;
  department: string | null;
}
export interface Directory {
  users: DirectoryUser[];
  departments: { id: string; name: string }[];
}
export interface Access {
  viewRestricted?: boolean;
  bookRestricted?: boolean;
  viewDepartments?: string[];
  bookDepartments?: string[];
  viewUsers?: string[];
  bookUsers?: string[];
  denyViewUsers?: string[];
  denyBookUsers?: string[];
}
export interface Room {
  id: string;
  name: string;
  code: string;
  building: string;
  floor: string;
  floorId: string;
  capacity: number;
  area: number;
  type: string;
  layoutTemplateId: string;
  equip: string[];
  desc: string;
  rule: Rule;
  status: RoomStatus;
  repeat: boolean;
  canBook?: boolean;
  access?: Access;
}
export interface Booking {
  id: string;
  roomId: string;
  roomName?: string;
  seriesId: string | null;
  revision: number;
  date: string;
  start: string;
  end: string;
  status: BookingStatus;
  hidden: boolean;
  owner: "me" | "other";
  title: string;
  contact?: string;
  phone?: string;
  notes?: string;
  ownerName?: string;
  createdAt?: string;
  detailsHidden?: boolean;
}
export interface Workspace {
  user: User;
  rooms: Room[];
  bookings: Booking[];
  layoutTemplates: LayoutTemplate[];
  unread: number;
}
export interface Building {
  id: string;
  name: string;
  sort_order: number;
}
export interface Floor {
  id: string;
  name: string;
  building_id: string;
  sort_order: number;
}
export interface Catalog {
  buildings: Building[];
  floors: Floor[];
}
export interface Calendar {
  dates: string[];
  rooms: Room[];
  bookings: Booking[];
  page: number;
  pages: number;
  total: number;
}
export interface Audit {
  id: string;
  action: string;
  name: string | null;
  target_name: string | null;
  created_at: string;
}
export interface Notification {
  id: string;
  title: string;
  room: string;
  start: string;
  status: BookingStatus | "updated";
  read_at: string | null;
  created_at: string;
}
export interface Filters {
  building: string;
  floor: string;
  date: string;
  start: string;
  end: string;
  capacity: number;
  equip: string[];
}
