// Bunkie's own nav icons. One 24px grid, 2px rounded strokes, soft corners. Each has an outline
// form and a filled form for the active tab (filled shapes take currentColor; cut-outs use the
// background so they read on any tab colour).

type IconProps = { size?: number; active?: boolean };

const svg = (size: number, children: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** Home: a soft-roofed house with an arched door. */
export function HomeIcon({ size = 24, active }: IconProps) {
  return svg(size, active ? (
    <>
      <path d="M3.6 10.3 11 4.2a1.6 1.6 0 0 1 2 0l7.4 6.1c.4.3.6.8.6 1.3v7.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 18.8v-7.2c0-.5.2-1 .6-1.3Z" fill="currentColor" />
      <path d="M9.5 21v-4.2a2.5 2.5 0 0 1 5 0V21" stroke="var(--white)" />
    </>
  ) : (
    <>
      <path d="M3.6 10.3 11 4.2a1.6 1.6 0 0 1 2 0l7.4 6.1c.4.3.6.8.6 1.3v7.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 18.8v-7.2c0-.5.2-1 .6-1.3Z" />
      <path d="M9.5 21v-4.2a2.5 2.5 0 0 1 5 0V21" />
    </>
  ));
}

/** Bookings: Bunkie's bunk mark (two posts, two beds with pillows), the same shape as the logo. */
export function BunkIcon({ size = 24, active }: IconProps) {
  return svg(size, active ? (
    <>
      <rect x="4" y="7.5" width="16" height="5" rx="1.8" fill="currentColor" stroke="none" />
      <rect x="4" y="14.5" width="16" height="5" rx="1.8" fill="currentColor" stroke="none" />
      <rect x="6" y="9" width="4" height="2" rx="1" fill="var(--white)" stroke="none" />
      <rect x="6" y="16" width="4" height="2" rx="1" fill="var(--white)" stroke="none" />
      <path d="M4 3.5v17M20 3.5v17" strokeWidth={2.4} />
    </>
  ) : (
    <>
      <path d="M4 3.5v17M20 3.5v17" />
      <rect x="4" y="7.5" width="16" height="5" rx="1.8" />
      <rect x="4" y="14.5" width="16" height="5" rx="1.8" />
      <path d="M7 10h2.5M7 17h2.5" />
    </>
  ));
}

/** Host: a key with a round bow, for opening your home. */
export function KeyIcon({ size = 24, active }: IconProps) {
  return svg(size, active ? (
    <>
      <circle cx="8" cy="15.5" r="5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="15.5" r="1.6" fill="var(--white)" stroke="none" />
      <path d="M11.6 11.9 19.5 4M16.2 7.3l2.3 2.3M18.4 5.1l2 2" strokeWidth={2.4} />
    </>
  ) : (
    <>
      <circle cx="8" cy="15.5" r="4.5" />
      <circle cx="8" cy="15.5" r="1" fill="currentColor" stroke="none" />
      <path d="M11.3 12.2 19.5 4M16.2 7.3l2.3 2.3M18.4 5.1l2 2" />
    </>
  ));
}

/** Profile: a rounded badge with a person, like an ID card. */
export function ProfileIcon({ size = 24, active }: IconProps) {
  return svg(size, active ? (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="2.8" fill="var(--white)" stroke="none" />
      <path d="M7.4 17.6c.9-2 2.7-3.1 4.6-3.1s3.7 1.1 4.6 3.1" stroke="var(--white)" />
    </>
  ) : (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="6" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M7.6 17.4c.9-1.8 2.6-2.9 4.4-2.9s3.5 1.1 4.4 2.9" />
    </>
  ));
}

/** Messages: a rounded speech bubble with two lines. */
export function ChatIcon({ size = 24, active }: IconProps) {
  return svg(size, active ? (
    <>
      <path d="M4 6.8A3.3 3.3 0 0 1 7.3 3.5h9.4A3.3 3.3 0 0 1 20 6.8v6.4a3.3 3.3 0 0 1-3.3 3.3H11l-4.4 3.6c-.5.4-1.1 0-1.1-.6v-3A3.3 3.3 0 0 1 4 13.2Z" fill="currentColor" />
      <path d="M8.5 8.7h7M8.5 11.9h4.5" stroke="var(--white)" />
    </>
  ) : (
    <>
      <path d="M4 6.8A3.3 3.3 0 0 1 7.3 3.5h9.4A3.3 3.3 0 0 1 20 6.8v6.4a3.3 3.3 0 0 1-3.3 3.3H11l-4.4 3.6c-.5.4-1.1 0-1.1-.6v-3A3.3 3.3 0 0 1 4 13.2Z" />
      <path d="M8.5 8.7h7M8.5 11.9h4.5" />
    </>
  ));
}
