import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PayslipData {
  employeeName: string;
  designation: string;
  periodStart: string;
  periodEnd: string;
  rateType: string;
  rate: number;
  basePayLabel: string; // e.g. "Base Pay (160 hours)" or "Base Pay (22 shifts)"
  basePay: number;
  penaltiesLabel?: string; // e.g. "Penalties Deducted (Absents: 2)" — defaults to "Penalties (Absents)"
  penalties: number;
  rewards: number;
  rewardNote?: string;
  finalPay: number;
  isReceipt: boolean; // true = already-disbursed receipt, false = calculated preview
  transactionId?: string;
  paidAt?: string;
  authorizedBy?: string;
}

export function generatePayslipPDF(data: PayslipData) {
  const doc = new jsPDF({ unit: "mm", format: [80, 200] }); // receipt width, matches order invoices
  const w = 80;
  let y = 8;

  // Header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("OVENISTO", w / 2, y, { align: "center" });
  y += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.text('"Flame-Kissed Flavor"', w / 2, y, { align: "center" });
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.text("Ovenisto (Main Branch)", w / 2, y, { align: "center" });
  y += 3.5;
  doc.text("164-J LDA AVENUE-1 Lahore", w / 2, y, { align: "center" });
  y += 3.5;
  doc.text("Phone: 0320-111 98 98", w / 2, y, { align: "center" });
  y += 5;

  // Line
  doc.setDrawColor(180);
  doc.line(4, y, w - 4, y);
  y += 4;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(data.isReceipt ? "SALARY DISBURSEMENT RECEIPT" : "SALARY PAY SLIP (CALCULATED)", w / 2, y, { align: "center" });
  y += 5;

  // Employee/period meta
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const meta: [string, string][] = [
    [`Employee: ${data.employeeName}`, `Role: ${data.designation}`],
    [`Period: ${data.periodStart}`, `to: ${data.periodEnd}`],
    [`Rate: Rs.${data.rate} (${data.rateType})`, data.transactionId ? `Txn: ${data.transactionId.slice(0, 8)}` : ""],
  ];
  meta.forEach(([left, right]) => {
    doc.text(left, 4, y);
    if (right) doc.text(right, w - 4, y, { align: "right" });
    y += 3.5;
  });
  y += 2;

  doc.line(4, y, w - 4, y);
  y += 2;

  // Pay breakdown table
  const rows: string[][] = [
    [data.basePayLabel, `Rs.${data.basePay.toLocaleString()}`],
    [data.penaltiesLabel ?? "Penalties (Absents)", `-Rs.${data.penalties.toLocaleString()}`],
    ["Rewards / Bonuses", `+Rs.${data.rewards.toLocaleString()}`],
  ];
  if (data.rewardNote) rows.push(["Note", data.rewardNote]);

  autoTable(doc, {
    startY: y,
    margin: { left: 4, right: 4 },
    head: [["Description", "Amount"]],
    body: rows,
    styles: { fontSize: 6.5, cellPadding: 1.5 },
    headStyles: { fillColor: [232, 70, 30], textColor: 255, fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 22, halign: "right" },
    },
    theme: "grid",
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  doc.line(4, y, w - 4, y);
  y += 4;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(data.isReceipt ? "TOTAL DISBURSED" : "TOTAL NET PAY", 4, y);
  doc.text(`Rs. ${data.finalPay.toLocaleString()}`, w - 4, y, { align: "right" });
  y += 6;

  if (data.isReceipt) {
    doc.setDrawColor(180);
    doc.line(4, y, w - 4, y);
    y += 4;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(`Paid At: ${data.paidAt ?? ""}`, 4, y);
    y += 3.5;
    doc.text(`Authorized By: ${data.authorizedBy ?? ""}`, 4, y);
    y += 5;
  }

  // Footer
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.text("Thank you for your service at Ovenisto!", w / 2, y, { align: "center" });
  y += 4;
  doc.setFontSize(5);
  doc.setFont("helvetica", "normal");
  doc.text("Powered by Ovenisto POS", w / 2, y, { align: "center" });

  // Trim page height
  const pageHeight = y + 8;
  (doc.internal as any).pageSize.height = pageHeight;

  const filename = data.isReceipt
    ? `Payslip-Receipt-${data.employeeName.replace(/\s+/g, "-")}-${data.periodStart}.pdf`
    : `Payslip-Preview-${data.employeeName.replace(/\s+/g, "-")}-${data.periodStart}.pdf`;
  doc.save(filename);
}
