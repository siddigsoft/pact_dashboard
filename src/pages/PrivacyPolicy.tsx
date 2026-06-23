import { Link } from "react-router-dom";
import PactLogo from "@/assets/logo.png";

const EFFECTIVE_DATE = "June 23, 2026";
const CONTACT_EMAIL = "support@pactorg.com";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900">
            <img src={PactLogo} alt="PACT" className="h-8 w-8" width={32} height={32} />
            <span>PACT</span>
          </Link>
          <Link to="/auth" className="text-sm text-blue-700 hover:underline">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border bg-white p-8 shadow-sm md:p-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Legal</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-500">
            Effective date: {EFFECTIVE_DATE}
          </p>
          <p className="mt-6 text-sm leading-7 text-slate-700">
            This Privacy Policy describes how <strong>PACT</strong> ("we", "us", or "our") collects,
            uses, stores, and shares information when you use the <strong>PACT Mobile</strong> application
            (Android/iOS) and the related <strong>PACT Command Center</strong> web platform (together,
            the "Services"). The Services are intended for authorized humanitarian and field-operations
            personnel and partner organizations.
          </p>

          <Section title="1. Who This Policy Applies To">
            <p>
              This policy applies to registered users of PACT Mobile and PACT Command Center, including
              data collectors, coordinators, supervisors, finance staff, and administrators who access
              the platform on behalf of their organization. The Services are not directed at children
              under 16, and we do not knowingly collect personal information from children.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <Subheading>2.1 Account and profile information</Subheading>
            <p>
              When you register or are onboarded, we may collect your full name, email address, phone
              number, employee or staff ID, job role, organizational hub or location assignment, profile
              photo, emergency contact details, and account credentials.
            </p>

            <Subheading>2.2 Location information</Subheading>
            <p>
              With your permission, we collect precise GPS location data to verify site visits, support
              field dispatch, display team location on operational maps, and improve visit accuracy.
              You can control location sharing in app settings and through your device permissions.
            </p>

            <Subheading>2.3 Field operations and work data</Subheading>
            <p>
              We collect information you submit while performing your duties, including site visit
              records, monitoring forms, survey responses, task updates, cost and expense submissions,
              receipts, signatures, notes, timestamps, and operational status updates.
            </p>

            <Subheading>2.4 Photos, camera, and files</Subheading>
            <p>
              With your permission, we collect photos, documents, and other files you capture or upload
              for site verification, expense claims, permits, and operational reporting.
            </p>

            <Subheading>2.5 Communications</Subheading>
            <p>
              We process in-app messages, notifications, call metadata, and related content when you use
              chat, voice, or video communication features within the platform.
            </p>

            <Subheading>2.6 Device and technical information</Subheading>
            <p>
              We collect device identifiers, operating system version, app version, language settings,
              push notification tokens, network status, crash logs, performance data, and usage analytics
              to operate, secure, and improve the Services.
            </p>

            <Subheading>2.7 Biometric authentication (optional)</Subheading>
            <p>
              If you enable biometric login (such as fingerprint or Face ID), authentication is
              performed on your device. We do not receive or store your biometric data on our servers.
            </p>

            <Subheading>2.8 Offline data</Subheading>
            <p>
              The mobile app may store work data locally on your device when offline. This data is
              encrypted where supported and synchronized to our servers when connectivity is restored.
            </p>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul>
              <li>Provide, operate, and maintain the Services</li>
              <li>Authenticate users and enforce role-based access controls</li>
              <li>Assign, track, and verify field visits and operational tasks</li>
              <li>Process cost submissions, approvals, and financial workflows</li>
              <li>Send transactional notifications, alerts, and service messages</li>
              <li>Enable team communication, including chat and calls</li>
              <li>Generate operational, financial, and compliance reports for your organization</li>
              <li>Monitor app performance, diagnose errors, and improve reliability</li>
              <li>Protect against fraud, abuse, and unauthorized access</li>
              <li>Comply with legal obligations and organizational policies</li>
            </ul>
          </Section>

          <Section title="4. Legal Bases for Processing">
            <p>Depending on your jurisdiction, we process personal data based on one or more of the following:</p>
            <ul>
              <li>Performance of a contract or authorization to use the Services</li>
              <li>Legitimate interests in operating secure field-operations systems</li>
              <li>Compliance with legal and regulatory obligations</li>
              <li>Your consent, where required (for example, location, camera, or notifications)</li>
            </ul>
          </Section>

          <Section title="5. How We Share Information">
            <p>We do not sell your personal information. We may share information only as follows:</p>
            <ul>
              <li>
                <strong>Within your organization:</strong> supervisors, coordinators, finance teams, and
                administrators authorized to view operational and financial data
              </li>
              <li>
                <strong>Service providers:</strong> trusted vendors that help us host, secure, deliver,
                and support the Services, including cloud infrastructure, authentication, messaging,
                analytics, and communication providers
              </li>
              <li>
                <strong>Legal and safety:</strong> when required by law, court order, or to protect the
                rights, safety, and security of users, organizations, or the public
              </li>
              <li>
                <strong>Business transfers:</strong> in connection with a merger, restructuring, or asset
                sale, subject to appropriate safeguards
              </li>
            </ul>
          </Section>

          <Section title="6. Third-Party Services">
            <p>The Services rely on third-party providers, which process data under their own terms and privacy policies. These may include:</p>
            <ul>
              <li><strong>Supabase</strong> — authentication, database, file storage, and backend services</li>
              <li><strong>Google Firebase</strong> — push notifications, analytics, and crash reporting</li>
              <li><strong>Real-time communication providers</strong> — voice and video calling infrastructure</li>
              <li><strong>Google Play Services / Apple platform services</strong> — app distribution and device services</li>
            </ul>
            <p>
              We require service providers to handle data only for authorized purposes and in accordance
              with applicable data protection requirements.
            </p>
          </Section>

          <Section title="7. Data Retention">
            <p>
              We retain personal information for as long as necessary to provide the Services, fulfill
              operational and financial record-keeping requirements, resolve disputes, and comply with
              legal obligations. Retention periods may vary by data type and your organization's policies.
              When data is no longer required, we delete or anonymize it in accordance with our retention
              procedures.
            </p>
          </Section>

          <Section title="8. Data Security">
            <p>
              We implement technical and organizational safeguards designed to protect personal information,
              including encrypted transport (HTTPS/TLS), access controls, role-based permissions, and
              monitoring for unauthorized activity. No method of transmission or storage is completely
              secure, and we cannot guarantee absolute security.
            </p>
          </Section>

          <Section title="9. International Data Transfers">
            <p>
              Your information may be processed in countries other than your own, including where our
              service providers operate cloud infrastructure. Where required, we use appropriate safeguards
              for cross-border transfers.
            </p>
          </Section>

          <Section title="10. Your Rights and Choices">
            <p>Depending on applicable law, you may have the right to:</p>
            <ul>
              <li>Access, correct, or update your personal information</li>
              <li>Request deletion of your account or certain data, subject to legal retention requirements</li>
              <li>Withdraw consent for optional processing such as location sharing or notifications</li>
              <li>Object to or restrict certain processing activities</li>
              <li>Request a copy of your data in a portable format</li>
            </ul>
            <p>
              You can update profile details in the app or web settings. To exercise your rights, contact us
              at <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-700 hover:underline">{CONTACT_EMAIL}</a>.
              We may need to verify your identity before responding.
            </p>
          </Section>

          <Section title="11. Permissions on Mobile Devices">
            <p>PACT Mobile may request device permissions to provide core functionality:</p>
            <ul>
              <li><strong>Location</strong> — site visit verification and field tracking</li>
              <li><strong>Camera and photos</strong> — capture site and receipt images</li>
              <li><strong>Microphone</strong> — voice and video calls</li>
              <li><strong>Notifications</strong> — task alerts and operational messages</li>
              <li><strong>Biometrics</strong> — optional secure sign-in</li>
              <li><strong>Network access</strong> — sync data and receive updates</li>
            </ul>
            <p>
              You can manage these permissions in your device settings. Some features may not work if
              required permissions are denied.
            </p>
          </Section>

          <Section title="12. Cookies and Similar Technologies (Web)">
            <p>
              The PACT Command Center web platform uses cookies and local storage to maintain your
              session, remember preferences, and understand how the site is used. You can control cookies
              through your browser settings, though some features may not function properly if cookies are
              disabled.
            </p>
          </Section>

          <Section title="13. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we make material changes, we will
              post the updated policy on this page and update the effective date. Continued use of the
              Services after changes become effective constitutes acceptance of the revised policy.
            </p>
          </Section>

          <Section title="14. Contact Us">
            <p>
              If you have questions about this Privacy Policy or our data practices, contact:
            </p>
            <p className="mt-2">
              <strong>PACT — Privacy &amp; Data Protection</strong><br />
              Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-700 hover:underline">{CONTACT_EMAIL}</a><br />
              Web: <a href="https://app.pactorg.com" className="text-blue-700 hover:underline">app.pactorg.com</a>
            </p>
          </Section>

          <Section title="15. Governing Law">
            <p>
              This Privacy Policy is governed by the laws of the Republic of Sudan, without regard to
              conflict-of-law principles. Disputes arising from this policy shall be subject to the
              exclusive jurisdiction of the courts located in Sudan, unless otherwise required by
              applicable law.
            </p>
          </Section>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} PACT. All rights reserved.
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border-t border-slate-100 pt-6">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 text-sm font-semibold text-slate-800">{children}</h3>;
}
