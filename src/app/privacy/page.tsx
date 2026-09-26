import type { Metadata } from "next";

// Public privacy policy — linked from the Meta App Dashboard
// (App settings → Basic → Privacy Policy URL and User data deletion).
// Not covered by the middleware's protectedPaths, so no login needed.

const OPERATOR = "Prithvijay";
const CONTACT_EMAIL = "prithvijay2006@gmail.com";
const LAST_UPDATED = "26 September 2026";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How this WhatsApp CRM collects, uses and deletes data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed">
      <h1 className="mb-2 text-3xl font-semibold">Privacy Policy</h1>
      <p className="text-muted-foreground mb-8">Last updated: {LAST_UPDATED}</p>

      <Section title="Who we are">
        This CRM is operated by {OPERATOR} (&quot;we&quot;, &quot;us&quot;). It
        lets our team send and receive WhatsApp messages with customers through
        the official WhatsApp Business Platform provided by Meta.
      </Section>

      <Section title="Information we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Customers who message us on WhatsApp:</strong> phone
            number, WhatsApp profile name, the content of messages and any
            media you send, and message delivery/read status.
          </li>
          <li>
            <strong>Team members using the CRM:</strong> name, email address,
            password (stored hashed by our authentication provider) and
            activity within the CRM.
          </li>
          <li>
            <strong>Notes and records</strong> our team adds, such as contact
            tags, deal information and conversation notes.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        Only to respond to your messages, provide customer support, manage our
        sales and service relationship with you, and send messages you have
        agreed to receive. We do not sell your data or use it for third-party
        advertising.
      </Section>

      <Section title="Who we share it with">
        We share data only with service providers needed to run the CRM: Meta
        Platforms (WhatsApp Business Platform, to deliver messages), Supabase
        (database and authentication hosting) and Vercel (application
        hosting). If our team enables the optional AI reply assistant, message
        text may be sent to the AI provider configured by our team (OpenAI or
        Anthropic) to draft replies. We may also disclose data where required
        by law.
      </Section>

      <Section title="Retention and security">
        We keep conversation data for as long as needed to serve you or as
        required by law, then delete it. Access tokens are encrypted
        (AES-256-GCM), data is transmitted over HTTPS, and access within the
        CRM is restricted by role.
      </Section>

      <Section title="Your rights and data deletion" id="data-deletion">
        You can ask us to access, correct or delete the data we hold about
        you. To request deletion, email{" "}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>{" "}
        (or send us the word <strong>DELETE</strong> on WhatsApp) from the
        phone number or email concerned. We will delete your contact record,
        conversations and messages within 30 days and confirm once done. You
        can also stop messages at any time by replying <strong>STOP</strong>.
      </Section>

      <Section title="Changes">
        We may update this policy; the date above shows the latest version.
      </Section>

      <Section title="Contact">
        Questions about this policy:{" "}
        <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
      </Section>
    </main>
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-6 scroll-mt-8">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
