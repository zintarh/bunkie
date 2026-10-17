import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/LegalDoc";

export const metadata = { title: "Privacy" };

const SUMMARY = (
  <>
    <span className="h2">In plain words</span>
    <ul>
      <li>Hosts and corpers see your first name, photo, bunkie answers and a verified badge. Never your ID documents, NIN or phone number.</li>
      <li>We use your details to verify you, match you with a bunkie, run bookings and payments, and keep everyone safe.</li>
      <li>We don’t sell your data, and we don’t use it for outside advertising.</li>
      <li>ID photos and letters are deleted after your check. We keep the result.</li>
      <li>You can see, correct, download or delete your data. Ask from <Link href="/help">Get help</Link>.</li>
    </ul>
  </>
);

const SECTIONS: LegalSection[] = [
  {
    id: "who", title: "Who we are",
    body: (
      <>
        <p>Bunkie is the data controller for the personal data described here. In this policy, “Bunkie”, “we” and “us” mean Bunkie and the company that runs it.</p>
        <p>Bunkie helps corp members find a bunkie: a fellow corper, or another verified host, to share a home with during the service year. Bunkie is not affiliated with or endorsed by the National Youth Service Corps (NYSC).</p>
        <p>Our Data Protection Officer can be reached at [dpo email]. This policy follows the Nigeria Data Protection Act 2023 (NDPA) and the rules of the Nigeria Data Protection Commission (NDPC).</p>
      </>
    ),
  },
  {
    id: "collect", title: "What we collect",
    body: (
      <>
        <p><b>Account details.</b> Your email address and password (stored only as a secure hash), or your name and email if you sign in with Google.</p>
        <p><b>Profile.</b> Your first and last name, photo, where you are in NYSC (in camp, posted or serving), your batch, your PPA area, the household you’d share with (women only, men only or mixed), and your answers to the bunkie questions about sleep, guests, cooking, cleaning and noise.</p>
        <p><b>Verification.</b> To confirm who you are, we ask for an ID number, a live selfie and, for corp members, NYSC documents such as a call-up letter, posting or acceptance letter, state code or discharge certificate. We may ask for a phone number. Checks are done with an identity verification provider. We keep the result of each check (passed or not), a masked version of your name and the date. ID photos and letters are deleted once the check is complete, unless we need them for an open safety review. [Retention period to confirm with counsel.]</p>
        <p><b>Rooms.</b> If you host: the room’s location, photos taken in the app (with the time and place they were taken), price, bills, house rules, availability and the household type.</p>
        <p><b>Bookings and stays.</b> Requests, viewings, inspections, agreements, move-in and move-out dates and photos, deposit decisions, early-leave notices and reviews.</p>
        <p><b>Messages.</b> Chats between corpers and hosts, including photos you send. See “Keeping chats safe” below.</p>
        <p><b>Payments.</b> Amounts, dates, references and status for rent, deposits and inspection fees. Card and bank details you type when paying go to Paystack, not to us. If you host, we keep your payout bank name, account name and the last four digits of the account number.</p>
        <p><b>Room posts.</b> If you post what you’re looking for: the area, budget, dates, room type and any note you add.</p>
        <p><b>Location.</b> When you allow it, your device’s location, to find your PPA or to stamp room photos. You can say no and type an area instead.</p>
        <p><b>Device and usage.</b> Basic technical data such as your browser, device type, IP address, pages visited and errors, plus a sign-in cookie. Your search preferences are saved on your own phone. If you turn on notifications, we keep a push subscription for your device.</p>
        <p><b>Support and reports.</b> What you tell us when you ask for help or report someone.</p>
      </>
    ),
  },
  {
    id: "use", title: "How we use it, and why we’re allowed to",
    body: (
      <>
        <p>We only use personal data when the NDPA gives us a lawful basis.</p>
        <ul>
          <li><b>To provide Bunkie (contract):</b> your account, search, matching, chat, requests, viewings, agreements, payments, payouts, deposits and reviews.</li>
          <li><b>To keep people safe (legitimate interests and, for ID checks, your consent):</b> verifying identities, reviewing every room before it goes live, spotting scams and off-app payment requests, and handling reports.</li>
          <li><b>To meet the law (legal obligation):</b> keeping payment records, responding to lawful requests and preventing fraud.</li>
          <li><b>To improve Bunkie (legitimate interests):</b> understanding where corpers are looking and fixing problems. We use summaries wherever we can.</li>
          <li><b>To send updates (contract, or consent for optional messages):</b> emails and notifications about your requests, bookings and messages. You can turn off optional notifications at any time.</li>
        </ul>
        <p>Matching uses your bunkie answers and household choice to show a “fit” score. It ranks rooms; it never stops you from seeing or requesting any room. No decision with legal or similarly serious effects is made about you by automated means alone. Account suspensions and disputed payments are decided by a person.</p>
      </>
    ),
  },
  {
    id: "see", title: "What other people see",
    body: (
      <>
        <ul>
          <li><b>Anyone browsing:</b> rooms, the host’s first name, photo, badges (verified, corper host), ratings and reviews, and the room’s approximate area. Never the exact address.</li>
          <li><b>Signed-in users:</b> room posts show your first name, the area you want, your batch and your preferences. No photo, surname or contact details.</li>
          <li><b>The other person in a request or chat:</b> your first name, photo, verified badge, bunkie answers and the messages you send.</li>
          <li><b>After a viewing is booked:</b> the corper sees the room’s exact location.</li>
          <li><b>After payment:</b> phone numbers and contact details shared in chat stop being hidden.</li>
        </ul>
        <p>Hosts and corpers never see your ID number, ID photos, NYSC documents or bank details.</p>
      </>
    ),
  },
  {
    id: "chats", title: "Keeping chats safe",
    body: (
      <>
        <p>Many scams start by moving people off the app. Until a stay is paid, phone numbers, bank and account numbers, emails, links and other apps’ handles are hidden in chat. We keep the original message privately so our team can investigate if someone reports a scam.</p>
        <p>Messages that look like common scams are flagged. Trained Bunkie staff can read flagged chats and reported chats to keep people safe. We don’t read chats for any other reason.</p>
      </>
    ),
  },
  {
    id: "share", title: "Who we share it with",
    body: (
      <>
        <p>We don’t sell personal data. We share it only with:</p>
        <ul>
          <li><b>Service providers</b> who work for us under contract and only on our instructions:
            <ul>
              <li>Supabase (database, sign-in and file storage)</li>
              <li>Paystack (payments and payouts)</li>
              <li>an identity verification provider [name to confirm] (ID checks)</li>
              <li>Google Maps Platform (place search, maps and travel times)</li>
              <li>Daily (video viewings)</li>
              <li>Resend (emails)</li>
              <li>Anthropic (to understand the words of a typed search; we send the search text, not who you are)</li>
              <li>your browser’s push service (notifications)</li>
              <li>WhatsApp (only if WhatsApp updates are switched on, and only to tell you there’s a new message)</li>
            </ul>
          </li>
          <li><b>The other people in your booking</b>, as described above.</li>
          <li><b>Authorities</b>, when the law requires it, or to protect someone’s safety or prevent fraud.</li>
          <li><b>A buyer or successor</b> if Bunkie is merged or sold. They must keep this policy’s promises.</li>
        </ul>
      </>
    ),
  },
  {
    id: "abroad", title: "Data stored outside Nigeria",
    body: (
      <p>Some providers store data outside Nigeria. For example, our database is hosted in London, United Kingdom. When data leaves Nigeria, we rely on the transfer rules of the NDPA, such as an adequacy decision or contract terms that protect your data to the NDPA standard. [Transfer basis to confirm with counsel.]</p>
    ),
  },
  {
    id: "keep", title: "How long we keep it",
    body: (
      <ul>
        <li><b>Account and profile:</b> while your account is open, then deleted within [30] days of closing it.</li>
        <li><b>ID photos and documents:</b> deleted once the check is complete. The result is kept while your account is open.</li>
        <li><b>Chats:</b> while your account is open, and longer if a report or dispute about them is still open.</li>
        <li><b>Payment and booking records:</b> for [6] years after the payment, as the law requires for financial records.</li>
        <li><b>Room posts:</b> they stop showing after 30 days or a week after your move-in date, and are deleted [90] days later.</li>
        <li><b>Safety records</b> (reports, suspensions): for as long as needed to keep the community safe, up to [5] years.</li>
      </ul>
    ),
  },
  {
    id: "rights", title: "Your rights",
    body: (
      <>
        <p>Under the NDPA you can:</p>
        <ul>
          <li>ask for a copy of your personal data;</li>
          <li>correct data that’s wrong;</li>
          <li>ask us to delete your data;</li>
          <li>ask us to limit or stop using it, or object to how we use it;</li>
          <li>get your data in a format you can take elsewhere;</li>
          <li>withdraw consent you’ve given, such as for notifications or location;</li>
          <li>not be subject to decisions made only by automated means that seriously affect you.</li>
        </ul>
        <p>Ask from <Link href="/help">Get help</Link> or email [dpo email]. We reply within [30] days. We may need to confirm it’s you first. Some records, like payments, must be kept by law even if you ask us to delete your account.</p>
        <p>If you’re unhappy with how we handle your data, you can complain to the Nigeria Data Protection Commission (ndpc.gov.ng).</p>
      </>
    ),
  },
  {
    id: "security", title: "Keeping it secure",
    body: (
      <p>We use encryption in transit, access controls so each person can only reach their own data, private storage for ID documents, and logs of what our team does. Photos are re-encoded before upload, which removes hidden camera data. No system is perfect: if a breach puts you at risk, we’ll tell you and the NDPC as the law requires.</p>
    ),
  },
  {
    id: "age", title: "Age",
    body: <p>Bunkie is for people aged 18 and over. We don’t knowingly collect data from anyone younger.</p>,
  },
  {
    id: "cookies", title: "Cookies and storage on your device",
    body: (
      <p>We use a cookie to keep you signed in, and your browser’s storage to remember your search preferences and saved rooms. We don’t use advertising or cross-site tracking cookies.</p>
    ),
  },
  {
    id: "changes", title: "Changes to this policy",
    body: <p>We’ll update this page when things change and show the date at the top. If a change matters, we’ll tell you in the app or by email before it applies.</p>,
  },
  {
    id: "contact", title: "Contact us",
    body: <p>Data Protection Officer: [dpo email]. Support: [support email], [support phone].</p>,
  },
];

export default function Privacy() {
  return <LegalDoc title="Privacy policy" updated="[date]" summary={SUMMARY} sections={SECTIONS} />;
}
