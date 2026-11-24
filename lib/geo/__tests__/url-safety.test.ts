import { afterEach, describe, it, expect, vi } from "vitest";
import {
  DNS_LOOKUP_TIMEOUT_MS,
  isPublicHttpUrl,
  isPublicIpAddress,
  resolvesToPublicAddress,
  type LookupAll,
} from "../url-safety";

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

describe("special-purpose ranges", () => {
  it.each([
    ["192.0.0.0/24 IETF protocol assignments", "192.0.0.8"],
    ["192.0.2.0/24 TEST-NET-1", "192.0.2.10"],
    ["198.18.0.0/15 benchmarking (low half)", "198.18.0.1"],
    ["198.18.0.0/15 benchmarking (high half)", "198.19.255.254"],
    ["198.51.100.0/24 TEST-NET-2", "198.51.100.7"],
    ["203.0.113.0/24 TEST-NET-3", "203.0.113.200"],
    ["64:ff9b::/96 NAT64", "64:ff9b::a00:1"],
    ["64:ff9b::/96 NAT64 with an embedded public IPv4", "64:ff9b::8.8.8.8"],
    ["64:ff9b:1::/48 local-use NAT64", "64:ff9b:1:abcd::1"],
    ["2002::/16 6to4", "2002:c000:0204::1"],
    ["2001::/32 Teredo", "2001:0:4136:e378:8000:63bf:3fff:fdd2"],
    ["2001:db8::/32 documentation", "2001:db8::1"],
    ["fec0::/10 site-local", "fec0::1"],
    ["fec0::/10 site-local (top of range)", "feff::1"],
  ])("refuses %s", (_label, address) => {
    const literal = address.includes(":") ? `[${address}]` : address;
    expect({ ip: isPublicIpAddress(address), url: isPublicHttpUrl(`https://${literal}/`) }).toEqual({ ip: false, url: false });
  });

  it.each([
    ["192.0.1.1, between the two 192.0.x ranges", "192.0.1.1"],
    ["the address just above 198.18.0.0/15", "198.20.0.1"],
    ["198.51.99.1, next to TEST-NET-2", "198.51.99.1"],
    ["203.0.114.1, next to TEST-NET-3", "203.0.114.1"],
    ["a 64:ff9b prefix outside both NAT64 ranges", "64:ff9b:2::1"],
    ["a public 2001: address outside Teredo and documentation", "2001:4860:4860::8888"],
    ["2003::/16, next to 6to4", "2003::1"],
  ])("still allows %s", (_label, address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });
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

  describe("lookup timeout", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("waits 3 seconds by default", () => {
      expect(DNS_LOOKUP_TIMEOUT_MS).toBe(3_000);
    });

    it("gives up on a lookup that never answers and returns false", async () => {
      const hanging: LookupAll = vi.fn(() => new Promise<never>(() => {}));
      expect(await resolvesToPublicAddress("slow.example.com", hanging, 10)).toBe(false);
    });

    it("refuses when the lookup answers only after the timeout", async () => {
      vi.useFakeTimers();
      const late: LookupAll = vi.fn(
        () => new Promise((resolve) => setTimeout(() => resolve([{ address: "93.184.216.34", family: 4 }]), 5_000)),
      );
      const pending = resolvesToPublicAddress("late.example.com", late);
      await vi.advanceTimersByTimeAsync(DNS_LOOKUP_TIMEOUT_MS);
      expect(await pending).toBe(false);
    });

    it("clears its timer when the lookup answers in time", async () => {
      vi.useFakeTimers();
      const result = await resolvesToPublicAddress("example.com", answering("93.184.216.34"));
      expect({ result, timers: vi.getTimerCount() }).toEqual({ result: true, timers: 0 });
    });

    it("clears its timer when the lookup fails", async () => {
      vi.useFakeTimers();
      const failing: LookupAll = vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND example.invalid");
      });
      const result = await resolvesToPublicAddress("example.invalid", failing);
      expect({ result, timers: vi.getTimerCount() }).toEqual({ result: false, timers: 0 });
    });
  });
});
