import tls from "tls";
import { pinnedLookup } from "@/lib/utils/pinned-lookup";
import { TlsResult } from "./types";

export async function checkTls(hostname: string, addresses: string[]): Promise<TlsResult | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        // Connect only to the already-validated addresses (no re-resolution)
        lookup: pinnedLookup(addresses),
        timeout: 5000,
        rejectUnauthorized: false,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          if (!cert || !cert.valid_to) {
            socket.destroy();
            resolve(null);
            return;
          }

          const expiresAt = new Date(cert.valid_to);
          const now = new Date();
          const daysUntilExpiry = Math.floor(
            (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          resolve({
            valid: socket.authorized,
            issuer: formatCertField(cert.issuer),
            subject: formatCertField(cert.subject),
            expiresAt: expiresAt.toISOString(),
            daysUntilExpiry,
            expiringSoon: daysUntilExpiry < 14,
          });
        } catch {
          resolve(null);
        } finally {
          socket.destroy();
        }
      }
    );

    socket.on("error", () => {
      socket.destroy();
      resolve(null);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

function formatCertField(field: tls.PeerCertificate["issuer"]): string {
  if (!field) return "Unknown";
  const parts: string[] = [];
  // Multi-valued RDNs are returned as arrays
  if (field.O) parts.push([field.O].flat().join(", "));
  if (field.CN) parts.push([field.CN].flat().join(", "));
  return parts.join(" - ") || "Unknown";
}
