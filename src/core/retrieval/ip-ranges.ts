interface Cidr {
  base: number;
  mask: number;
  label: string;
}

function ipv4ToInt(address: string): number | null {
  const octets = address.split(".");
  if (octets.length !== 4) return null;

  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return null;
    const parsed = Number(octet);
    if (parsed > 255) return null;
    value = value * 256 + parsed;
  }
  return value;
}

function cidr(notation: string, label: string): Cidr {
  const [address = "", bits = "32"] = notation.split("/");
  const base = ipv4ToInt(address) ?? 0;
  const prefix = Number(bits);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { base: (base & mask) >>> 0, mask, label };
}

const BLOCKED_IPV4: Cidr[] = [
  cidr("0.0.0.0/8", "this-network"),
  cidr("10.0.0.0/8", "private"),
  cidr("100.64.0.0/10", "carrier-grade-nat"),
  cidr("127.0.0.0/8", "loopback"),
  cidr("169.254.0.0/16", "link-local"),
  cidr("172.16.0.0/12", "private"),
  cidr("192.0.0.0/24", "ietf-protocol"),
  cidr("192.168.0.0/16", "private"),
  cidr("198.18.0.0/15", "benchmarking"),
  cidr("224.0.0.0/4", "multicast"),
  cidr("240.0.0.0/4", "reserved"),
];

export function isPrivateIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return false;
  return BLOCKED_IPV4.some((range) => ((value & range.mask) >>> 0) === range.base);
}

export function isPrivateIpv6(address: string): boolean {
  const normalised = address.toLowerCase().replace(/^\[|\]$/g, "");

  if (normalised === "::1" || normalised === "::") return true;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalised);
  if (mapped?.[1]) return isPrivateIpv4(mapped[1]);

  const firstGroup = normalised.split(":")[0] ?? "";
  if (firstGroup.length === 0) return false;

  const leading = Number.parseInt(firstGroup.padEnd(4, "0"), 16);
  if (Number.isNaN(leading)) return false;

  const uniqueLocal = (leading & 0xfe00) === 0xfc00;
  const linkLocal = (leading & 0xffc0) === 0xfe80;
  const multicast = (leading & 0xff00) === 0xff00;

  return uniqueLocal || linkLocal || multicast;
}

export function isPrivateAddress(address: string): boolean {
  return address.includes(":")
    ? isPrivateIpv6(address)
    : isPrivateIpv4(address);
}
