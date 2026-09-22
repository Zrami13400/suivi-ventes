import { cx } from "./ui";
import type { ActeType } from "@/lib/constants";

const PATHS: Record<ActeType, string> = {
  Freebox: "M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4V11M21 7v10l-9 4",
  "Forfait mobile": "M4 20h.01M9 20v-6M14 20V9M19 20V4",
  Téléphone:
    "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 16h.01",
};

export function ActeIcon({ acte, className }: { acte: ActeType; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("h-5 w-5", className)}
      aria-hidden
    >
      <path d={PATHS[acte]} />
    </svg>
  );
}
