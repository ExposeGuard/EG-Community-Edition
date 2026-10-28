import net, { type LookupFunction } from "net";

/**
 * Returns a `lookup` function for net/tls/http that always resolves to the
 * given, already-validated addresses instead of performing a fresh DNS
 * query. This prevents DNS rebinding between validation and connection.
 */
export function pinnedLookup(addresses: string[]): LookupFunction {
  const entries = addresses.map((address) => ({
    address,
    family: net.isIPv6(address) ? 6 : 4,
  }));

  return (hostname, options, callback) => {
    const matching = options.family
      ? entries.filter((e) => e.family === options.family)
      : entries;

    if (matching.length === 0) {
      const err: NodeJS.ErrnoException = new Error(`No pinned address for ${hostname}`);
      err.code = "ENOTFOUND";
      callback(err, "", 0);
      return;
    }

    if (options.all) {
      callback(null, matching);
    } else {
      callback(null, matching[0].address, matching[0].family);
    }
  };
}
