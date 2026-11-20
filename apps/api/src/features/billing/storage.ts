import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DocumentKind, InvoiceScope } from "./queries.js";

const bucket = process.env.RUNLINE_S3_BUCKET ?? "runline-documents";
const storage = new S3Client({
  endpoint: process.env.RUNLINE_S3_ENDPOINT ?? "http://127.0.0.1:8333",
  region: "us-east-1",
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

function documentKey(scope: InvoiceScope, kind: DocumentKind) {
  return `${scope.tenantId}/${scope.invoiceId}/${kind}.pdf`;
}

export async function putDocument(scope: InvoiceScope, kind: DocumentKind, pdf: Buffer) {
  await storage.send(new PutObjectCommand({
    Bucket: bucket, Key: documentKey(scope, kind), Body: pdf, ContentType: "application/pdf",
  }), { abortSignal: AbortSignal.timeout(15000) });
}

export async function getDocument(scope: InvoiceScope, kind: DocumentKind) {
  const document = await storage.send(
    new GetObjectCommand({ Bucket: bucket, Key: documentKey(scope, kind) }),
    { abortSignal: AbortSignal.timeout(10000) },
  );
  if (!document.Body) throw new Error("Document storage returned no body");
  return Buffer.from(await document.Body.transformToByteArray());
}
