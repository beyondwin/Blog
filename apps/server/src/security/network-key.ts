import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export interface TrustedProxyNetworkKeyOptions {
  readonly masterSecret: string;
  readonly trustedProxyAddresses: readonly string[];
  readonly clock?: () => number;
}

export interface NetworkAddressInput {
  readonly peerAddress: string;
  readonly xForwardedFor?: string | readonly string[];
}

function mappedIpv4(canonicalIpv6: string): string | undefined {
  if (!canonicalIpv6.startsWith('::ffff:')) return undefined;
  const words = canonicalIpv6.slice('::ffff:'.length).split(':');
  if (words.length !== 2) return undefined;
  const high = Number.parseInt(words[0]!, 16);
  const low = Number.parseInt(words[1]!, 16);
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) return undefined;
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function normalizeAddress(value: string): string {
  const candidate = value.trim();
  if (!candidate || candidate.includes('%')) throw new Error('network address is invalid');
  const family = isIP(candidate);
  if (family === 4) {
    const octets = candidate.split('.').map((part) => Number(part));
    return octets.join('.');
  }
  if (family === 6) {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    const canonical = hostname.slice(1, -1).toLowerCase();
    return mappedIpv4(canonical) ?? canonical;
  }
  throw new Error('network address is invalid');
}

export class TrustedProxyNetworkKey {
  readonly #masterSecret: string;
  readonly #trustedProxyAddresses: ReadonlySet<string>;
  readonly #clock: () => number;

  constructor(options: TrustedProxyNetworkKeyOptions) {
    if (!options.masterSecret) throw new Error('network key configuration is invalid');
    this.#masterSecret = options.masterSecret;
    this.#trustedProxyAddresses = new Set(options.trustedProxyAddresses.map(normalizeAddress));
    this.#clock = options.clock ?? Date.now;
  }

  derive(input: NetworkAddressInput): string {
    const peerAddress = normalizeAddress(input.peerAddress);
    let address = peerAddress;
    if (this.#trustedProxyAddresses.has(peerAddress) && input.xForwardedFor !== undefined) {
      if (Array.isArray(input.xForwardedFor)) {
        if (input.xForwardedFor.length !== 1) throw new Error('network address is invalid');
        address = this.#forwardedAddress(input.xForwardedFor[0]!);
      } else {
        address = this.#forwardedAddress(input.xForwardedFor as string);
      }
    }
    const day = new Date(this.#clock()).toISOString().slice(0, 10);
    const dayKey = createHmac('sha256', this.#masterSecret).update(day).digest();
    return createHmac('sha256', dayKey).update(address).digest('hex');
  }

  #forwardedAddress(header: string): string {
    const entries = header.split(',');
    if (entries.length === 0 || entries.some((entry) => entry.trim().length === 0)) throw new Error('network address is invalid');
    const normalized = entries.map(normalizeAddress);
    return normalized[0]!;
  }
}
