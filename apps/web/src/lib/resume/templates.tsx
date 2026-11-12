import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ResumeTemplate } from "@lamarkerja/shared";
import React from "react";

import type {
  CertificationRow,
  EducationRow,
  ExperienceRow,
  LanguageRow,
  ResumeSnapshot,
  SkillRow,
} from "@/lib/profile-types";

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Kontrak",
  internship: "Magang",
  freelance: "Freelance",
};

const SKILL_LEVEL_LABELS: Record<string, string> = {
  beginner: "Pemula",
  intermediate: "Menengah",
  advanced: "Mahir",
};

function formatYearRange(start: number | null, end: number | null): string {
  if (!start && !end) return "";
  return `${start ?? "…"} - ${end ?? "Sekarang"}`;
}

function formatIsoMonth(value: string | null): string | null {
  if (!value) return null;
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${month}/${year}`;
}

function formatExperiencePeriod(item: ExperienceRow): string {
  const start = formatIsoMonth(item.start_date);
  const end = item.is_current ? "Sekarang" : formatIsoMonth(item.end_date);
  if (!start && !end) return "";
  return `${start ?? "…"} - ${end ?? "…"}`;
}

function buildContactItems(snapshot: ResumeSnapshot): string[] {
  const { profile, email } = snapshot;
  return [
    email,
    profile.phone,
    profile.address,
    profile.linkedin_url,
    profile.portfolio_url,
  ].filter((item): item is string => Boolean(item && item.trim().length > 0));
}

function hasAnySection(snapshot: ResumeSnapshot): boolean {
  return Boolean(
    snapshot.profile.summary ||
      snapshot.educations.length > 0 ||
      snapshot.experiences.length > 0 ||
      snapshot.skills.length > 0 ||
      snapshot.certifications.length > 0 ||
      snapshot.languages.length > 0,
  );
}

const stylesA = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#181816",
    lineHeight: 1.4,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#15503f",
    paddingBottom: 10,
    marginBottom: 14,
  },
  name: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    color: "#15503f",
  },
  headline: {
    fontSize: 11,
    color: "#3f3e3a",
    marginTop: 4,
  },
  contactRow: {
    fontSize: 9,
    color: "#57554f",
    marginTop: 6,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#15503f",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 0.75,
    borderBottomColor: "#d9d4c7",
    paddingBottom: 3,
    marginBottom: 6,
  },
  entry: {
    marginBottom: 7,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  entryTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
  },
  entryMeta: {
    fontSize: 9,
    color: "#57554f",
  },
  paragraph: {
    fontSize: 9.5,
    color: "#2b2a27",
    marginTop: 2,
  },
  bulletRow: {
    flexDirection: "row",
    marginTop: 2,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 10,
    fontSize: 9.5,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    color: "#2b2a27",
  },
  inlineList: {
    fontSize: 9.5,
    color: "#2b2a27",
  },
  emptyNotice: {
    fontSize: 9.5,
    color: "#57554f",
    fontStyle: "italic",
  },
});

const stylesB = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingBottom: 38,
    paddingHorizontal: 42,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#141413",
    lineHeight: 1.42,
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#141413",
    paddingBottom: 10,
    marginBottom: 14,
  },
  name: {
    fontFamily: "Times-Bold",
    fontSize: 22,
    color: "#141413",
  },
  headlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  headline: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    color: "#2b2a27",
  },
  availability: {
    fontSize: 9,
    color: "#57554f",
  },
  contactRow: {
    fontSize: 9,
    color: "#4a4843",
    marginTop: 5,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Times-Bold",
    fontSize: 11,
    color: "#141413",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    borderBottomWidth: 0.75,
    borderBottomColor: "#8c877c",
    paddingBottom: 2,
    marginBottom: 6,
  },
  entry: {
    marginBottom: 8,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  entryTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.2,
  },
  entryMeta: {
    fontSize: 9,
    color: "#57554f",
  },
  paragraph: {
    fontSize: 9.5,
    color: "#2b2a27",
    marginTop: 2,
  },
  bulletRow: {
    flexDirection: "row",
    marginTop: 2,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 10,
    fontSize: 9.5,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    color: "#2b2a27",
  },
  emptyNotice: {
    fontSize: 9.5,
    color: "#57554f",
  },
});

function formatSkillItem(skill: SkillRow): string {
  const details = [
    skill.level ? SKILL_LEVEL_LABELS[skill.level] : null,
    skill.years !== null ? `${skill.years} th` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return details ? `${skill.name} (${details})` : skill.name;
}

function formatLanguageItem(language: LanguageRow): string {
  return language.proficiency ? `${language.name} (${language.proficiency})` : language.name;
}

function formatCertificationItem(cert: CertificationRow): string {
  const meta = [cert.issuer, cert.year].filter(Boolean).join(" · ");
  return meta ? `${cert.name} — ${meta}` : cert.name;
}

type EntryStyleSet = Pick<
  typeof stylesA,
  | "entry"
  | "rowBetween"
  | "entryTitle"
  | "entryMeta"
  | "paragraph"
  | "bulletRow"
  | "bulletDot"
  | "bulletText"
>;

function renderEducations(items: EducationRow[], s: EntryStyleSet) {
  return items.map((edu) => {
    const degree = [edu.level, edu.major].filter(Boolean).join(" ");
    const gpa = edu.gpa !== null ? `IPK ${edu.gpa}` : null;
    const subline = [degree, gpa].filter(Boolean).join(" · ");
    return (
      <View key={edu.id} style={s.entry}>
        <View style={s.rowBetween}>
          <Text style={s.entryTitle}>{edu.institution}</Text>
          <Text style={s.entryMeta}>{formatYearRange(edu.start_year, edu.end_year)}</Text>
        </View>
        {subline ? <Text style={s.paragraph}>{subline}</Text> : null}
      </View>
    );
  });
}

function renderExperiences(items: ExperienceRow[], s: EntryStyleSet) {
  return items.map((exp) => {
    const typeLabel = exp.employment_type ? EMPLOYMENT_LABELS[exp.employment_type] : null;
    const headerLeft = [exp.title, exp.company].filter(Boolean).join(" · ");
    const headerRight = [formatExperiencePeriod(exp), typeLabel].filter(Boolean).join(" · ");
    return (
      <View key={exp.id} style={s.entry}>
        <View style={s.rowBetween}>
          <Text style={s.entryTitle}>{headerLeft}</Text>
          <Text style={s.entryMeta}>{headerRight}</Text>
        </View>
        {exp.description ? <Text style={s.paragraph}>{exp.description}</Text> : null}
        {exp.points.map((point) => (
          <View key={point.id} style={s.bulletRow}>
            <Text style={s.bulletDot}>•</Text>
            <Text style={s.bulletText}>{point.content}</Text>
          </View>
        ))}
      </View>
    );
  });
}

function FreshGradTemplate({ snapshot }: { snapshot: ResumeSnapshot }) {
  const { profile, educations, experiences, skills, certifications, languages } = snapshot;
  const fullName = profile.full_name?.trim() || "Kandidat";
  const contacts = buildContactItems(snapshot);

  return (
    <Page size="A4" style={stylesA.page}>
      <View style={stylesA.header}>
        <Text style={stylesA.name}>{fullName}</Text>
        {profile.headline ? <Text style={stylesA.headline}>{profile.headline}</Text> : null}
        {contacts.length > 0 ? (
          <Text style={stylesA.contactRow}>{contacts.join("  |  ")}</Text>
        ) : null}
      </View>

      {profile.summary ? (
        <View style={stylesA.section}>
          <Text style={stylesA.sectionTitle}>Ringkasan</Text>
          <Text style={stylesA.paragraph}>{profile.summary}</Text>
        </View>
      ) : null}

      {educations.length > 0 ? (
        <View style={stylesA.section}>
          <Text style={stylesA.sectionTitle}>Pendidikan</Text>
          {renderEducations(educations, stylesA)}
        </View>
      ) : null}

      {skills.length > 0 || languages.length > 0 ? (
        <View style={stylesA.section}>
          <Text style={stylesA.sectionTitle}>Keahlian & Bahasa</Text>
          {skills.length > 0 ? (
            <Text style={stylesA.inlineList}>
              Keahlian: {skills.map(formatSkillItem).join(" · ")}
            </Text>
          ) : null}
          {languages.length > 0 ? (
            <Text style={stylesA.paragraph}>
              Bahasa: {languages.map(formatLanguageItem).join(" · ")}
            </Text>
          ) : null}
        </View>
      ) : null}

      {experiences.length > 0 ? (
        <View style={stylesA.section}>
          <Text style={stylesA.sectionTitle}>Pengalaman & Magang</Text>
          {renderExperiences(experiences, stylesA)}
        </View>
      ) : null}

      {certifications.length > 0 ? (
        <View style={stylesA.section}>
          <Text style={stylesA.sectionTitle}>Sertifikasi</Text>
          {certifications.map((cert) => (
            <View key={cert.id} style={stylesA.bulletRow}>
              <Text style={stylesA.bulletDot}>•</Text>
              <Text style={stylesA.bulletText}>{formatCertificationItem(cert)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!hasAnySection(snapshot) ? (
        <Text style={stylesA.emptyNotice}>Profil belum memiliki rincian tambahan.</Text>
      ) : null}
    </Page>
  );
}

function ExperiencedTemplate({ snapshot }: { snapshot: ResumeSnapshot }) {
  const { profile, educations, experiences, skills, certifications, languages } = snapshot;
  const fullName = profile.full_name?.trim() || "Kandidat";
  const contacts = buildContactItems(snapshot);

  return (
    <Page size="A4" style={stylesB.page}>
      <View style={stylesB.header}>
        <Text style={stylesB.name}>{fullName}</Text>
        {profile.headline || profile.availability ? (
          <View style={stylesB.headlineRow}>
            <Text style={stylesB.headline}>{profile.headline ?? ""}</Text>
            {profile.availability ? (
              <Text style={stylesB.availability}>{profile.availability}</Text>
            ) : null}
          </View>
        ) : null}
        {contacts.length > 0 ? (
          <Text style={stylesB.contactRow}>{contacts.join("  ·  ")}</Text>
        ) : null}
      </View>

      {profile.summary ? (
        <View style={stylesB.section}>
          <Text style={stylesB.sectionTitle}>Ringkasan Profesional</Text>
          <Text style={stylesB.paragraph}>{profile.summary}</Text>
        </View>
      ) : null}

      {experiences.length > 0 ? (
        <View style={stylesB.section}>
          <Text style={stylesB.sectionTitle}>Pengalaman Kerja</Text>
          {renderExperiences(experiences, stylesB)}
        </View>
      ) : null}

      {skills.length > 0 ? (
        <View style={stylesB.section}>
          <Text style={stylesB.sectionTitle}>Kompetensi Inti</Text>
          <Text style={stylesB.paragraph}>{skills.map(formatSkillItem).join("  ·  ")}</Text>
        </View>
      ) : null}

      {educations.length > 0 ? (
        <View style={stylesB.section}>
          <Text style={stylesB.sectionTitle}>Pendidikan</Text>
          {renderEducations(educations, stylesB)}
        </View>
      ) : null}

      {certifications.length > 0 ? (
        <View style={stylesB.section}>
          <Text style={stylesB.sectionTitle}>Sertifikasi</Text>
          {certifications.map((cert) => (
            <View key={cert.id} style={stylesB.bulletRow}>
              <Text style={stylesB.bulletDot}>•</Text>
              <Text style={stylesB.bulletText}>{formatCertificationItem(cert)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {languages.length > 0 ? (
        <View style={stylesB.section}>
          <Text style={stylesB.sectionTitle}>Bahasa</Text>
          <Text style={stylesB.paragraph}>{languages.map(formatLanguageItem).join("  ·  ")}</Text>
        </View>
      ) : null}

      {!hasAnySection(snapshot) ? (
        <Text style={stylesB.emptyNotice}>Profil belum memiliki rincian tambahan.</Text>
      ) : null}
    </Page>
  );
}

export function ResumeDocument({
  snapshot,
  template,
}: {
  snapshot: ResumeSnapshot;
  template: ResumeTemplate;
}) {
  const fullName = snapshot.profile.full_name?.trim() || "Kandidat";
  return (
    <Document
      title={`CV - ${fullName} (Template ${template})`}
      author={fullName}
      subject={`CV Template ${template}`}
    >
      {template === "A" ? (
        <FreshGradTemplate snapshot={snapshot} />
      ) : (
        <ExperiencedTemplate snapshot={snapshot} />
      )}
    </Document>
  );
}
