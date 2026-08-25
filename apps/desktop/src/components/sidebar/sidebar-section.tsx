import { useState, type ReactNode } from "react";

interface SidebarSectionProps {
  title: string;
  children: ReactNode;
}

export const SIDEBAR_SECTION_LABEL_CLASS =
  "group flex h-5 items-center gap-1 pl-3 pr-2 text-left text-[12px] font-medium tracking-normal text-[var(--text-muted)] opacity-60";

export function SidebarSection({ title, children }: SidebarSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <button
        type="button"
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        className={`${SIDEBAR_SECTION_LABEL_CLASS} hover:opacity-100`}
      >
        <span>{title}</span>
        <span
          aria-hidden="true"
          className={`flex h-3 w-3 items-center justify-center transition-transform duration-150 ease-out ${
            isCollapsed ? "" : "rotate-90"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M4.5 3.5L7.5 6L4.5 8.5"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {!isCollapsed && children}
    </section>
  );
}

interface ShowMoreButtonProps {
  onClick: () => void;
}

export function ShowMoreButton({ onClick }: ShowMoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-[32px] w-full items-center gap-1.5 rounded-lg pr-2 pl-[10px] text-left text-[13px] leading-[1.15] text-[var(--fg-base)] hover:bg-[var(--surface-subtle)]"
    >
      <span className="flex w-5 shrink-0 items-center justify-center opacity-60 group-hover:opacity-100">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 12H7.01M12 12H12.01M17 12H17.01"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap opacity-60 group-hover:opacity-100">
        Show More
      </span>
    </button>
  );
}
