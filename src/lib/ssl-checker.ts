/**
 * SSL certificate checker — connects via TLS and inspects the cert chain.
 */

import tls from "node:tls";
import { URL } from "node:url";

export interface SslResult {
  valid: boolean;
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  protocol: string;
  serialNumber: string;
  fingerprint: string;
  altNames: string[];
  grade: string;
  error?: string;
}

function gradeFromDays(days: number, valid: boolean): string {
  if (!valid) return "F";
  if (days > 60) return "A";
  if (days > 30) return "B";
  if (days > 14) return "C";
  if (days > 0) return "D";
  return "F";
}

export async function checkSsl(urlStr: string): Promise<SslResult> {
  const { hostname, port } = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
  const targetPort = parseInt(port || "443");

  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: targetPort,
        servername: hostname,
        rejectUnauthorized: false, // we want to inspect even invalid certs
        timeout: 10_000,
      },
      () => {
        const cert = socket.getPeerCertificate();

        if (!cert || !cert.subject) {
          socket.destroy();
          return resolve({
            valid: false,
            issuer: "",
            subject: hostname,
            validFrom: "",
            validTo: "",
            daysUntilExpiry: -1,
            protocol: socket.getProtocol() ?? "unknown",
            serialNumber: "",
            fingerprint: "",
            altNames: [],
            grade: "F",
            error: "No certificate returned",
          });
        }

        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysUntilExpiry = Math.floor(
          (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const isAuthorized = socket.authorized;

        const altNames = (cert.subjectaltname ?? "")
          .split(",")
          .map((s: string) => s.trim().replace(/^DNS:/, ""))
          .filter(Boolean);

        socket.destroy();

        const issuerObj = cert.issuer as Record<string, string | string[] | undefined>;
        const subjectObj = cert.subject as Record<string, string | string[] | undefined>;
        const getFirst = (v: string | string[] | undefined): string =>
          Array.isArray(v) ? v[0] ?? "" : v ?? "";

        resolve({
          valid: isAuthorized && daysUntilExpiry > 0,
          issuer: typeof cert.issuer === "object" ? getFirst(issuerObj.O) || getFirst(issuerObj.CN) : String(cert.issuer),
          subject: typeof cert.subject === "object" ? getFirst(subjectObj.CN) || hostname : String(cert.subject),
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysUntilExpiry,
          protocol: socket.getProtocol() ?? "unknown",
          serialNumber: cert.serialNumber ?? "",
          fingerprint: cert.fingerprint256 ?? cert.fingerprint ?? "",
          altNames,
          grade: gradeFromDays(daysUntilExpiry, isAuthorized),
        });
      },
    );

    socket.on("error", (err) => {
      socket.destroy();
      resolve({
        valid: false,
        issuer: "",
        subject: hostname,
        validFrom: "",
        validTo: "",
        daysUntilExpiry: -1,
        protocol: "unknown",
        serialNumber: "",
        fingerprint: "",
        altNames: [],
        grade: "F",
        error: err.message,
      });
    });

    socket.setTimeout(10_000, () => {
      socket.destroy();
      resolve({
        valid: false,
        issuer: "",
        subject: hostname,
        validFrom: "",
        validTo: "",
        daysUntilExpiry: -1,
        protocol: "unknown",
        serialNumber: "",
        fingerprint: "",
        altNames: [],
        grade: "F",
        error: "Connection timed out",
      });
    });
  });
}
