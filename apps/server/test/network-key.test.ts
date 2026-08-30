import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { TrustedProxyNetworkKey } from '../src/security/network-key.js';

const secret = 'network-key-test-secret-at-least-32-bytes';

function expected(address: string, day: string): string {
  const dayKey = createHmac('sha256', secret).update(day).digest();
  return createHmac('sha256', dayKey).update(address).digest('hex');
}

describe('TrustedProxyNetworkKey', () => {
  it('derives a stable same-UTC-day HMAC and rotates at the UTC boundary', () => {
    let now = Date.parse('2026-08-30T23:59:59.999Z');
    const keys = new TrustedProxyNetworkKey({ masterSecret: secret, trustedProxyAddresses: [], clock: () => now });
    expect(keys.derive({ peerAddress: '192.0.2.10' })).toBe(expected('192.0.2.10', '2026-08-30'));
    expect(keys.derive({ peerAddress: '192.0.2.10' })).toBe(expected('192.0.2.10', '2026-08-30'));
    now += 1;
    expect(keys.derive({ peerAddress: '192.0.2.10' })).toBe(expected('192.0.2.10', '2026-08-31'));
  });

  it('ignores spoofed forwarding from untrusted peers and trusts one normalized proxy hop', () => {
    const keys = new TrustedProxyNetworkKey({
      masterSecret: secret,
      trustedProxyAddresses: ['2001:db8::1'],
      clock: () => Date.parse('2026-08-30T12:00:00.000Z'),
    });
    expect(keys.derive({ peerAddress: '192.0.2.11', xForwardedFor: '198.51.100.8' }))
      .toBe(expected('192.0.2.11', '2026-08-30'));
    expect(keys.derive({ peerAddress: '2001:0db8:0:0:0:0:0:1', xForwardedFor: ' 198.51.100.8 , 203.0.113.2 ' }))
      .toBe(expected('198.51.100.8', '2026-08-30'));
  });

  it('normalizes IPv4-mapped IPv6 to the same identity as IPv4', () => {
    const keys = new TrustedProxyNetworkKey({ masterSecret: secret, trustedProxyAddresses: [], clock: () => 0 });
    expect(keys.derive({ peerAddress: '::ffff:192.0.2.10' }))
      .toBe(keys.derive({ peerAddress: '192.0.2.10' }));
    expect(keys.derive({ peerAddress: '::ffff:c000:020a' }))
      .toBe(keys.derive({ peerAddress: '192.0.2.10' }));
  });

  it.each([
    ['multiple header instances', ['198.51.100.1', '198.51.100.2']],
    ['empty list entry', '198.51.100.1,,203.0.113.1'],
    ['zone identifier', 'fe80::1%en0'],
    ['port', '198.51.100.1:443'],
    ['malformed address', 'not-an-address'],
  ])('rejects %s without reflecting address material', (_label, xForwardedFor) => {
    const keys = new TrustedProxyNetworkKey({ masterSecret: secret, trustedProxyAddresses: ['127.0.0.1'], clock: () => 0 });
    expect(() => keys.derive({ peerAddress: '127.0.0.1', xForwardedFor })).toThrow('network address is invalid');
    try { keys.derive({ peerAddress: '127.0.0.1', xForwardedFor }); } catch (error) {
      expect(JSON.stringify(error)).not.toContain(String(Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor));
    }
  });

  it('rejects an invalid peer before deriving or serializing it', () => {
    const keys = new TrustedProxyNetworkKey({ masterSecret: secret, trustedProxyAddresses: [], clock: () => 0 });
    expect(() => keys.derive({ peerAddress: 'raw-address-sentinel' })).toThrow('network address is invalid');
    expect(JSON.stringify(keys)).not.toContain('raw-address-sentinel');
  });
});
