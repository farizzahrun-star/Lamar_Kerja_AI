"use client";

import { ONBOARDING_STEPS, type OnboardingStep } from "@lamarkerja/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { completeOnboarding, fetchProfileBundle, patchProfile } from "@/lib/profile-client";
import type { ProfileBundle, ProfileRow } from "@/lib/profile-types";

import { CertificationSection } from "./certification-section";
import { EducationSection } from "./education-section";
import { ExperienceSection } from "./experience-section";
import { IdentityForm } from "./identity-form";
import { LanguageSection } from "./language-section";
import { SkillSection } from "./skill-section";
import { ErrorBanner } from "./ui";

const STEP_LABELS: Record<OnboardingStep, string> = {
  identity: "Identitas",
  educations: "Pendidikan",
  experiences: "Pengalaman",
  skills: "Skill",
  certifications: "Sertifikasi",
  languages: "Bahasa",
};

function resolveInitialStep(value: string | null | undefined): OnboardingStep {
  if (value && (ONBOARDING_STEPS as readonly string[]).includes(value)) {
    return value as OnboardingStep;
  }
  return "identity";
}

export function ProfileEditor({
  initialBundle,
  mode,
}: {
  initialBundle: ProfileBundle;
  mode: "wizard" | "full";
}) {
  const router = useRouter();
  const [bundle, setBundle] = useState<ProfileBundle>(initialBundle);
  const [step, setStep] = useState<OnboardingStep>(() =>
    resolveInitialStep(initialBundle.profile.onboarding_step),
  );
  const [error, setError] = useState<string>();
  const [finishing, setFinishing] = useState(false);

  async function refresh() {
    const result = await fetchProfileBundle();
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBundle(result.data);
  }

  function handleIdentitySaved(profile: ProfileRow) {
    setBundle((current) => ({ ...current, profile }));
  }

  async function selectStep(next: OnboardingStep) {
    setStep(next);
    const result = await patchProfile({ onboarding_step: next });
    if (result.ok) {
      setBundle((current) => ({ ...current, profile: result.data }));
    }
  }

  async function handleFinish() {
    setFinishing(true);
    setError(undefined);
    const result = await completeOnboarding();
    setFinishing(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    router.push("/profile");
    router.refresh();
  }

  function renderSection(section: OnboardingStep) {
    if (section === "identity") {
      return <IdentityForm profile={bundle.profile} onSaved={handleIdentitySaved} />;
    }
    if (section === "educations") {
      return <EducationSection items={bundle.educations} onChanged={refresh} />;
    }
    if (section === "experiences") {
      return <ExperienceSection items={bundle.experiences} onChanged={refresh} />;
    }
    if (section === "skills") {
      return <SkillSection items={bundle.skills} onChanged={refresh} />;
    }
    if (section === "certifications") {
      return <CertificationSection items={bundle.certifications} onChanged={refresh} />;
    }
    return <LanguageSection items={bundle.languages} onChanged={refresh} />;
  }

  if (mode === "full") {
    return (
      <div className="space-y-6">
        <ErrorBanner message={error} />
        {ONBOARDING_STEPS.map((section) => (
          <div key={section}>{renderSection(section)}</div>
        ))}
      </div>
    );
  }

  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  const previous = stepIndex > 0 ? ONBOARDING_STEPS[stepIndex - 1] : null;
  const next = stepIndex < ONBOARDING_STEPS.length - 1 ? ONBOARDING_STEPS[stepIndex + 1] : null;

  return (
    <div className="space-y-6">
      <nav aria-label="Langkah onboarding" className="flex flex-wrap gap-2">
        {ONBOARDING_STEPS.map((item, index) => {
          const active = item === step;
          return (
            <button
              key={item}
              type="button"
              onClick={() => void selectStep(item)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-accent text-white"
                  : "border border-line bg-white text-ink-soft hover:text-ink"
              }`}
            >
              {index + 1}. {STEP_LABELS[item]}
            </button>
          );
        })}
      </nav>

      <ErrorBanner message={error} />

      {renderSection(step)}

      <div className="flex items-center justify-between gap-3">
        {previous ? (
          <button type="button" className="btn-secondary" onClick={() => void selectStep(previous)}>
            ← {STEP_LABELS[previous]}
          </button>
        ) : (
          <span />
        )}

        {next ? (
          <button type="button" className="btn-secondary" onClick={() => void selectStep(next)}>
            Lanjut ke {STEP_LABELS[next]} →
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary w-auto px-5"
            onClick={() => void handleFinish()}
            disabled={finishing}
          >
            {finishing ? "Menyelesaikan…" : "Selesai"}
          </button>
        )}
      </div>
    </div>
  );
}
