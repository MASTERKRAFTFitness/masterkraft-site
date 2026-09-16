// How a /blog URL is turned into a page.
//
// The failure this pins down is a quiet one. `routes()` emits home, post,
// category, author and tag routes; the sitemap turns all five into URLs with
// @opinly/shared's prefixes; and this resolver has to match on the SAME
// prefixes or the site publishes a sitemap full of 404s. Nothing in the build
// notices — the pages return "not found" and only Search Console says so, weeks
// later. So the prefixes are asserted here against the shared package's own URL
// builders rather than against strings typed out twice.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { categoryPath, authorPath, tagPath, postPath } from "@opinly/shared";

const posts = vi.fn();
const categories = vi.fn();
const tags = vi.fn();
const authors = vi.fn();
const author = vi.fn();
const post = vi.fn();

vi.mock("@/lib/opinly-content", () => ({
  getOpinly: () => ({ posts, categories, tags, authors, author, post }),
  blogConfig: {},
  BLOG_PREFIX: "/blog",
  blogEnabled: () => true,
}));

const { loadRoute, toSeo } = await import("@/lib/blog-route");

/** The config the resolver's prefixes are derived from: all defaults, as in production. */
const config = { imagesPrefix: "/blog-images", blogPrefix: "/blog" };

/** The segments a given URL builder produces, e.g. ["category", "racks"]. */
const segmentsOf = (path: string) => path.replace("/blog/", "").split("/");

beforeEach(() => {
  vi.clearAllMocks();
  posts.mockResolvedValue({ data: [], has_more: false, next_cursor: null });
  categories.mockResolvedValue([]);
  tags.mockResolvedValue([]);
  authors.mockResolvedValue({ type: "authors", data: [] });
  author.mockResolvedValue({ type: "not-found", data: null });
  post.mockResolvedValue(null);
});

describe("loadRoute", () => {
  it("treats no segments as the index", async () => {
    const route = await loadRoute([]);
    expect(route.type).toBe("home");
    expect(posts).toHaveBeenCalledWith({ limit: 12 });
  });

  it("resolves a category at the URL the sitemap advertises", async () => {
    const segments = segmentsOf(categoryPath(config, "racks"));
    categories.mockResolvedValue([{ slug: "racks", title: "Racks", description: null, imageUrl: null, posts: [] }]);

    const route = await loadRoute(segments);

    expect(route.type).toBe("category");
    // CategorySummary calls it `title`; the metadata builder wants `name`.
    expect(route.type === "category" && route.data.name).toBe("Racks");
    expect(posts).toHaveBeenCalledWith({ category: "racks" });
  });

  it("resolves a tag at the URL the sitemap advertises", async () => {
    const segments = segmentsOf(tagPath(config, "flooring"));
    tags.mockResolvedValue([{ slug: "flooring", name: "Flooring", description: null, postCount: 3 }]);

    const route = await loadRoute(segments);

    expect(route.type).toBe("tag");
    expect(posts).toHaveBeenCalledWith({ tag: "flooring" });
  });

  it("resolves an author at the URL the sitemap advertises", async () => {
    const segments = segmentsOf(authorPath(config, "jane"));
    author.mockResolvedValue({ type: "author", data: { name: "Jane", slug: "jane", image: null, bio: null, posts: [] } });

    const route = await loadRoute(segments);

    expect(route.type).toBe("author");
    expect(author).toHaveBeenCalledWith("jane");
  });

  it("lists authors at the bare author prefix", async () => {
    const route = await loadRoute([authorPath(config, "x").split("/")[2]]);
    expect(route.type).toBe("authors");
  });

  it("resolves a post from its single flat segment", async () => {
    const segments = segmentsOf(postPath(config, { slug: "choosing-a-rack" }));
    expect(segments).toEqual(["choosing-a-rack"]);
    post.mockResolvedValue({ slug: "choosing-a-rack", title: "Choosing a rack" });

    const route = await loadRoute(segments);

    expect(route.type).toBe("post");
    expect(post).toHaveBeenCalledWith("choosing-a-rack");
  });

  it("404s a post addressed under its category", async () => {
    // Posts are flat. /blog/racks/choosing-a-rack is not an alias for the post,
    // it is a URL this site does not have — and answering it would create a
    // duplicate of every post at a second address.
    const route = await loadRoute(["racks", "choosing-a-rack"]);
    expect(route.type).toBe("not-found");
    expect(post).not.toHaveBeenCalled();
  });

  it("404s an unknown category rather than rendering an empty archive", async () => {
    categories.mockResolvedValue([{ slug: "racks", title: "Racks", description: null, imageUrl: null, posts: [] }]);
    const route = await loadRoute(["category", "does-not-exist"]);
    expect(route.type).toBe("not-found");
  });

  it("404s an unknown post", async () => {
    const route = await loadRoute(["no-such-post"]);
    expect(route.type).toBe("not-found");
  });
});

describe("toSeo", () => {
  it("passes the data through for the four addressable types", async () => {
    post.mockResolvedValue({ slug: "p", title: "P" });
    const route = await loadRoute(["p"]);
    expect(toSeo(route)).toEqual({ type: "post", data: { slug: "p", title: "P" } });
  });

  it("drops the data for the types the metadata builder ignores", async () => {
    const route = await loadRoute([]);
    expect(toSeo(route)).toEqual({ type: "home" });
  });
});
