import React, { useEffect } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  ShieldCheck,
  Scale,
  Mail,
} from "lucide-react";
import "./landing.css";
import "./policies.css";
const contact = "dv842449@gmail.com";
const repo = "https://github.com/Tenyokj/devdevian";
const privacy = [
  [
    "who",
    "Who runs Devdevian",
    <>
      <p>
        Devdevian is an independent, open-source forum maintained by the
        Devdevian project, led by{" "}
        <a href="https://github.com/Tenyokj">Tenyokj</a>. The maintainers
        operate this hosted instance at devdevian.vercel.app. Other deployments
        of the open-source software are operated separately.
      </p>
      <p>
        For privacy questions, access or deletion requests, contact{" "}
        <a href={"mailto:" + contact}>{contact}</a>. Please do not put personal
        records, passwords, verification codes, or security reports in public
        GitHub issues.
      </p>
    </>,
  ],
  [
    "data",
    "What we collect and why",
    <>
      <p>
        We store your email, permanent username, display name, password hash
        when you register by email, and the profile information you choose to
        provide. This lets us create and secure your account and display your
        contributions. Passwords are hashed with a salt; we do not store your
        plain-text password.
      </p>
      <p>
        We also store publications, replies, uploaded files, project and event
        details, attendance, community membership and join requests, votes,
        bookmarks, topic and conversation subscriptions, notification
        preferences, reports, and moderation decisions. These records support
        the features you use and help investigate abuse.
      </p>
      <p>
        Google and GitHub provide an account identifier and verified email,
        together with basic profile information. Their access tokens are used
        during sign-in; the application does not store them for later access to
        your repositories, Gmail, or Google Drive.
      </p>
      <p>
        When you connect Devdevian CLI, we store the device name, authorization
        request and a hashed session credential. Terminal access expires after
        30 days and can be revoked in Settings. The CLI stores its access token
        in a local credentials file on your computer. Publications sent through
        the CLI follow the same audience and membership rules as the website.
      </p>
    </>,
  ],
  [
    "audience",
    "Public and private spaces",
    <>
      <p>
        Public-feed publications and public projects and events can be read by
        other visitors and may be copied or indexed by third parties. Files you
        attach to public publications are accessible with those publications.
        Public profile information and published profile images may also be
        visible to visitors.
      </p>
      <p>
        Private-community conversations and their attachments are checked
        against membership on the server. Community owners and validators
        moderate their own spaces. Private does not mean end-to-end encrypted:
        authorized maintainers and infrastructure providers may need access to
        stored data to operate, troubleshoot, or secure the service.
      </p>
      <p>
        Hiding your profile limits profile discovery; it does not make your
        existing public publications private. Event meeting links are restricted
        to attendees or the organizer.
      </p>
    </>,
  ],
  [
    "providers",
    "Services that process information",
    <>
      <p>
        The hosted service uses{" "}
        <a href="https://vercel.com/legal/privacy-policy">Vercel</a> for
        hosting, <a href="https://turso.tech/privacy-policy">Turso</a> for
        application data, <a href="https://supabase.com/privacy">Supabase</a>{" "}
        for uploaded files, and{" "}
        <a href="https://www.brevo.com/legal/privacypolicy/">Brevo</a> for
        verification emails. Sign-in through Google or GitHub also involves that
        provider. Google Fonts supplies the interface fonts, so a page visit
        makes requests to Google’s font servers.
      </p>
      <p>
        These services receive the information needed for their role, such as
        your recipient email for a verification message, stored attachments, or
        network and request metadata. Provider processing and logs follow their
        own terms and retention practices and may involve locations outside your
        country.
      </p>
    </>,
  ],
  [
    "storage",
    "Cookies and browser storage",
    <>
      <p>
        Essential HTTP-only cookies keep you signed in and support switching
        between accounts on your device. Login and device cookies last up to
        seven days. Short-lived OAuth and account-linking cookies bind a sign-in
        request to the browser that started it.
      </p>
      <p>
        Local storage remembers your theme and sidebar preference. Conversation
        drafts are saved locally, separated by account and entry point, and can
        be restored for up to 30 days after their last edit. Draft text and
        links stay on this browser; attachments must be added again. Publish or
        discard a draft, or clear this site’s browser data, to remove it. The
        current application does not add advertising trackers or application
        analytics scripts. Hosting and service providers may still process
        operational logs, including network metadata, to deliver and protect
        their services.
      </p>
    </>,
  ],
  [
    "retention",
    "Retention and account deletion",
    <>
      <p>
        Account and contribution data is retained while needed to operate your
        account, preserve conversations, and handle moderation. Email
        confirmation codes expire after ten minutes and are stored as hashes,
        not readable codes. Expiry blocks use of a code; it does not promise
        immediate removal of every expired record or provider log.
      </p>
      <p>
        You can request account deletion in Settings. The current deletion flow
        removes sign-in connections, sessions, membership, and profile details
        and replaces your identity with “Deleted member.” Contributions and some
        uploaded files can remain to preserve discussions. Account deletion is
        not a one-click erasure of every publication, attachment, report,
        backup, or provider log.
      </p>
      <p>
        Community owners must transfer their communities before deleting their
        account. For removal of remaining personal content, a copy of your data,
        or questions about retained records, email the maintainers. We may need
        to verify that the request belongs to you.
      </p>
    </>,
  ],
  [
    "controls",
    "Your choices and requests",
    <>
      <p>
        You can edit optional profile information, notification preferences, and
        profile visibility; leave communities; cancel event attendance; and sign
        out. Your username remains permanent. Contact us to request access,
        correction, deletion, a data copy, or to raise an objection about how
        information is used. Available rights and exceptions depend on
        applicable law.
      </p>
      <p>
        We do not sell personal data or use your verification email for a
        marketing newsletter. Verification messages are part of account
        security, rather than an optional notification category.
      </p>
    </>,
  ],
  [
    "security",
    "Security and reporting",
    <>
      <p>
        The service uses HTTPS, server-side authorization, password hashing,
        short-lived verification challenges, and role checks for moderation.
        These are safeguards, not a guarantee that vulnerabilities cannot exist.
        Devdevian is in active development and has not received an independent
        security audit.
      </p>
      <p>
        Report a suspected vulnerability privately to{" "}
        <a
          href={"mailto:" + contact + "?subject=Devdevian%20security%20report"}
        >
          {contact}
        </a>
        . Include a minimal reproduction using synthetic data. Avoid accessing
        other people’s records, disrupting the service, or publishing exploit
        details before maintainers can investigate. See the{" "}
        <a href={repo + "/blob/main/SECURITY.md"}>security policy</a>.
      </p>
    </>,
  ],
  [
    "updates",
    "Changes to this notice",
    <p>
      We update this page when service practices change. The date above
      identifies this version. Material changes will be described here and,
      where appropriate, communicated through the service. Contact the
      maintainers if you need clarification before using a feature.
    </p>,
  ],
];
const terms = [
  [
    "service",
    "An open-source forum in active development",
    <>
      <p>
        Devdevian is a forum for programmers to ask questions, discuss ideas,
        review code, share projects, organize events, and form private
        communities. These terms describe use of the hosted service at
        devdevian.vercel.app. The maintainers operate this instance;
        independently hosted copies may have different rules.
      </p>
      <p>
        The service is an early release. Features may change, become
        unavailable, or contain errors. Keep your own copies of important code
        and files. No uptime, backup-restoration, or support response-time
        guarantee is offered.
      </p>
    </>,
  ],
  [
    "accounts",
    "Your account and identity",
    <>
      <p>
        Use an email you control, protect your credentials, and do not
        impersonate another person or organization. A username is permanent and
        unique without regard to letter case. Your display name and optional
        profile fields can change.
      </p>
      <p>
        Google, GitHub, and email sign-in are available when configured.
        Connecting a new provider to an existing account may require an
        additional confirmation. Signing out of Devdevian does not sign you out
        of Google or GitHub.
      </p>
    </>,
  ],
  [
    "conduct",
    "What belongs here",
    <>
      <p>
        Be constructive and give other developers useful context. Ask focused
        questions, explain code-review requests, disclose your relationship to
        projects you promote, and respect community-specific rules.
      </p>
      <p>
        Do not publish spam, phishing, malware, stolen credentials, private
        information without permission, targeted harassment, unlawful material,
        or content you have no right to share. Do not evade membership controls,
        manipulate votes, impersonate moderators, or deliberately disrupt the
        service.
      </p>
    </>,
  ],
  [
    "content",
    "Your content and the software license",
    <>
      <p>
        You retain your rights in the content you contribute. To operate the
        service, you allow Devdevian to store, process, format, and display that
        content to the audience you select, and to make operational copies
        needed to provide the service. Only upload material you are entitled to
        share.
      </p>
      <p>
        The application’s source code is licensed under{" "}
        <a href={repo + "/blob/main/LICENSE"}>GPL-3.0-only</a>. That software
        license does not automatically apply to users’ posts, code snippets,
        photos, or attachments. State a separate license when you want others to
        reuse your content. Reviewers should not assume that every posted
        snippet can be copied into their product.
      </p>
      <p>
        Content on public pages may be visible to search engines and copied by
        others. Choosing a private community limits application access but is
        not a confidentiality agreement or an end-to-end encryption promise.
      </p>
    </>,
  ],
  [
    "moderation",
    "Reports, communities, and moderation",
    <>
      <p>
        Community owners and appointed validators handle membership and reports
        within their communities. Designated Devdevian moderators handle
        public-feed reports. Moderators may dismiss reports, hide publications,
        or pause replies; review decisions are recorded in an action log.
      </p>
      <p>
        Authors can archive a conversation to stop new replies and restore it
        later, subject to moderator restrictions. An accepted answer records the
        author’s choice, not an independent certification that the answer is
        correct or safe.
      </p>
      <p>
        To ask for review of a moderation decision, contact the community owner
        for community matters or <a href={"mailto:" + contact}>{contact}</a> for
        platform matters. Include the publication link and a concise
        explanation; do not repost private material in a public issue.
      </p>
    </>,
  ],
  [
    "projects",
    "Projects, events, and external links",
    <>
      <p>
        Projects and events are submitted by users. Their inclusion is not an
        endorsement, investment recommendation, security audit, or guarantee of
        quality. Organizers are responsible for their event details and any
        external meeting service they select.
      </p>
      <p>
        External links lead to services with their own terms and privacy
        practices. The “Built with” section credits technology used by
        Devdevian; it does not announce a partnership, sponsorship, or ownership
        relationship.
      </p>
    </>,
  ],
  [
    "leaving",
    "Leaving and deletion",
    <>
      <p>
        You can leave a community, cancel attendance, or delete your account
        through Settings, subject to transferring community ownership first.
        Deletion removes account access and anonymizes the profile; existing
        contributions and some files can remain. The{" "}
        <a href="/privacy">Privacy &amp; Security notice</a> explains the
        current behavior and how to request further removal.
      </p>
      <p>
        Maintainers may restrict access to address abuse, security incidents, or
        service changes. Do not use the forum as the only storage location for
        work you need to retain.
      </p>
    </>,
  ],
  [
    "contact",
    "Contact and changes",
    <>
      <p>
        These terms may be revised as the project develops. The date above
        identifies the current version. Nothing here is intended to exclude
        rights or obligations that cannot be excluded under applicable law.
      </p>
      <p>
        For service questions, content concerns, or requests about these terms,
        contact <a href={"mailto:" + contact}>{contact}</a>. For ordinary
        reproducible bugs and feature requests, use{" "}
        <a href={repo + "/issues"}>GitHub Issues</a> without sharing private
        data.
      </p>
    </>,
  ],
];
export default function PolicyPage({ type }) {
  const isPrivacy = type === "privacy",
    sections = isPrivacy ? privacy : terms,
    title = isPrivacy ? "Privacy & Security" : "Terms of Use";
  useEffect(() => {
    document.body.classList.add("landing-page");
    const previous = document.title;
    document.title = title + " · Devdevian";
    return () => {
      document.body.classList.remove("landing-page");
      document.title = previous;
    };
  }, [title]);
  return (
    <div className="landing policy-page">
      <nav className="policy-nav">
        <a className="landing-brand" href="/">
          <img src="/devdevian-logo.png" alt="" />
          devdevian<span>.</span>
        </a>
        <a href="/app" className="landing-text-link">
          Open the forum <ArrowUpRight size={16} />
        </a>
      </nav>
      <header className="policy-hero">
        <a className="policy-back" href="/">
          <ArrowLeft size={15} /> Back to Devdevian
        </a>
        <span className="landing-kicker">
          {isPrivacy ? <ShieldCheck size={16} /> : <Scale size={16} />} THE
          DETAILS MATTER
        </span>
        <h1>{title}</h1>
        <p>
          {isPrivacy
            ? "What we store, who can see it, and how to stay in control."
            : "A shared space works better when expectations are clear."}
        </p>
        <span className="policy-date">
          Updated October 17, 2026 · Hosted service policy
        </span>
      </header>
      <div className="policy-layout">
        <aside className="policy-toc" aria-label="On this page">
          {sections.map(([id, label], i) => (
            <a href={"#" + id} key={id}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {label}
            </a>
          ))}
        </aside>
        <main className="policy-content">
          {sections.map(([id, label, content], i) => (
            <section id={id} key={id}>
              <span className="landing-kicker">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2>{label}</h2>
              {content}
            </section>
          ))}
        </main>
      </div>
      <footer className="policy-footer">
        <a href={"mailto:" + contact}>
          <Mail size={16} />
          {contact}
        </a>
        <div>
          <a href="/privacy" aria-current={isPrivacy ? "page" : undefined}>
            Privacy &amp; Security
          </a>
          <a href="/terms" aria-current={!isPrivacy ? "page" : undefined}>
            Terms of Use
          </a>
          <a href={repo}>
            Source code <ArrowUpRight size={13} />
          </a>
        </div>
      </footer>
    </div>
  );
}
