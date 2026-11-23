import { describe, expect, it } from "vitest";
import { MAX_EVIDENCE_BYTES, evidenceFolder, evidenceProblem, safeName } from "./warranty-evidence";

const ID = "0b0c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e";

describe("evidenceProblem", () => {
  it("requires at least one file", () => {
    expect(evidenceProblem([])).toMatch(/at least one photo or video/);
  });
  it("accepts phone photos and videos", () => {
    expect(
      evidenceProblem([
        { name: "IMG_0412.HEIC", type: "image/heic", size: 2_000_000 },
        { name: "IMG_0413.MOV", type: "video/quicktime", size: 40_000_000 },
      ])
    ).toBeNull();
  });
  it("refuses documents and oversized files", () => {
    expect(evidenceProblem([{ name: "invoice.pdf", type: "application/pdf", size: 10 }])).toMatch(/not a photo/);
    expect(evidenceProblem([{ name: "long.mp4", type: "video/mp4", size: MAX_EVIDENCE_BYTES + 1 }])).toMatch(/50 MB/);
  });
});

describe("evidenceFolder", () => {
  it("accepts paths inside one claim folder", () => {
    expect(evidenceFolder([`claims/${ID}/1-a.jpg`, `claims/${ID}/2-b.mp4`])).toEqual({
      folder: `claims/${ID}`,
      names: ["1-a.jpg", "2-b.mp4"],
    });
  });
  it("refuses empty, traversal, and mixed folders", () => {
    expect(evidenceFolder([])).toBeNull();
    expect(evidenceFolder(undefined)).toBeNull();
    expect(evidenceFolder([`claims/${ID}/../x/1-a.jpg`])).toBeNull();
    expect(evidenceFolder([`claims/${ID}/1-a.jpg`, "claims/1b0c7d1e-2f3a-4b5c-8d9e-0f1a2b3c4d5e/2-b.jpg"])).toBeNull();
  });
});

describe("safeName", () => {
  it("keeps the extension and drops odd characters", () => {
    expect(safeName("My video (1).MOV")).toBe("My-video-1-.MOV");
    expect(safeName("../../etc")).toBe("etc");
  });
});
