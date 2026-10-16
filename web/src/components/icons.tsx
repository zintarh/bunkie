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

/** Hosting: the house with a plus, for listing a room. */
export function HostIcon({ size = 24 }: IconProps) {
  return svg(size, (
    <>
      <path d="M3.6 10.3 11 4.2a1.6 1.6 0 0 1 2 0l7.4 6.1c.4.3.6.8.6 1.3v7.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 18.8v-7.2c0-.5.2-1 .6-1.3Z" />
      <path d="M12 11v6M9 14h6" />
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

// Product icons, drawn on the same grid as the nav icons (outline only).

/** Camp: a tent with crossed poles and an open door. */
export function CampIcon({ size = 24 }: IconProps) {
  return svg(size, <><path d="M12 5 20.5 20h-17Z" /><path d="M10.4 2.6 12 5l1.6-2.4" /><path d="M9.5 20 12 15.5l2.5 4.5" /></>);
}

/** PPA / place: a map pin. */
export function PinIcon({ size = 24 }: IconProps) {
  return svg(size, <><path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0c0 5.6-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></>);
}

/** Move-in: a key. */
export function KeyIcon({ size = 24 }: IconProps) {
  return svg(size, <><circle cx="8" cy="16" r="4.2" /><path d="M11 13 19.5 4.5M16 8l2.5 2.5M13.8 10.2l1.8 1.8" /></>);
}

/** Money: a wallet with a card slot. */
export function WalletIcon({ size = 24 }: IconProps) {
  return svg(size, <><rect x="3" y="6.5" width="18" height="13.5" rx="3.5" /><path d="m6 6.5 9.4-2.9A1.5 1.5 0 0 1 17.3 5v1.5" /><path d="M21 11h-3.5a2 2 0 0 0 0 4H21" /></>);
}

/** Dates and stay length: a calendar. */
export function CalendarIcon({ size = 24 }: IconProps) {
  return svg(size, <><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" /><path d="M8 3v4M16 3v4M3.5 10h17M8 14.5h.01M12 14.5h.01M16 14.5h.01" /></>);
}

/** Video viewing: a camera. */
export function VideoIcon({ size = 24 }: IconProps) {
  return svg(size, <><rect x="2.5" y="6" width="13.5" height="12" rx="3.5" /><path d="m16 10.5 4.3-2.6c.5-.3 1.2.1 1.2.7v6.8c0 .6-.7 1-1.2.7L16 13.5" /></>);
}

/** Safety: a shield with a tick. */
export function ShieldIcon({ size = 24 }: IconProps) {
  return svg(size, <><path d="M12 3.2 5 5.8c-.6.2-1 .8-1 1.4v4.6c0 4.4 3.2 7.8 8 9.2 4.8-1.4 8-4.8 8-9.2V7.2c0-.6-.4-1.2-1-1.4Z" /><path d="m8.8 12.2 2.2 2.2 4.2-4.4" /></>);
}

/** Verified: a seal with a tick. */
export function VerifiedIcon({ size = 24 }: IconProps) {
  return svg(size, <><path d="M12 2.4 15.1 4.5 18.8 5.2 19.5 8.9 21.6 12 19.5 15.1 18.8 18.8 15.1 19.5 12 21.6 8.9 19.5 5.2 18.8 4.5 15.1 2.4 12 4.5 8.9 5.2 5.2 8.9 4.5Z" /><path d="m8.6 12.2 2.3 2.3 4.5-4.6" /></>);
}

/** Privacy: a padlock. */
export function LockIcon({ size = 24 }: IconProps) {
  return svg(size, <><rect x="4.5" y="10.5" width="15" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" /></>);
}

/** Corper host: a sparkle. */
export function SparkIcon({ size = 24 }: IconProps) {
  return svg(size, <><path d="M10.5 3.5c.6 4 2.5 5.9 6.5 6.5-4 .6-5.9 2.5-6.5 6.5-.6-4-2.5-5.9-6.5-6.5 4-.6 5.9-2.5 6.5-6.5Z" /><path d="M18.5 15.5v5M16 18h5" /></>);
}

/** Commute: a clock. */
export function ClockIcon({ size = 24 }: IconProps) {
  return svg(size, <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
}

export function SearchIcon({ size = 24 }: IconProps) {
  return svg(size, <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>);
}

export function CheckIcon({ size = 24 }: IconProps) {
  return svg(size, <path d="m5 12.5 4.5 4.5L19 7.5" />);
}

export function ArrowIcon({ size = 24 }: IconProps) {
  return svg(size, <path d="M5 12h14M13 6l6 6-6 6" />);
}

export function ChevronDownIcon({ size = 24 }: IconProps) {
  return svg(size, <path d="m6 9.5 6 6 6-6" />);
}
