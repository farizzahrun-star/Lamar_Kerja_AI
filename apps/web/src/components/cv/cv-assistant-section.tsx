"use client";

import { useState } from "react";

import { AiConsentCard } from "@/components/consent/ai-consent-card";
import { CvUploadCard } from "@/components/cv/cv-upload-card";
import type { ConsentStatus, UploadedCvItem } from "@/lib/profile-types";

export function CvAssistantSection({
  initialConsent,
  initialUploadedCvs,
  onUploadSuccess,
}: {
  initialConsent: ConsentStatus;
  initialUploadedCvs: UploadedCvItem[];
  onUploadSuccess?: (item: UploadedCvItem) => void;
}) {
  const [consent, setConsent] = useState<ConsentStatus>(initialConsent);

  return (
    <div className="space-y-6">
      <AiConsentCard initialStatus={initialConsent} onStatusChange={setConsent} />
      <CvUploadCard
        initialItems={initialUploadedCvs}
        consentActive={consent.active}
        onUploadSuccess={onUploadSuccess}
      />
    </div>
  );
}
