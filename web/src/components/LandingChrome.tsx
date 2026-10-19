import Link from "next/link";
import { MailIcon } from "@/components/icons";
import { BunkMark } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/site";
import styles from "@/app/landing.module.css";

/** Sticky top bar for the full-width marketing pages. */
export function LandingNav({ links, cta }: { links: { href: string; label: string }[]; cta: { href: string; label: string } }) {
  return (
    <header className={styles.nav}>
      <div className={styles.wrap}>
        <Link href="/" className={styles.brand} aria-label="Bunkie home">
          <i><BunkMark /></i>bunkie
        </Link>
        <nav className={styles.links} aria-label="Sections">
          {links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
        <Link href={cta.href} className={styles.navCta}>{cta.label}</Link>
      </div>
    </header>
  );
}

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.wrap} ${styles.footGrid}`}>
        <Link href="/" className={styles.brand} aria-label="Bunkie home"><i><BunkMark /></i>bunkie</Link>
        <nav aria-label="Footer">
          <Link href="/abuja">Rooms in Abuja</Link>
          <Link href="/make-money-as-a-corper">Earn as a corper</Link>
          <Link href="/partners">Host partners</Link>
          <Link href="/help">Help</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/waitlist">Other states</Link>
        </nav>
        <div id="contact" className={styles.footContact}>
          <b>Contact us</b>
          <a href={`mailto:${SUPPORT_EMAIL}`}><MailIcon size={18} />{SUPPORT_EMAIL}</a>
        </div>
        <p>Not affiliated with or endorsed by NYSC.</p>
      </div>
    </footer>
  );
}
