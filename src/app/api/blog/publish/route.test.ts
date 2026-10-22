// The Journal's only write route from outside.
//
// Pinned: it refuses without the secret, it is idempotent on sourceRef, a live
// post's slug never moves, and it will not overwrite a different post's URL.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));

type Row = Record<string, unknown>;
let posts: Row[] = [];
let authors: Row[] = [];
const uploads: string[] = [];

/** Just enough of supabase-js for the route: eq/maybeSingle reads, insert, update, storage. */
function table(name: string) {
  const rows = () => (name === "blog_posts" ? posts : authors);
  return {
    select: () => ({
      eq: (col: string, val: unknown) => ({
        maybeSingle: async () => ({ data: rows().find((r) => r[col] === val) ?? null, error: null }),
      }),
    }),
    insert: async (row: Row) => {
      posts.push({ ...row });
      return { error: null };
    },
    update: (row: Row) => ({
      eq: async (col: string, val: unknown) => {
        posts = posts.map((r) => (r[col] === val ? { ...r, ...row } : r));
        return { error: null };
      },
    }),
  };
}

vi.mock("@/lib/admin-db", () => ({
  adminDb: () => ({
    from: table,
    storage: {
      from: () => ({
        upload: async (key: string) => {
          uploads.push(key);
          return { error: null };
        },
      }),
    },
  }),
}));

const { POST } = await import("@/app/api/blog/publish/route");

const send = (body: unknown, token = "s3cret") =>
  POST(
    new Request("https://masterkraft.com/api/blog/publish", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const base = {
  sourceRef: "ci_1",
  title: "Commercial Kettlebells: A Buyer's Guide",
  bodyMd: "## Why\n\nBecause.",
  publishedAt: "2026-10-26T01:00:00.000Z",
  authorSlug: "steve_callanan",
};

beforeEach(() => {
  process.env.BLOG_PUBLISH_SECRET = "s3cret";
  posts = [];
  authors = [{ slug: "steve_callanan" }];
  uploads.length = 0;
});

describe("POST /api/blog/publish", () => {
  it("refuses when the secret is unset or wrong", async () => {
    delete process.env.BLOG_PUBLISH_SECRET;
    expect((await send(base)).status).toBe(503);
    process.env.BLOG_PUBLISH_SECRET = "s3cret";
    expect((await send(base, "nope")).status).toBe(401);
    expect(posts).toHaveLength(0);
  });

  it("rejects a post missing what it needs", async () => {
    const res = await send({ ...base, bodyMd: " ", publishedAt: "soon" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("bodyMd");
  });

  it("creates a post at a slug made from its title", async () => {
    const res = await send(base);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, created: true, slug: "commercial-kettlebells-a-buyers-guide" });
    expect(posts[0]).toMatchObject({ source: "ptcmo", source_ref: "ci_1", published_at: base.publishedAt });
  });

  it("updates the same post on a re-send and keeps its URL", async () => {
    await send(base);
    const out = await (await send({ ...base, title: "Renamed", slug: "something-else" })).json();
    expect(out).toMatchObject({ ok: true, created: false, slug: "commercial-kettlebells-a-buyers-guide" });
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe("Renamed");
  });

  it("will not take over another post's URL", async () => {
    posts.push({ slug: "commercial-gym-fit-out", source_ref: null });
    const res = await send({ ...base, slug: "commercial-gym-fit-out" });
    expect(res.status).toBe(409);
  });

  it("rejects an unknown author", async () => {
    expect((await send({ ...base, authorSlug: "nobody" })).status).toBe(400);
  });

  it("stores the hero under the slug and a content hash", async () => {
    const out = await (
      await send({ ...base, heroImage: { base64: Buffer.from("img").toString("base64"), contentType: "image/jpeg", alt: "A rack" } })
    ).json();
    expect(out.ok).toBe(true);
    expect(uploads[0]).toMatch(/^commercial-kettlebells-a-buyers-guide-[0-9a-f]{10}\.jpg$/);
    expect(posts[0]).toMatchObject({ hero_image_key: uploads[0], hero_image_alt: "A rack" });
  });
});
