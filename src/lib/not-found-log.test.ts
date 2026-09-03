// The 404 log is written from a public, unauthenticated page, so its filtering
// rules are the only thing standing between an anonymous request and a row in
// the database. They are asserted rather than trusted.
import { describe, expect, it } from "vitest";
import { normaliseNotFoundPath } from "@/lib/not-found-log";

describe("normaliseNotFoundPath", () => {
  it("keeps the lost pages we are actually looking for", () => {
    expect(normaliseNotFoundPath("/product-category/barbells")).toBe("/product-category/barbells");
    expect(normaliseNotFoundPath("/product/olympic-barbell-20kg")).toBe("/product/olympic-barbell-20kg");
    expect(normaliseNotFoundPath("/gym-equipment-melbourne")).toBe("/gym-equipment-melbourne");
  });

  it("files one row per page, whatever is hung off the URL", () => {
    const expected = "/product-category/barbells";
    expect(normaliseNotFoundPath("/product-category/barbells?utm_source=google")).toBe(expected);
    expect(normaliseNotFoundPath("/product-category/barbells#reviews")).toBe(expected);
    expect(normaliseNotFoundPath("/product-category/barbells/")).toBe(expected);
    expect(normaliseNotFoundPath("https://masterkraft.com/product-category/barbells")).toBe(expected);
  });

  it("drops scanner probes, which are most of the volume and none of the signal", () => {
    for (const junk of [
      "/wp-login.php",
      "/wp-admin/setup-config.php",
      "/.env",
      "/.git/config",
      "/vendor/phpunit/phpunit/phpunit.xml",
      "/cgi-bin/luci",
      "/index.php",
    ]) {
      expect(normaliseNotFoundPath(junk), junk).toBeNull();
    }
  });

  it("drops asset misses, which are a broken image and not a lost page", () => {
    expect(normaliseNotFoundPath("/category/strength.jpg")).toBeNull();
    expect(normaliseNotFoundPath("/_next/static/chunks/main.js")).toBeNull();
    expect(normaliseNotFoundPath("/fonts/Oswald.woff2")).toBeNull();
  });

  it("refuses anything that could be used to fill the table", () => {
    expect(normaliseNotFoundPath("/" + "a".repeat(600))).toBeNull();
    expect(normaliseNotFoundPath("")).toBeNull();
    expect(normaliseNotFoundPath(null)).toBeNull();
    expect(normaliseNotFoundPath("not a url at all")).toBeNull();
  });

  it("leaves the root alone rather than trimming it to nothing", () => {
    expect(normaliseNotFoundPath("/")).toBe("/");
  });
});
