import type { Page } from "../types";

const paths: Record<Page | "menu" | "close", string> = {
  explore: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  schedule:
    "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M7 3v4 M17 3v4 M3 11h18 M8 15h2 M14 15h2",
  mine: "M6 3h12v18l-6-3-6 3V3Z M9 7h6 M9 11h6",
  rooms: "M4 21V3h13v18 M2 21h20 M17 8h3v13 M13 12h.01",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-3.87",
  reservations: "M4 4h16v17H4z M8 2v4 M16 2v4 M8 10h8 M8 14h8 M8 18h4",
  audit: "M8 3h12v18H4V7 M4 3h4v4H4z M8 11h8 M8 15h8 M8 19h5",
  approvals: "M9 12l2 2 4-4 M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z",
  editor: "M3 3h18v18H3z M3 10h11 M14 3v11 M10 14v7 M14 14h7",
  settings:
    "M4 6h7 M15 6h5 M4 12h2 M10 12h10 M4 18h10 M18 18h2 M11 3v6 M6 9v6 M14 15v6",
  account: "M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10",
  notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "m6 6 12 12 M6 18 18 6",
};

export function NavIcon({ page }: { page: Page | "menu" | "close" }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[page]} />
    </svg>
  );
}
