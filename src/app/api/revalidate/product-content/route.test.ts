// Who may flush the content cache, and what actually gets flushed.
//
// Two questions here. "Can a stranger call this?" — because every call forces
// the next render to re-read Supabase, so an open one is a cheap way to make
// the site slow. And "does it drop BOTH caches?" — because dropping only the
// tag leaves the rendered HTML in place and looks like it worked on any page
// nobody has visited yet, which is the failure api/opinly's note warns about.
import { describe, expect, it, vi, beforeEach } from "vitest";

const revalidateTag = vi.fn();
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

const { POST } = await import("./route");

const call = (body?: unknown, headers: Record<string, string> = { authorization: "Bearer s3cret" }) =>
  POST(
    new Request("https://masterkraft.com/api/revalidate/product-content", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  );

beforeEach(() => {
  revalidateTag.mockReset();
  revalidatePath.mockReset();
  process.env.CONTENT_REVALIDATE_SECRET = "s3cret";
});

describe("who may call it", () => {
  it("refuses without the bearer token", async () => {
    const res = await call({ slugs: ["x"] }, {});
    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a wrong token", async () => {
    const res = await call({ slugs: ["x"] }, { authorization: "Bearer nope" });
    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  // Fail closed, not open. An unset secret must not mean "anyone may call it".
  it("refuses outright when the secret is unset, rather than running openly", async () => {
    delete process.env.CONTENT_REVALIDATE_SECRET;
    const res = await call({ slugs: ["x"] });
    expect(res.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("what it flushes", () => {
  it("drops the tag AND the product path, not one of them", async () => {
    const res = await call({ slugs: ["functional-trainer-pro"] });
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("product-content", { expire: 0 });
    expect(revalidatePath).toHaveBeenCalledWith("/product/functional-trainer-pro");
  });

  // A product page reads two independently cached tables. Dropping only the
  // copy tag left gallery edits invisible for an hour — the exact failure this
  // route exists to remove, one table across.
  it("drops the gallery tag too, not just the copy one", async () => {
    await call({ slugs: ["functional-trainer-clearance"] });
    expect(revalidateTag).toHaveBeenCalledWith("product-images", { expire: 0 });
  });

  it("reports both tags back to the caller", async () => {
    const res = await call({ slugs: ["x"] });
    const json = (await res.json()) as { tags?: string[] };
    expect(json.tags).toEqual(["product-content", "product-images"]);
  });

  // The Google Shopping feed reads the same copy. A title that disagrees with
  // the landing page is a disapproval risk, so it goes with every call.
  it("always revalidates the merchant feed", async () => {
    await call({ slugs: ["a"] });
    expect(revalidatePath).toHaveBeenCalledWith("/merchant-feed.xml");
  });

  // A Supabase database webhook sends record/old_record rather than slugs.
  it("accepts a Supabase webhook payload", async () => {
    await call({ type: "UPDATE", table: "product_content", record: { slug: "bench-pro" } });
    expect(revalidatePath).toHaveBeenCalledWith("/product/bench-pro");
  });

  // If the edit MOVED the page, the old address is still cached and still
  // serving. Revalidating only the new slug leaves a stale page behind.
  it("revalidates both sides of a renamed slug", async () => {
    await call({ record: { slug: "new-name" }, old_record: { slug: "old-name" } });
    expect(revalidatePath).toHaveBeenCalledWith("/product/new-name");
    expect(revalidatePath).toHaveBeenCalledWith("/product/old-name");
  });

  it("does not revalidate the same slug twice", async () => {
    await call({ record: { slug: "same" }, old_record: { slug: "same" }, slugs: ["same"] });
    const product = revalidatePath.mock.calls.filter((c) => c[0] === "/product/same");
    expect(product).toHaveLength(1);
  });
});

describe("a caller that gives no slugs is told what it did not get", () => {
  // Degrading to a 400 would be worse: the tag drop is the half that matters
  // most and needs no slug, so a malformed body should still do it.
  it("still drops the tag on an unparseable body", async () => {
    const res = await POST(
      new Request("https://masterkraft.com/api/revalidate/product-content", {
        method: "POST",
        headers: { authorization: "Bearer s3cret", "content-type": "application/json" },
        body: "not json",
      })
    );
    expect(res.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("product-content", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("product-images", { expire: 0 });
  });

  it("warns that no product page was re-rendered", async () => {
    const res = await call({});
    const json = (await res.json()) as { warning?: string };
    expect(json.warning).toMatch(/no product page was re-rendered/i);
  });

  it("does not warn when slugs were given", async () => {
    const res = await call({ slugs: ["x"] });
    const json = (await res.json()) as { warning?: string };
    expect(json.warning).toBeUndefined();
  });
});
