// This is the only boundary that exposes booking details to a browser.
// In particular, a hidden record must not leak its owner or notes through another view.
interface BookingRow {
  id: string;
  room_id: string;
  user_id: string;
  series_id: string | null;
  revision: number;
  date: string;
  start: string;
  end: string;
  status: string;
  hidden: boolean;
  title: string;
  contact: string;
  phone: string;
  notes: string;
  owner_name: string;
  created_at: Date;
}
export function bookingView(
  b: BookingRow,
  user: Express.Request["user"],
  hiddenTitle = "已占用",
) {
  const visible = !b.hidden || b.user_id === user.id || user.role === "admin";
  return {
    id: b.id,
    roomId: b.room_id,
    seriesId: b.series_id,
    revision: b.revision,
    date: b.date,
    start: b.start,
    end: b.end,
    status: b.status,
    hidden: b.hidden,
    detailsHidden: !visible,
    owner: b.user_id === user.id ? "me" : "other",
    createdAt: b.created_at,
    ...(visible
      ? {
          title: b.title,
          contact: b.contact,
          phone: b.phone,
          notes: b.notes,
          ownerName: b.owner_name,
        }
      : { title: hiddenTitle }),
  };
}
