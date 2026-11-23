import { describe, it, expect, vi } from "vitest";
import { isPublicHttpUrl, isPublicIpAddress, resolvesToPublicAddress, type LookupAll } from "../url-safety";

describe("isPublicHttpUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com/a/b?c=1#d",
    "https://sub.example.co.uk/diensten/zakelijk-leasen",
    "https://example.com:443/",
    "http://example.com:80/",
    "https://example.com./trailing-dot",
    "https://8.8.8.8/",
    "http://172.32.0.1/",
    "https://[2001:4860:4860::8888]/",
  ])("allows %s", (url) => {
    expect(isPublicHttpUrl(url)).toBe(true);
  });

  it.each([
    ["not a URL", "not a url"],
    ["an empty string", ""],
    ["another scheme", "ftp://example.com/file"],
    ["javascript:", "javascript:alert(1)"],
    ["a file URL", "file:///etc/passwd"],
    ["credentials", "https://user:pass@example.com/"],
    ["a user name only", "https://user@example.com/"],
    ["another port", "https://example.com:8080/"],
    ["port 22", "http://example.com:22/"],
    ["localhost", "http://localhost/"],
    ["a localhost subdomain", "http://app.localhost/"],
    ["a bare single-label host", "https://intranet/"],
    ["IPv4 loopback", "http://127.0.0.1/"],
    ["shorthand IPv4 loopback", "http://127.1/"],
    ["decimal IPv4 loopback", "http://2130706433/"],
    ["0.0.0.0", "http://0.0.0.0/"],
    ["10/8", "http://10.1.2.3/"],
    ["172.16/12", "http://172.31.255.255/"],
    ["192.168/16", "http://192.168.1.1/"],
    ["IPv4 link-local (cloud metadata)", "http://169.254.169.254/latest/meta-data"],
    ["shared address space", "http://100.64.0.1/"],
    ["IPv6 loopback", "http://[::1]/"],
    ["IPv6 unspecified", "http://[::]/"],
    ["IPv6 link-local", "http://[fe80::1]/"],
    ["IPv6 unique-local", "http://[fd12:3456::1]/"],
    ["IPv4-mapped loopback", "http://[::ffff:127.0.0.1]/"],
    ["IPv4-mapped private", "http://[::ffff:10.0.0.1]/"],
  ])("rejects %s", (_label, url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });
});

describe("isPublicIpAddress", () => {
  it.each(["8.8.8.8", "93.184.216.34", "2001:4860:4860::8888"])("allows %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:192.168.0.1", "fe80::1%en0", "not-an-ip"])(
    "refuses %s",
    (address) => {
      expect(isPublicIpAddress(address)).toBe(false);
    },
  );
});

describe("resolvesToPublicAddress", () => {
  const answering = (...addresses: string[]): LookupAll =>
    vi.fn(async () => addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })));

  it("allows a host whose every address is public", async () => {
    expect(await resolvesToPublicAddress("example.com", answering("93.184.216.34", "2606:2800:220:1::1"))).toBe(true);
  });

  it("refuses a host with one private address among public ones", async () => {
    expect(await resolvesToPublicAddress("example.com", answering("93.184.216.34", "10.0.0.7"))).toBe(false);
  });

  it("refuses a host with no addresses", async () => {
    expect(await resolvesToPublicAddress("example.com", answering())).toBe(false);
  });

  it("refuses when the lookup fails", async () => {
    const failing: LookupAll = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND example.invalid");
    });
    expect(await resolvesToPublicAddress("example.invalid", failing)).toBe(false);
  });

  it("checks an IP literal as is, without a lookup", async () => {
    const lookup = answering("93.184.216.34");
    const results = [await resolvesToPublicAddress("[::1]", lookup), await resolvesToPublicAddress("8.8.8.8", lookup)];
    expect({ results, lookups: vi.mocked(lookup).mock.calls.length }).toEqual({ results: [false, true], lookups: 0 });
  });
});
