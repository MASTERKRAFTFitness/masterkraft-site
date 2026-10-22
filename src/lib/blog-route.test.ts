// How a /blog URL is turned into a page.
//
// The URL shapes are pinned because they are the ones Google and shared links
// already hold from when the Journal was served by Opinly: a flat
// /blog/<slug>, /blog/authors and /blog/authors/<slug>. Anything else is a 404
// with a real status, never a 200 "not found".
import { describe, it, expect, vi, beforeEach } from "vitest";

const listPosts = vi.fn();
const getPost = vi.fn();
const listAuthors = vi.fn();
const getAuthor = vi.fn();

vi.mock("@/lib/blog", async (orig) => ({
  ...(await orig<typeof import("@/lib/blog")>()),
  listPosts,
  getPost,
  listAuthors,
  getAuthor,
}));

const { loadRoute, routeMetadata, INDEX_COUNT } = await import("@/lib/blog-route");

const post = {
  slug: "commercial-gym-fit-out",
  title: "Commercial Gym Fit Out in Australia",
  description: "The standfirst.",
  metaTitle: null,
  metaDescription: null,
  bodyMd: "Body.",
  heroImageKey: "n2rdb4MPRdg3VgKz_T0DM.webp",
  heroImageAlt: "Hero",
  faqs: [],
  publishedAt: "2026-10-12T23:07:47.000Z",
  modifiedAt: null,
  author: { slug: "steve_callanan", name: "Steve Callanan", bio: null, imageKey: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  listPosts.mockResolvedValue([]);
  getPost.mockResolvedValue(null);
  listAuthors.mockResolvedValue([]);
  getAuthor.mockResolvedValue(null);
});

describe("loadRoute", () => {
  it("treats no segments as the index", async () => {
    const route = await loadRoute([]);
    expect(route.type).toBe("home");
    expect(listPosts).toHaveBeenCalledWith(INDEX_COUNT);
  });

  it("resolves a flat post slug", async () => {
    getPost.mockResolvedValue(post);
    const route = await loadRoute(["commercial-gym-fit-out"]);
    expect(route.type).toBe("post");
    expect(getPost).toHaveBeenCalledWith("commercial-gym-fit-out");
  });

  it("404s a post nested under anything", async () => {
    getPost.mockResolvedValue(post);
    expect((await loadRoute(["category", "commercial-gym-fit-out"])).type).toBe("not-found");
    expect((await loadRoute(["tag", "x"])).type).toBe("not-found");
  });

  it("404s an unknown post", async () => {
    expect((await loadRoute(["no-such-post"])).type).toBe("not-found");
  });

  it("resolves the author index and an author", async () => {
    expect((await loadRoute(["authors"])).type).toBe("authors");
    getAuthor.mockResolvedValue({ ...post.author, posts: [] });
    expect((await loadRoute(["authors", "steve_callanan"])).type).toBe("author");
    expect((await loadRoute(["authors", "steve_callanan", "x"])).type).toBe("not-found");
  });

  it("404s an unknown author", async () => {
    expect((await loadRoute(["authors", "nobody"])).type).toBe("not-found");
  });
});

describe("routeMetadata", () => {
  it("gives a post an absolute canonical and its hero as the share image", () => {
    const meta = routeMetadata({ type: "post", data: post });
    expect(meta.alternates?.canonical).toBe("https://masterkraft.com/blog/commercial-gym-fit-out");
    expect(JSON.stringify(meta.openGraph)).toContain(
      "https://masterkraft.com/blog-images/n2rdb4MPRdg3VgKz_T0DM.webp",
    );
  });

  it("prefers the SEO title and description when a post has them", () => {
    const meta = routeMetadata({
      type: "post",
      data: { ...post, metaTitle: "SEO title", metaDescription: "SEO description" },
    });
    expect(meta.title).toBe("SEO title");
    expect(meta.description).toBe("SEO description");
  });
});
