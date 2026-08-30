export const RESOURCE_TYPES = [
  "examination-paper",
  "study-notes",
  "course-handout",
  "assignment",
  "reference-guide",
  "other-document",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  "examination-paper": "Examination paper",
  "study-notes": "Study notes",
  "course-handout": "Course handout",
  assignment: "Assignment",
  "reference-guide": "Reference guide",
  "other-document": "Other document",
};

export function resourceTypeLabel(value?: string | null) {
  return RESOURCE_TYPE_LABELS[(value ?? "examination-paper") as ResourceType] ?? "Document";
}
