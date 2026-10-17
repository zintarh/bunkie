import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/LegalDoc";

export const metadata = { title: "Terms" };

const SUMMARY = (
  <>
    <span className="h2">The short version</span>
    <ul>
      <li>Bunkie connects corp members with hosts to share a home. We’re not a landlord or an agent, and we’re not part of NYSC.</li>
      <li>Everyone is verified before they request or list a room.</li>
      <li>Pay only in Bunkie. Rent is held until you move in, then paid to the host bit by bit.</li>
      <li>What you agree in the app (price, rules, dates, refunds) is the deal. Changes need both of you to agree again.</li>
      <li>Be honest, be kind, and never ask anyone to pay outside the app.</li>
    </ul>
  </>
);

const SECTIONS: LegalSection[] = [
  {
    id: "about", title: "About these terms",
    body: (
      <>
        <p>These terms are an agreement between you and Bunkie (“Bunkie”, “we”, “us”) for using the Bunkie app and website. By creating an account or using Bunkie, you accept them. If you don’t agree, please don’t use Bunkie.</p>
        <p>Our <Link href="/privacy">Privacy policy</Link> explains how we handle personal data and forms part of these terms.</p>
      </>
    ),
  },
  {
    id: "what", title: "What Bunkie is, and isn’t",
    body: (
      <>
        <p>Bunkie is a platform where corp members (“corpers”) find a verified person to share a home with, and where hosts offer space in their homes. Hosts can be serving corpers, past corpers or other verified people.</p>
        <p>Bunkie is not a landlord, estate agent or property manager, and does not own or control any room. The arrangement to share a home is between the corper and the host. Bunkie provides the tools to find each other, agree terms, and pay safely, and holds payments as described below.</p>
        <p>Bunkie is not affiliated with, endorsed by or acting for the National Youth Service Corps (NYSC).</p>
      </>
    ),
  },
  {
    id: "who", title: "Who can use Bunkie",
    body: (
      <ul>
        <li>You must be 18 or older and able to enter a binding agreement.</li>
        <li>Bunkie currently works in Abuja (FCT) only.</li>
        <li>You must complete verification before you request a room, post what you’re looking for, or publish a room.</li>
        <li>One account per person. You may not use someone else’s account or identity.</li>
      </ul>
    ),
  },
  {
    id: "account", title: "Your account",
    body: (
      <ul>
        <li>Give accurate details and keep them up to date, including your name as it appears on your ID.</li>
        <li>Keep your password safe. You’re responsible for what happens on your account.</li>
        <li>Tell us straight away through <Link href="/help">Get help</Link> if you think someone else has used your account.</li>
      </ul>
    ),
  },
  {
    id: "hosts", title: "For hosts",
    body: (
      <>
        <ul>
          <li><b>Your right to host.</b> You confirm that you’re allowed to share the space, including any permission needed from your landlord or the property owner, and that hosting doesn’t break your lease or the law.</li>
          <li><b>Honest listings.</b> Photos must be taken in the app and show the room as it is. Price, bills, house rules, household type and availability must be accurate and kept up to date.</li>
          <li><b>Review before going live.</b> Every new room is reviewed by Bunkie before it appears in search. We may ask for changes or decline a room.</li>
          <li><b>Safe and as listed.</b> The room must be safe, habitable and match the listing on move-in day.</li>
          <li><b>Your bank account.</b> Payouts go only to a Nigerian bank account in your name.</li>
          <li><b>Belongings.</b> You may never keep a corper’s belongings to force payment or settle a dispute.</li>
        </ul>
      </>
    ),
  },
  {
    id: "corpers", title: "For corpers",
    body: (
      <ul>
        <li>Read the listing, house rules and refund rules before you request.</li>
        <li>Respect the home, the house rules and the people you share with.</li>
        <li>Use the room only as a home for yourself, unless the host agrees otherwise in the app.</li>
        <li>Leave the room in the condition you found it, apart from normal wear.</li>
      </ul>
    ),
  },
  {
    id: "booking", title: "Requests, viewings and agreements",
    body: (
      <>
        <p><b>Requests.</b> A corper requests a room; the host accepts or declines. Hosts choose who they host, but may not refuse anyone for reasons the law forbids. Choosing a women-only, men-only or mixed household is allowed.</p>
        <p><b>Viewings.</b> Viewings can be by video call or in person. A host may charge an inspection fee of up to ₦5,000 for an in-person viewing. Bunkie holds the fee. It is refunded to the corper if the host declines, cancels, doesn’t show up, or the room isn’t as listed. The host keeps it if the corper doesn’t show up or cancels less than 6 hours before. If the corper books the room, the fee is taken off their first payment.</p>
        <p><b>Agreement.</b> Before anyone pays, both people agree in the app on the price, bills, deposit, house rules, dates, notice period and refund rules. That agreement is the deal between you. Any change needs both of you to confirm it again in the app.</p>
      </>
    ),
  },
  {
    id: "payments", title: "Payments and fees",
    body: (
      <>
        <ul>
          <li><b>Pay only in Bunkie.</b> All rent, deposits and inspection fees are paid in the app through our payment provider, Paystack. Never pay a host or anyone else outside the app or into a personal account. Payments made outside Bunkie are not protected.</li>
          <li><b>Held until move-in.</b> Bunkie holds rent until the corper moves in. After move-in, rent is paid to the host one period at a time (week by week or month by month) as the stay goes on.</li>
          <li><b>Monthly rent.</b> For monthly stays, each month’s rent is paid in the app. Payment opens 7 days before the month starts.</li>
          <li><b>Short stays</b> (1 to 4 weeks): the whole stay is paid upfront, with no deposit.</li>
          <li><b>Fees.</b> Bunkie keeps 2% of rent and inspection fees paid to the host. The person paying covers the payment provider’s charge, which is shown before you pay. Searching, chatting and requesting are free.</li>
          <li><b>Payment agent.</b> Hosts appoint Bunkie as their limited agent to collect payments from corpers. A corper’s payment to Bunkie counts as payment to the host.</li>
        </ul>
        <p>[Payment holding arrangements to confirm with Paystack and counsel, including any Central Bank of Nigeria requirements.]</p>
      </>
    ),
  },
  {
    id: "refunds", title: "Cancellations, leaving early and refunds",
    body: (
      <ul>
        <li><b>Before move-in:</b> if the host cancels or the room isn’t as listed, the corper gets a full refund. Other cancellations follow the refund rules agreed in the app.</li>
        <li><b>Leaving early:</b> the corper gives the notice period agreed in the app. Rent for periods not yet paid to the host is refunded, following the agreed refund rules, including the rule for corpers who are redeployed.</li>
        <li><b>Short stays:</b> unused nights are refunded, except the last 3.</li>
        <li>Refunds go back to the original payment method. The payment provider’s charge may not be refundable.</li>
      </ul>
    ),
  },
  {
    id: "deposits", title: "Deposits",
    body: (
      <ul>
        <li>Bunkie holds the deposit until move-out.</li>
        <li>At move-out, both people take photos in the app. The host can propose deductions for damage beyond normal wear, with photos. The corper can accept or dispute.</li>
        <li>If you can’t agree, the Bunkie team looks at the agreement, photos and messages and decides how the deposit is split. Our decision on the deposit is final within Bunkie, but doesn’t stop either of you from taking other lawful action.</li>
        <li>If nobody raises a deduction, the deposit is returned when the stay ends.</li>
      </ul>
    ),
  },
  {
    id: "conduct", title: "How everyone must behave",
    body: (
      <>
        <p>You must not:</p>
        <ul>
          <li>ask for or make payments outside Bunkie, or share contact details to avoid paying through the app;</li>
          <li>post fake, misleading or someone else’s rooms, photos or details;</li>
          <li>scam, threaten, harass, discriminate against or abuse anyone;</li>
          <li>use Bunkie for anything illegal, including letting a space you have no right to let;</li>
          <li>post reviews that aren’t honest, or offer anything in exchange for a review;</li>
          <li>copy, scrape or interfere with Bunkie, or try to reach data that isn’t yours.</li>
        </ul>
      </>
    ),
  },
  {
    id: "chat", title: "Messages",
    body: (
      <p>To protect people from scams, contact details such as phone and account numbers, emails and links are hidden in chat until a stay is paid. Messages that look like scams may be flagged and reviewed by our team. See the <Link href="/privacy">Privacy policy</Link> for details.</p>
    ),
  },
  {
    id: "reviews", title: "Reviews and posts",
    body: (
      <ul>
        <li>After a stay, both people have 14 days to review each other. Reviews show once both have reviewed, or when the 14 days end.</li>
        <li>Reviews and room posts must be honest and respectful. We may remove ones that break these terms.</li>
        <li>You keep ownership of what you post, and give Bunkie permission to show it in the app and to promote Bunkie.</li>
      </ul>
    ),
  },
  {
    id: "safety", title: "Reports, suspension and closing accounts",
    body: (
      <>
        <p>You can report a person, room or message from the app. We may investigate, warn, remove content, suspend or close an account, and hold payouts while a report or dispute is open. We act in proportion to what happened, and you can ask us to review a decision through <Link href="/help">Get help</Link>.</p>
        <p>You can close your account at any time. Bookings already paid and open disputes are completed first.</p>
        <p>In an emergency or if you feel unsafe, contact the police or emergency services first, then tell us.</p>
      </>
    ),
  },
  {
    id: "liability", title: "Our responsibility",
    body: (
      <>
        <p>We work hard to keep Bunkie safe: we verify people and review rooms. But we can’t guarantee how anyone behaves, or the condition of any room, beyond what these terms say. You’re responsible for your own decisions about who you live with.</p>
        <p>As far as the law allows, Bunkie is not liable for indirect or unforeseeable loss, or for loss caused by other users. Our total liability to you for any claim is limited to the fees Bunkie earned from your bookings in the 12 months before the claim. Nothing in these terms limits any right you have under the Federal Competition and Consumer Protection Act 2018 or other law that can’t be excluded.</p>
        <p>You agree to cover Bunkie’s reasonable losses caused by you breaking these terms or the law.</p>
      </>
    ),
  },
  {
    id: "disputes", title: "Disputes and the law",
    body: (
      <>
        <p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>
        <p>If you have a problem with Bunkie, contact us first through <Link href="/help">Get help</Link> and we’ll try to fix it. If we can’t resolve it within 30 days, either side may refer it to mediation, and then to arbitration in Abuja under the Arbitration and Mediation Act 2023, or to the courts of the Federal Capital Territory. [Dispute route to confirm with counsel.]</p>
      </>
    ),
  },
  {
    id: "changes", title: "Changes to these terms",
    body: <p>We may update these terms as Bunkie grows. We’ll show the date at the top and tell you in the app or by email before an important change applies. If you keep using Bunkie after that, the new terms apply.</p>,
  },
  {
    id: "contact", title: "Contact us",
    body: <p>Support: [support email], [support phone], or <Link href="/help">Get help</Link> in the app.</p>,
  },
];

export default function Terms() {
  return <LegalDoc title="Terms of use" updated="[date]" summary={SUMMARY} sections={SECTIONS} />;
}
