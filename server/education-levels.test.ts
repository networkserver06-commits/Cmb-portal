import { describe, expect, it } from "vitest";
import {
  EDUCATION_LEVELS,
  educationLevelLabel,
  normalizeEducationLevel,
} from "../shared/educationLevels";

describe("ScholarShelf education levels", () => {
  it("offers the supported learner pathways", () => {
    expect(EDUCATION_LEVELS).toEqual([
      "primary",
      "secondary",
      "tvet",
      "college",
      "university",
      "professional",
      "other",
    ]);
  });

  it("normalizes common legacy labels into the shared vocabulary", () => {
    expect(normalizeEducationLevel("University")).toBe("university");
    expect(normalizeEducationLevel("degree programme")).toBe("university");
    expect(normalizeEducationLevel("Level 5")).toBe("other");
    expect(normalizeEducationLevel("technical training")).toBe("tvet");
    expect(normalizeEducationLevel("high school")).toBe("secondary");
  });

  it("returns readable labels while preserving unknown historical labels", () => {
    expect(educationLevelLabel("university")).toBe("University");
    expect(educationLevelLabel("Level 5")).toBe("Level 5");
  });

  it("handles null and undefined legacy levels without crashing", () => {
    expect(normalizeEducationLevel(null)).toBe("other");
    expect(normalizeEducationLevel(undefined)).toBe("other");
    expect(educationLevelLabel(null)).toBe("Other");
    expect(educationLevelLabel(undefined)).toBe("Other");
  });
});
