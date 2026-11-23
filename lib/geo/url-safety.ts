/**
 * Pure syntactic check that a URL points at a public web page, for endpoints
 * that fetch caller-supplied URLs.
 *
 * This does NOT resolve DNS: a public-looking hostname that resolves to a
 * private address, or a redirect to one, passes this check. It only rejects
 * what can be seen in the URL itself.
 */

const ALLOWED_PORTS = new Set(["", "80", "443"]);

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

/** Private, loopback, link-local, "this network", shared (CGNAT), multicast and reserved IPv4 ranges. */
function isBlockedIpv4([a, b]: number[]): boolean {
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 shared address space
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a >= 224 // multicast, reserved and broadcast
  );
}

/** Expands an IPv6 literal (no brackets) to eight 16-bit groups, or null if malformed. */
function parseIpv6(host: string): number[] | null {
  let text = host.toLowerCase();
  // A trailing embedded IPv4 ("::ffff:1.2.3.4") becomes two hex groups.
  const v4 = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const octets = parseIpv4(v4[2]);
    if (!octets) return null;
    text = `${v4[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** Unspecified, loopback, link-local, unique-local, multicast, and IPv4-mapped/compatible private addresses. */
function isBlockedIpv6(groups: number[]): boolean {
  const first = groups[0];
  const upperZero = groups.slice(0, 5).every((g) => g === 0);
  if (upperZero && (groups[5] === 0xffff || groups[5] === 0)) {
    // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible, also covers :: and ::1).
    const v4 = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
    if (groups[5] === 0 && groups[6] === 0 && groups[7] <= 1) return true; // :: and ::1
    return isBlockedIpv4(v4);
  }
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique-local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 // ff00::/8 multicast
  );
}

/**
 * True when `url` is an absolute http(s) URL without credentials, on port 80,
 * 443 or the default, whose host is a dotted public name or a public IP
 * literal. Rejects localhost, bare single-label hosts and private, loopback,
 * link-local or unique-local IP literals (v4 and v6). Never throws.
 */
export function isPublicHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (!ALLOWED_PORTS.has(parsed.port)) return false;

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return false;

  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = parseIpv6(host.slice(1, -1));
    return groups !== null && !isBlockedIpv6(groups);
  }

  // The URL parser already normalises shorthand IPv4 forms ("127.1", "0x7f.0.0.1", "2130706433").
  const ipv4 = parseIpv4(host);
  if (ipv4) return !isBlockedIpv4(ipv4);

  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (!host.includes(".")) return false;
  return true;
}
