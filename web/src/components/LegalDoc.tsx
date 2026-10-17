import type { ReactNode } from "react";
import { TopBar } from "@/components/ui";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** A long legal page: title, last-updated date, a short summary, contents, then numbered sections. */
export function LegalDoc({ title, updated, summary, sections }: { title: string; updated: string; summary: ReactNode; sections: LegalSection[] }) {
  return (
    <main className="screen">
      <TopBar back />
      <div className="body legal">
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="h1">{title}</h1>
          <span className="small">Last updated {updated}</span>
        </div>
        <div className="banner amber">Draft. To be reviewed by a Nigerian lawyer before launch. Text in [brackets] is still to be filled in.</div>
        <div className="card stack" style={{ gap: 10 }}>{summary}</div>
        <nav aria-label="Contents" className="stack" style={{ gap: 6 }}>
          <span className="h2">Contents</span>
          <ol className="legal-toc">
            {sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
          </ol>
        </nav>
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className="stack" style={{ gap: 8, scrollMarginTop: 16 }}>
            <h2 className="h2">{i + 1}. {s.title}</h2>
            {s.body}
          </section>
        ))}
      </div>
    </main>
  );
}
