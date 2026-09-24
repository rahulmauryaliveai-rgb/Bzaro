import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LEGAL_CONTACT_EMAIL } from "@/components/marketplace/LegalPage";
import { marketplaceUrl } from "@/lib/utils/url";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for buying, selling and using the Bzaro marketplace and seller websites.",
  alternates: { canonical: marketplaceUrl("/terms") },
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      intro={
        <p>
          These terms govern your use of bzaro.in and the seller websites hosted on its subdomains
          (together, the &ldquo;Platform&rdquo;). By creating an account or using the Platform you
          agree to them. If you do not agree, please do not use the Platform.
        </p>
      }
    >
      <LegalSection title="1. What Bzaro is">
        <p>
          Bzaro is an online B2B marketplace that connects buyers with sellers and gives sellers a
          catalogue page or website. Bzaro is an intermediary: contracts for goods and services are
          between the buyer and the seller. We do not own, sell or guarantee the products listed.
        </p>
      </LegalSection>

      <LegalSection title="2. Accounts">
        <ul>
          <li>You must be at least 18 and give accurate information.</li>
          <li>Keep your password and one-time codes private; you are responsible for activity on your account.</li>
          <li>We may suspend accounts that break these terms or put other users at risk.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Buyers">
        <ul>
          <li>
            When you submit a requirement or enquiry, you agree that it may be shared with the
            seller you contacted and with other relevant verified sellers, as described in our{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </li>
          <li>Do your own checks on price, quality, delivery and the seller before paying.</li>
          <li>Do not post false, abusive or spam requirements.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Sellers">
        <ul>
          <li>
            You are responsible for your listings, prices, taxes (including GST), stock, delivery,
            returns and compliance with applicable law.
          </li>
          <li>
            Listings must be accurate and must not include prohibited, counterfeit or infringing
            goods.
          </li>
          <li>
            Enquiries, calls, WhatsApp clicks and cart activity on your Bzaro catalogue page or
            website may be captured as leads. Bzaro may use these to generate Direct Leads for you
            and Market Leads for other sellers, as described on our pricing page.
          </li>
          <li>
            Lead credits, plan features and add-on fees are as shown on the{" "}
            <Link href="/pricing">pricing page</Link> at the time of purchase. Fees are
            non-refundable unless stated otherwise.
          </li>
          <li>You grant Bzaro a licence to display your business name, logo, photos and listings on the Platform.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Payments and orders">
        <p>
          Online payments on seller websites are processed by third-party gateways (such as
          Razorpay) and shipping by partners (such as Shiprocket), under their own terms. Disputes
          about an order are first between buyer and seller; we may help but are not obliged to.
        </p>
      </LegalSection>

      <LegalSection title="6. Acceptable use">
        <p>
          Do not scrape the Platform, attempt to break its security, send spam, impersonate others,
          or use it for anything unlawful.
        </p>
      </LegalSection>

      <LegalSection title="7. Liability">
        <p>
          The Platform is provided &ldquo;as is&rdquo;. To the extent the law allows, Bzaro is not
          liable for transactions between users, for losses arising from reliance on listings, or
          for indirect losses. Our total liability to you is limited to the fees you paid us in the
          three months before the claim.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes and termination">
        <p>
          We may change the Platform or these terms; continued use means you accept the updated
          terms. You may close your account at any time.
        </p>
      </LegalSection>

      <LegalSection title="9. Governing law and contact">
        <p>
          These terms are governed by the laws of India, with courts at Gautam Buddh Nagar (Noida),
          Uttar Pradesh having jurisdiction. Questions:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
