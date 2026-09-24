import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LEGAL_CONTACT_EMAIL } from "@/components/marketplace/LegalPage";
import { marketplaceUrl } from "@/lib/utils/url";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Bzaro collects, uses, shares and protects personal data of buyers and sellers.",
  alternates: { canonical: marketplaceUrl("/privacy") },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro={
        <p>
          Bzaro (&ldquo;Bzaro&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) runs the B2B marketplace at
          bzaro.in and the seller websites on its subdomains. This policy explains what personal
          data we collect, why, who we share it with, and the choices you have. It is written to
          meet the Digital Personal Data Protection Act, 2023 and the Information Technology Act,
          2000 and its rules.
        </p>
      }
    >
      <LegalSection title="1. Data we collect">
        <ul>
          <li>
            <strong>Account details</strong> — name, email address, phone number and a password
            (stored only as a secure hash).
          </li>
          <li>
            <strong>Google sign-in</strong> — if you choose &ldquo;Continue with Google&rdquo;, we
            receive your name, email address and profile picture from Google. We request no other
            Google data.
          </li>
          <li>
            <strong>Requirements and enquiries</strong> — the product, quantity, location, buying
            timeline, purpose and any message you submit.
          </li>
          <li>
            <strong>Location</strong> — the city or pincode you choose, your browser location if you
            allow it, or an approximate city derived from your IP address.
          </li>
          <li>
            <strong>Seller information</strong> — business name, contact person, address, GSTIN,
            products, photos and plan/billing details.
          </li>
          <li>
            <strong>Orders</strong> — items, delivery address and payment status for purchases made
            on seller websites. Card and UPI details are handled by the payment gateway, not stored
            by us.
          </li>
          <li>
            <strong>Technical data</strong> — IP address (stored hashed for abuse prevention),
            device and browser type, pages visited, and security cookies.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Why we use it">
        <ul>
          <li>To create and secure your account, including sending one-time verification codes.</li>
          <li>
            To route your requirement to the seller you contacted (a &ldquo;Direct Lead&rdquo;) and
            to other relevant verified sellers (&ldquo;Market Leads&rdquo;) — only with your consent,
            given on the requirement form.
          </li>
          <li>To process orders, payments and shipping on seller websites.</li>
          <li>To show results for your city and improve search and recommendations.</li>
          <li>To prevent spam, fraud and abuse, and to meet legal obligations.</li>
          <li>To send service messages (OTP, lead alerts, order updates). We do not sell your data.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Who we share it with">
        <ul>
          <li>
            <strong>Sellers</strong> — when you submit a requirement or enquiry, your details are
            shared with the seller(s) it is routed to. Your phone number stays masked to a seller
            until they accept the lead.
          </li>
          <li>
            <strong>Service providers</strong> who process data for us under contract: Cloudflare
            (hosting security and bot protection), Resend (email delivery), Cloudinary (images),
            Razorpay (payments), Shiprocket (shipping), Google (sign-in) and our hosting provider.
          </li>
          <li>
            <strong>Authorities</strong> — when required by law or to protect users and the
            platform.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Cookies">
        <p>
          We use essential cookies to keep you signed in, remember your city and protect forms from
          bots. We do not use advertising cookies.
        </p>
      </LegalSection>

      <LegalSection title="5. How long we keep it">
        <p>
          We keep account data while your account is active. Leads and orders are kept for as long
          as needed for the seller relationship and for tax and legal record-keeping (generally up
          to 8 years for invoices). Security logs are kept for a limited period. When data is no
          longer needed we delete or anonymise it.
        </p>
      </LegalSection>

      <LegalSection title="6. Your rights">
        <p>
          You can access, correct or delete your personal data, withdraw consent, and nominate
          another person to exercise these rights. Most details can be edited in your account;
          for anything else, email us at{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. Withdrawing consent
          does not affect leads already delivered to sellers.
        </p>
      </LegalSection>

      <LegalSection title="7. Security">
        <p>
          Data is encrypted in transit (HTTPS), passwords and one-time codes are hashed, and access
          is restricted to people who need it. No system is perfectly secure; if a breach affects
          you we will notify you and the authorities as the law requires.
        </p>
      </LegalSection>

      <LegalSection title="8. Children">
        <p>Bzaro is a business platform and is not intended for anyone under 18.</p>
      </LegalSection>

      <LegalSection title="9. Grievances and contact">
        <p>
          For questions or complaints about your data, contact our Grievance Officer at{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. We respond within 30
          days. See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes">
        <p>
          We may update this policy. The date at the top shows the latest version; significant
          changes will be announced on the site.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
