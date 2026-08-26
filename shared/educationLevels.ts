export const EDUCATION_LEVELS = [
  "primary",
  "secondary",
  "tvet",
  "college",
  "university",
  "professional",
  "other",
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EDUCATION_LEVEL_OPTIONS: ReadonlyArray<{
  value: EducationLevel;
  label: string;
  description: string;
}> = [
  {
    value: "primary",
    label: "Primary",
    description: "Primary school revision",
  },
  {
    value: "secondary",
    label: "Secondary",
    description: "Secondary school revision",
  },
  {
    value: "tvet",
    label: "TVET",
    description: "Technical and vocational training",
  },
  {
    value: "college",
    label: "College",
    description: "College or diploma study",
  },
  {
    value: "university",
    label: "University",
    description: "University or degree study",
  },
  {
    value: "professional",
    label: "Professional",
    description: "Professional or certification study",
  },
  {
    value: "other",
    label: "Other",
    description: "Another education pathway",
  },
];

const LABELS = Object.fromEntries(
  EDUCATION_LEVEL_OPTIONS.map(option => [option.value, option.label])
) as Record<EducationLevel, string>;

export function isEducationLevel(value: string): value is EducationLevel {
  return (EDUCATION_LEVELS as readonly string[]).includes(value);
}

export function normalizeEducationLevel(value: unknown): EducationLevel {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (isEducationLevel(normalized)) return normalized;
  if (/primary|elementary/.test(normalized)) return "primary";
  if (/secondary|high school/.test(normalized)) return "secondary";
  if (/tvet|technical|vocational/.test(normalized)) return "tvet";
  if (/college|diploma/.test(normalized)) return "college";
  if (/university|degree/.test(normalized)) return "university";
  if (/professional|certif/.test(normalized)) return "professional";
  return "other";
}

export function educationLevelLabel(value: unknown): string {
  const rawValue = typeof value === "string" ? value.trim() : "";
  const normalized = rawValue.toLowerCase();
  return isEducationLevel(normalized)
    ? LABELS[normalized]
    : rawValue || "Other";
}
