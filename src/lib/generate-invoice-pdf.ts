import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface InvoiceItem {
  name: string;
  qty: number;
  price: number;
  discount?: number;
}

interface InvoiceData {
  orderNumber: string;
  date: string;
  time: string;
  orderType: string;
  tableNumber?: number | null;
  customer: string;
  phone?: string;
  staff?: string;
  paymentMethod: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function generateInvoicePDF(data: InvoiceData) {
  const doc = new jsPDF({ unit: "mm", format: [80, 200] }); // receipt width
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

  // Order meta
  doc.setFontSize(7);
  const meta = [
    [`Order #: ${data.orderNumber}`, `Date: ${data.date}`],
    [`Type: ${data.orderType}${data.tableNumber ? ` - Table #${data.tableNumber}` : ""}`, `Time: ${data.time}`],
    [`Customer: ${data.customer}`, data.phone ? `Phone: ${data.phone}` : ""],
    [data.staff ? `Staff: ${data.staff}` : "", `Payment: ${data.paymentMethod}`],
  ];
  meta.forEach(([left, right]) => {
    doc.text(left, 4, y);
    if (right) doc.text(right, w - 4, y, { align: "right" });
    y += 3.5;
  });
  y += 2;

  doc.line(4, y, w - 4, y);
  y += 2;

  // Items table
  autoTable(doc, {
    startY: y,
    margin: { left: 4, right: 4 },
    head: [["Item", "Qty", "Price", "Total"]],
    body: data.items.map((item) => [
      item.name,
      String(item.qty),
      `Rs.${item.price}`,
      `Rs.${((item.price * item.qty) - (item.discount || 0)).toLocaleString()}`,
    ]),
    styles: { fontSize: 6.5, cellPadding: 1.5 },
    headStyles: { fillColor: [232, 70, 30], textColor: 255, fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 8, halign: "center" },
      2: { cellWidth: 16, halign: "right" },
      3: { cellWidth: 18, halign: "right" },
    },
    theme: "grid",
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  doc.line(4, y, w - 4, y);
  y += 4;

  // Totals
  doc.setFontSize(7);
  const totals: [string, string][] = [
    ["Subtotal", `Rs. ${data.subtotal.toLocaleString()}`],
  ];
  if (data.discount > 0) totals.push(["Discount", `-Rs. ${data.discount.toLocaleString()}`]);
  totals.push(["Tax (16%)", `Rs. ${data.tax.toLocaleString()}`]);

  totals.forEach(([label, val]) => {
    doc.text(label, 4, y);
    doc.text(val, w - 4, y, { align: "right" });
    y += 3.5;
  });

  y += 1;
  doc.line(4, y, w - 4, y);
  y += 4;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", 4, y);
  doc.text(`Rs. ${data.total.toLocaleString()}`, w - 4, y, { align: "right" });
  y += 6;

  // Footer
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.text("Thank you for dining at Ovenisto!", w / 2, y, { align: "center" });
  y += 4;
  doc.setFontSize(5);
  doc.setFont("helvetica", "normal");
  doc.text("Powered by Ovenisto POS", w / 2, y, { align: "center" });

  // Trim page height
  const pageHeight = y + 8;
  (doc.internal as any).pageSize.height = pageHeight;

  doc.save(`Invoice-${data.orderNumber}.pdf`);
}
