import net from "net";
import { PortResult } from "./types";

export const ALLOWED_PORTS = [
  21, 22, 25, 53, 80, 110, 143, 443, 445, 587, 993, 995, 1433, 1521, 3306, 3389, 5432, 6379,
  8080, 8443, 27017,
];

const PORT_SERVICES: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  445: "SMB",
  587: "SMTP/TLS",
  993: "IMAPS",
  995: "POP3S",
  1433: "MSSQL",
  1521: "Oracle",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  6379: "Redis",
  8080: "HTTP-Alt",
  8443: "HTTPS-Alt",
  27017: "MongoDB",
};

const CONNECT_TIMEOUT_MS = 1000;
const MAX_CONCURRENCY = 20;

export async function scanPorts(host: string): Promise<PortResult[]> {
  const results: PortResult[] = [];
  const batches: number[][] = [];

  for (let i = 0; i < ALLOWED_PORTS.length; i += MAX_CONCURRENCY) {
    batches.push(ALLOWED_PORTS.slice(i, i + MAX_CONCURRENCY));
  }

  for (const batch of batches) {
    const batchResults = await Promise.all(batch.map((port) => checkPort(host, port)));
    results.push(...batchResults);
  }

  return results.filter((r) => r.status === "tcp_connect_success");
}

function checkPort(host: string, port: number): Promise<PortResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const service = PORT_SERVICES[port] || "Unknown";

    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ port, status: "timeout", service });
    }, CONNECT_TIMEOUT_MS);

    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ port, status: "tcp_connect_success", service });
    });

    socket.on("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ port, status: "closed", service });
    });
  });
}
