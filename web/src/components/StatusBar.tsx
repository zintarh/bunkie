"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const WHITE = "#ffffff";
/** Top edge of the green .hero header (globals.css). */
const HERO = "#22c274";

/** The colour at the top of the screen: data-statusbar, the green header, a solid background, else white. */
function topColor(): string {
  let el = document.elementFromPoint(window.innerWidth / 2, 1) as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.dataset.statusbar) return el.dataset.statusbar;
    if (el.classList.contains("hero")) return HERO;
    const bg = getComputedStyle(el).backgroundColor;
    // Only solid colours: a see-through bar (like the landing nav) shows what's behind it.
    if (bg.startsWith("rgb(")) return bg;
    el = el.parentElement;
  }
  return WHITE;
}

/**
 * Phones: the status bar (theme-color) and the page behind it take the colour at the top of the screen,
 * so a green header runs up into the status bar and white screens stay white.
 */
export function StatusBar() {
  const path = usePathname();
  useEffect(() => {
    if (window.innerWidth >= 1024) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    const apply = () => {
      const c = topColor();
      meta?.setAttribute("content", c);
      document.documentElement.style.backgroundColor = c;
    };
    // Screens fill in after their data loads, and the welcome splash fades out, so look again on changes.
    let frame = 0;
    const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(apply); };
    const watch = new MutationObserver(later);
    watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    document.addEventListener("transitionend", later);
    apply();
    return () => { watch.disconnect(); document.removeEventListener("transitionend", later); cancelAnimationFrame(frame); };
  }, [path]);
  return null;
}
