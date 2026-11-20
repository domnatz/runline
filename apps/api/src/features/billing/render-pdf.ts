import PDFDocument from "pdfkit";
import type { DocumentKind, Invoice, InvoiceLine } from "./queries.js";

const ink = "#171717";
const secondaryInk = "#525252";

export function renderPdf(kind: DocumentKind, invoice: Invoice, lines: InvoiceLine[]) {
  const isReceipt = kind === "receipt";
  const date = isReceipt ? invoice.paidAt : invoice.issuedAt;
  if (!date) throw new Error("Receipt requires a settled invoice");
  const title = isReceipt ? "Payment receipt" : "Invoice";
  const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: invoice.currency, currencyDisplay: "code" });
  const format = (minor: number) => money.format(minor / 100).replaceAll("\u00a0", " ");
  const issuedDate = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" });

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 52,
      info: { Title: title, Author: invoice.tenantName, CreationDate: date, ModDate: date } });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.once("error", reject);
    doc.once("end", () => resolve(Buffer.concat(chunks)));

    doc.fillColor(ink).font("Helvetica-Bold").fontSize(12).text(invoice.tenantName);
    doc.moveDown(0.6);
    doc.fontSize(28).text(title);
    doc.moveDown(0.4);
    doc.fillColor(secondaryInk).font("Helvetica").fontSize(10)
      .text(`Invoice reference: ${invoice.id}`)
      .text(`${isReceipt ? "Recorded" : "Issued"} on ${issuedDate.format(date)}`);
    if (isReceipt) doc.text(`Funds collected: ${format(0)}`);
    doc.moveDown(1.8);
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(12).text(invoice.customerName);
    doc.font("Helvetica").fontSize(10).text(invoice.address).moveDown(0.7).text(invoice.jobTitle);
    doc.moveDown(2);
    doc.font("Helvetica-Bold").fontSize(12).text("Service items").moveDown(0.7);

    for (const line of lines) {
      const details = `${line.quantity} x ${format(line.unitMinor)}`;
      const total = format(line.quantity * line.unitMinor);
      doc.fillColor(ink).font("Helvetica-Bold").fontSize(11).text(line.description);
      doc.fillColor(secondaryInk).font("Helvetica").fontSize(10).text(`${details}  |  ${total}`).moveDown(0.8);
    }

    doc.moveDown(1).fillColor(ink).font("Helvetica-Bold").fontSize(16)
      .text(`${isReceipt ? "Total recorded" : "Invoice total"}  ${format(invoice.totalMinor)}`, { align: "right" });
    doc.end();
  });
}
