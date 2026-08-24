// Small square "logo" mark used consistently across the nav bar and the
// public auth pages — a stand-in for a real logo, keeps every entry point
// visually tied together instead of being plain text everywhere.
export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dimensions = size === "lg" ? "h-11 w-11 rounded-xl" : "h-7 w-7 rounded-lg";
  const iconSize = size === "lg" ? "h-6 w-6" : "h-4 w-4";

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ${dimensions}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className={iconSize}>
        <path
          d="M12 4v16M4 12h16"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
