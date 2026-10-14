import { TopBar } from "@/components/ui";

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <main className="screen">
      <TopBar back />
      <div className="body">
        <h1 className="h1">Privacy, in plain words</h1>
        <div className="card stack" style={{ gap: 10 }}>
          <span className="h2">Hosts see</span><p>Your first name, photo, bunkie profile and a verified badge.</p>
          <span className="h2">Hosts never see</span><p>Your NIN, documents or phone number.</p>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <span className="h2">What we keep</span>
          <p>The result of each check (passed or not) and a masked name. We don&apos;t keep your NIN. ID photos and letters are deleted after the check. [Retention period to confirm with counsel]</p>
          <span className="h2">Delete your data</span>
          <p>Ask from Get help and we delete your account and files. Records we must keep by law, like payments, stay.</p>
        </div>
        <p className="small">[Company name] · Nigeria Data Protection Act 2023 · [DPO contact]</p>
      </div>
    </main>
  );
}
