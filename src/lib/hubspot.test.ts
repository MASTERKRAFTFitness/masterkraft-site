// hubspotUtk decides whether a lead reaches HubSpot WITH its browsing history.
// Get it wrong one way and every paid lead files as "Offline sources"; get it
// wrong the other way and HubSpot rejects the submission outright.
import { describe, it, expect } from "vitest";
import { hubspotUtk } from "@/lib/hubspot";

const TOKEN = "0123456789abcdef0123456789abcdef";
const req = (cookie?: string) =>
  new Request("https://masterkraft.com/api/fitout-brief", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });

describe("hubspotUtk", () => {
  it("reads the token from among other cookies", () => {
    expect(hubspotUtk(req(`_ga=GA1.1.1; hubspotutk=${TOKEN}; __hssc=1`))).toBe(TOKEN);
  });

  it("is undefined for a visitor HubSpot never tracked", () => {
    expect(hubspotUtk(req())).toBeUndefined();
    expect(hubspotUtk(req("_ga=GA1.1.1"))).toBeUndefined();
  });

  it("drops a malformed token rather than letting HubSpot bounce the lead", () => {
    expect(hubspotUtk(req("hubspotutk=not-a-token"))).toBeUndefined();
    expect(hubspotUtk(req(`hubspotutk=${TOKEN}x`))).toBeUndefined();
  });

  it("does not match a cookie that merely ends in the same name", () => {
    expect(hubspotUtk(req(`xhubspotutk=${TOKEN}`))).toBeUndefined();
  });
});
