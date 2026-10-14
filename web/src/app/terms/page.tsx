import { TopBar } from "@/components/ui";

export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <main className="screen">
      <TopBar back />
      <div className="body">
        <h1 className="h1">Terms</h1>
        <div className="banner amber">Draft. These terms need legal review before launch.</div>
        <ol className="stack" style={{ paddingLeft: 20, gap: 10 }}>
          <li>Everyone is verified before booking or listing.</li>
          <li>Price, house rules, refund rules and dates are agreed before anyone moves. Changes need both people to confirm again.</li>
          <li>Payment is held until move-in and released to the host 24 hours after check-in. Full refund if the host cancels or the room isn&apos;t as listed.</li>
          <li>Bunkie keeps 2% of each payment. The payer covers Paystack&apos;s charge.</li>
          <li>Minimum notice to leave applies to every stay. Belongings are never held.</li>
          <li>Bunkie is not affiliated with or endorsed by NYSC.</li>
        </ol>
      </div>
    </main>
  );
}
