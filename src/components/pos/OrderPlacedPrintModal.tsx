import React, { useState } from "react";
import {
  Printer,
  ChefHat,
  DollarSign,
  ScrollText,
  ArrowLeft,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface OrderSlipItem {
  id?: string;
  name: string;
  qty: number;
  price: number;
  discount?: number;
  modifiers?: string[];
  notes?: string | null;
  dealName?: string | null;
  dealItemsLabel?: string;
  cookingTime?: number | null;
}

export interface PlacedOrderSlipData {
  orderNumber: string;
  orderType: string;
  tableNumber?: number | null;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  staffName?: string;
  items: OrderSlipItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  advancePayment?: number;
  netPayable?: number;
  paymentMethod: string;
  dateStr?: string;
  timeStr?: string;
  restaurantName?: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  currency?: string;
  isUrgent?: boolean;
}

export interface OrderPlacedPrintModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slipData: PlacedOrderSlipData | null;
  onDone?: () => void;
}

type PreviewMode = "kot" | "bill" | "both" | null;

/** Send thermal HTML content to a hidden iframe and trigger native print */
export function printThermalDocument(htmlContent: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch (err) {
        console.error("Print error:", err);
      }
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 300);
  }
}

/** Generate HTML for Kitchen Order Ticket */
function generateKOTHtml(slip: PlacedOrderSlipData): string {
  const itemsHtml = slip.items.map((item) => {
    return `
      <div style="margin-bottom: 6px;">
        ${item.dealName ? `<div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #333;">${item.dealName}</div>` : ""}
        <div style="display: flex; justify-content: space-between; align-items: flex-start; font-weight: bold; font-size: 13px;">
          <span style="flex: 1; padding-right: 8px;">${item.name}</span>
          <span style="font-size: 14px;">x${item.qty}</span>
        </div>
        ${item.modifiers && item.modifiers.length > 0 ? `<div style="font-size: 11px; color: #444; margin-left: 8px;">&rarr; ${item.modifiers.join(", ")}</div>` : ""}
        ${item.notes ? `<div style="font-size: 11px; font-weight: bold; font-style: italic; color: #222; margin-left: 8px;">Note: ${item.notes}</div>` : ""}
      </div>
    `;
  }).join("");

  return `
    <div style="text-align: center; margin-bottom: 8px;">
      <div style="font-size: 14px; font-weight: 800; letter-spacing: 0.5px;">KITCHEN ORDER TICKET</div>
      <div style="font-size: 24px; font-weight: 900; margin: 2px 0;">#${slip.orderNumber}</div>
      <div style="font-size: 11px; margin-top: 2px;">#${slip.orderNumber} &bull; ${slip.orderType}</div>
      <div style="font-size: 11px; margin-top: 1px;">
        ${slip.customerName || "Walk-in"}${slip.tableNumber ? ` &bull; Table #${slip.tableNumber}` : ""}${slip.staffName ? ` &bull; Waiter: ${slip.staffName}` : ""}
      </div>
      ${slip.isUrgent ? `<div style="font-size: 11px; font-weight: bold; margin-top: 4px; border: 1px solid #000; display: inline-block; padding: 1px 6px;">*** URGENT ORDER ***</div>` : ""}
    </div>
    <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
    <div>${itemsHtml}</div>
    <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
    <div style="text-align: center; font-size: 11px; color: #333;">
      ${slip.dateStr || new Date().toLocaleDateString()}, ${slip.timeStr || new Date().toLocaleTimeString()}
    </div>
  `;
}

/** Generate HTML for Customer Bill */
function generateBillHtml(slip: PlacedOrderSlipData): string {
  const cur = slip.currency || "Rs.";
  const itemsHtml = slip.items.map((item) => {
    const itemTotal = item.price * item.qty - (item.discount || 0);
    return `
      <tr>
        <td style="padding: 3px 0; vertical-align: top;">
          ${item.dealName ? `<div style="font-size: 9px; font-weight: bold; text-transform: uppercase;">${item.dealName}</div>` : ""}
          <div style="font-weight: 600;">${item.name} x${item.qty}</div>
          ${item.modifiers && item.modifiers.length > 0 ? `<div style="font-size: 9px; color: #555; margin-left: 4px;">+ ${item.modifiers.join(", ")}</div>` : ""}
        </td>
        <td style="padding: 3px 0; text-align: right; vertical-align: top; font-weight: 600; white-space: nowrap;">
          ${cur} ${itemTotal.toLocaleString()}
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div style="text-align: center; margin-bottom: 6px;">
      <div style="font-size: 16px; font-weight: 900; letter-spacing: 0.5px;">${slip.restaurantName || "OVENISTO"}</div>
      <div style="font-size: 12px; font-weight: 700; margin-top: 1px;">Customer Bill</div>
      ${slip.restaurantAddress ? `<div style="font-size: 10px; color: #444; margin-top: 1px;">${slip.restaurantAddress}</div>` : ""}
      ${slip.restaurantPhone ? `<div style="font-size: 10px; color: #444;">Tel: ${slip.restaurantPhone}</div>` : ""}
    </div>
    <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
    <div style="font-size: 11px; line-height: 1.4;">
      <div>#${slip.orderNumber} &bull; ${slip.orderType}${slip.tableNumber ? ` &bull; Table #${slip.tableNumber}` : ""}</div>
      <div>${slip.customerName || "Walk-in"}${slip.customerPhone ? ` &bull; ${slip.customerPhone}` : ""}</div>
      ${slip.customerAddress ? `<div>Address: ${slip.customerAddress}</div>` : ""}
      <div>${slip.dateStr || new Date().toLocaleDateString()}, ${slip.timeStr || new Date().toLocaleTimeString()}</div>
    </div>
    <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <thead>
        <tr style="border-bottom: 1px dashed #000;">
          <th style="text-align: left; padding: 2px 0; font-size: 10px; font-weight: 800;">Item</th>
          <th style="text-align: right; padding: 2px 0; font-size: 10px; font-weight: 800;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
    <div style="font-size: 11px; line-height: 1.5;">
      <div style="display: flex; justify-content: space-between;">
        <span>Subtotal</span>
        <span>${cur} ${slip.subtotal.toLocaleString()}</span>
      </div>
      ${slip.discount > 0 ? `
        <div style="display: flex; justify-content: space-between; color: #111;">
          <span>Discount</span>
          <span>-${cur} ${slip.discount.toLocaleString()}</span>
        </div>
      ` : ""}
      <div style="display: flex; justify-content: space-between;">
        <span>Tax</span>
        <span>${cur} ${slip.tax.toLocaleString()}</span>
      </div>
      <div style="border-bottom: 1px dashed #000; margin: 4px 0;"></div>
      <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 13px;">
        <span>TOTAL</span>
        <span>${cur} ${slip.total.toLocaleString()}</span>
      </div>
      ${(slip.advancePayment && slip.advancePayment > 0) ? `
        <div style="display: flex; justify-content: space-between; font-weight: 700; margin-top: 2px;">
          <span>Advance Paid</span>
          <span>-${cur} ${slip.advancePayment.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 13px; margin-top: 2px;">
          <span>Net Payable</span>
          <span>${cur} ${(slip.netPayable ?? (slip.total - slip.advancePayment)).toLocaleString()}</span>
        </div>
      ` : ""}
    </div>
    <div style="border-bottom: 1px dashed #000; margin: 6px 0;"></div>
    <div style="font-size: 11px; line-height: 1.4;">
      <div>Paid via ${slip.paymentMethod || "Cash"}</div>
    </div>
    <div style="text-align: center; font-size: 11px; margin-top: 10px; font-weight: 600;">
      Thank you for visiting!
    </div>
  `;
}

/** Generate full printable HTML wrapper for thermal paper printer */
function wrapInThermalHtml(title: string, innerHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Courier New', Courier, monospace;
    }
    body {
      width: 72mm;
      margin: 0 auto;
      padding: 8px 2px;
      color: #000;
      background: #fff;
      font-size: 11px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      body {
        width: 100%;
        padding: 4px 1px;
      }
    }
  </style>
</head>
<body onload="window.print()">
  ${innerHtml}
</body>
</html>`;
}

export const OrderPlacedPrintModal: React.FC<OrderPlacedPrintModalProps> = ({
  open,
  onOpenChange,
  slipData,
  onDone,
}) => {
  const [previewMode, setPreviewMode] = useState<PreviewMode>(null);

  if (!slipData) return null;

  const cur = slipData.currency || "Rs.";
  const dateStr = slipData.dateStr || new Date().toLocaleDateString();
  const timeStr = slipData.timeStr || new Date().toLocaleTimeString();

  const handleDone = () => {
    setPreviewMode(null);
    onOpenChange(false);
    if (onDone) onDone();
  };

  const handlePrint = (mode: "kot" | "bill" | "both") => {
    let content = "";
    let title = "";

    if (mode === "kot") {
      title = `KOT - #${slipData.orderNumber}`;
      content = generateKOTHtml(slipData);
      toast.success(`Kitchen Order Ticket #${slipData.orderNumber} sent to printer!`);
    } else if (mode === "bill") {
      title = `Bill - #${slipData.orderNumber}`;
      content = generateBillHtml(slipData);
      toast.success(`Customer Bill #${slipData.orderNumber} sent to printer!`);
    } else {
      title = `KOT + Bill - #${slipData.orderNumber}`;
      content = `
        ${generateKOTHtml(slipData)}
        <div style="border-bottom: 2px dashed #000; margin: 18px 0; position: relative; text-align: center;">
          <span style="background: #fff; padding: 0 8px; font-size: 9px; letter-spacing: 2px; color: #555; position: relative; top: -7px;">
            ✂ CUT HERE
          </span>
        </div>
        ${generateBillHtml(slipData)}
      `;
      toast.success(`KOT + Customer Bill #${slipData.orderNumber} sent to printer!`);
    }

    const fullHtml = wrapInThermalHtml(title, content);
    printThermalDocument(fullHtml);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setPreviewMode(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl shadow-black/50 transition-all",
          previewMode
            ? "max-w-[95vw] sm:max-w-[420px] rounded-3xl"
            : "max-w-[95vw] sm:max-w-[500px] rounded-3xl"
        )}
      >
        {/* Hidden accessible DialogHeader for screen readers */}
        <DialogHeader className="sr-only">
          <DialogTitle>
            {previewMode === "kot"
              ? "Kitchen Order Ticket"
              : previewMode === "bill"
              ? "Customer Bill"
              : previewMode === "both"
              ? "KOT + Bill"
              : "Order Placed"}
          </DialogTitle>
          <DialogDescription>
            Thermal receipt printing and kitchen order ticket generation
          </DialogDescription>
        </DialogHeader>

        {/* ── View 1: Main "Order Placed" 3-Option Grid View ── */}
        {previewMode === null && (
          <div className="p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pr-8">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shadow-inner">
                  <Printer className="h-4.5 w-4.5" />
                </div>
                <h2 className="text-base font-bold text-foreground tracking-tight">Order Placed</h2>
              </div>
            </div>

            {/* Order Number & Type Banner */}
            <div className="bg-muted/40 border border-border/60 rounded-2xl p-4 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black font-mono tracking-tight text-foreground">
                  #{slipData.orderNumber}
                </span>
                {slipData.isUrgent && (
                  <Badge variant="destructive" className="text-[10px] px-2 py-0.5 font-bold">
                    <Zap className="h-3 w-3 mr-0.5" /> URGENT
                  </Badge>
                )}
              </div>
              <Badge
                variant="outline"
                className="bg-card/80 text-foreground font-semibold px-3 py-1 rounded-full border-border/70 text-xs shadow-xs"
              >
                {slipData.orderType}
                {slipData.tableNumber ? ` · Table ${slipData.tableNumber}` : ""}
              </Badge>
            </div>

            {/* 3 Large Action Cards */}
            <div className="grid grid-cols-3 gap-3">
              {/* 1. Print KOT */}
              <button
                type="button"
                onClick={() => setPreviewMode("kot")}
                className="group relative flex flex-col items-center justify-center p-4 py-5 rounded-2xl border border-border/60 bg-muted/20 hover:bg-amber-500/10 hover:border-amber-500/40 text-center transition-all duration-200 cursor-pointer active:scale-[0.97] shadow-xs"
              >
                <div className="h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-3 group-hover:scale-110 group-hover:bg-amber-500/20 transition-all">
                  <ChefHat className="h-6 w-6" />
                </div>
                <span className="text-xs sm:text-sm font-bold text-foreground group-hover:text-amber-500 transition-colors">
                  Print KOT
                </span>
              </button>

              {/* 2. Print Customer Bill */}
              <button
                type="button"
                onClick={() => setPreviewMode("bill")}
                className="group relative flex flex-col items-center justify-center p-4 py-5 rounded-2xl border border-border/60 bg-muted/20 hover:bg-blue-500/10 hover:border-blue-500/40 text-center transition-all duration-200 cursor-pointer active:scale-[0.97] shadow-xs"
              >
                <div className="h-12 w-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-500 mb-3 group-hover:scale-110 group-hover:bg-blue-500/20 transition-all">
                  <DollarSign className="h-6 w-6" />
                </div>
                <span className="text-xs sm:text-sm font-bold text-foreground group-hover:text-blue-500 transition-colors">
                  Print Customer Bill
                </span>
              </button>

              {/* 3. Print KOT + Bill */}
              <button
                type="button"
                onClick={() => setPreviewMode("both")}
                className="group relative flex flex-col items-center justify-center p-4 py-5 rounded-2xl border border-border/60 bg-muted/20 hover:bg-purple-500/10 hover:border-purple-500/40 text-center transition-all duration-200 cursor-pointer active:scale-[0.97] shadow-xs"
              >
                <div className="h-12 w-12 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-500 mb-3 group-hover:scale-110 group-hover:bg-purple-500/20 transition-all">
                  <ScrollText className="h-6 w-6" />
                </div>
                <span className="text-xs sm:text-sm font-bold text-foreground group-hover:text-purple-500 transition-colors">
                  Print KOT + Bill
                </span>
              </button>
            </div>

            {/* Bottom Done Button */}
            <Button
              className="w-full h-11 bg-muted/80 hover:bg-muted text-foreground font-bold rounded-2xl border border-border/60 transition-all active:scale-[0.99]"
              onClick={handleDone}
            >
              Done
            </Button>
          </div>
        )}

        {/* ── View 2: Preview Mode (KOT, Bill, or Both) ── */}
        {previewMode !== null && (
          <div className="p-5 space-y-4">
            {/* Preview Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/40 pr-8">
              <h2 className="text-base font-bold text-foreground">
                {previewMode === "kot"
                  ? "Kitchen Order Ticket"
                  : previewMode === "bill"
                  ? "Customer Bill"
                  : "KOT + Bill"}
              </h2>
            </div>

            {/* Thermal Receipt Paper Card Container */}
            <div className="max-h-[62vh] overflow-y-auto pr-1">
              <div className="bg-white text-black font-mono rounded-2xl p-5 shadow-lg border border-zinc-200 text-xs w-full max-w-[340px] mx-auto select-text">
                {/* ── Render KOT Section ── */}
                {(previewMode === "kot" || previewMode === "both") && (
                  <div className="space-y-3">
                    <div className="text-center space-y-1">
                      <p className="font-extrabold text-sm tracking-wider">KITCHEN ORDER TICKET</p>
                      <p className="text-2xl font-black font-mono">#{slipData.orderNumber}</p>
                      <p className="text-[11px] text-zinc-700">#{slipData.orderNumber} &bull; {slipData.orderType}</p>
                      <p className="text-[11px] text-zinc-700">
                        {slipData.customerName || "Walk-in"}
                        {slipData.tableNumber ? ` &bull; Table #${slipData.tableNumber}` : ""}
                        {slipData.staffName ? ` &bull; Waiter: ${slipData.staffName}` : ""}
                      </p>
                      {slipData.isUrgent && (
                        <p className="font-bold text-[10px] uppercase border border-black px-1.5 py-0.5 inline-block mt-1">
                          *** Urgent Order ***
                        </p>
                      )}
                    </div>

                    <div className="border-b border-dashed border-black/80 my-2" />

                    <div className="space-y-2">
                      {slipData.items.map((item, idx) => (
                        <div key={item.id || idx} className="space-y-0.5">
                          {item.dealName && (
                            <p className="text-[9px] font-bold uppercase text-zinc-600">{item.dealName}</p>
                          )}
                          <div className="flex justify-between items-start font-bold">
                            <span className="pr-2">{item.name}</span>
                            <span className="font-mono text-sm">x{item.qty}</span>
                          </div>
                          {item.modifiers && item.modifiers.length > 0 && (
                            <p className="text-[10px] text-zinc-600 pl-2">&rarr; {item.modifiers.join(", ")}</p>
                          )}
                          {item.notes && (
                            <p className="text-[10px] text-zinc-800 font-semibold italic pl-2">Note: {item.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="border-b border-dashed border-black/80 my-2" />

                    <div className="text-center text-[10px] text-zinc-600">
                      {dateStr}, {timeStr}
                    </div>
                  </div>
                )}

                {/* ── Cut line separator for Combined view ── */}
                {previewMode === "both" && (
                  <div className="relative my-5 text-center">
                    <div className="border-b-2 border-dashed border-zinc-800" />
                    <span className="bg-white px-2 text-[9px] font-mono tracking-widest text-zinc-600 uppercase relative -top-2">
                      ✂ Cut Here
                    </span>
                  </div>
                )}

                {/* ── Render Customer Bill Section ── */}
                {(previewMode === "bill" || previewMode === "both") && (
                  <div className="space-y-3">
                    <div className="text-center space-y-0.5">
                      <p className="font-black text-sm tracking-wider">{slipData.restaurantName || "OVENISTO"}</p>
                      <p className="text-xs font-bold text-zinc-700">Customer Bill</p>
                      {slipData.restaurantAddress && (
                        <p className="text-[10px] text-zinc-600">{slipData.restaurantAddress}</p>
                      )}
                      {slipData.restaurantPhone && (
                        <p className="text-[10px] text-zinc-600">Tel: {slipData.restaurantPhone}</p>
                      )}
                    </div>

                    <div className="border-b border-dashed border-black/80 my-2" />

                    <div className="text-[11px] space-y-0.5">
                      <p>#{slipData.orderNumber} &bull; {slipData.orderType}{slipData.tableNumber ? ` &bull; Table #${slipData.tableNumber}` : ""}</p>
                      <p>{slipData.customerName || "Walk-in"}{slipData.customerPhone ? ` &bull; ${slipData.customerPhone}` : ""}</p>
                      {slipData.customerAddress && <p className="text-[10px]">Address: {slipData.customerAddress}</p>}
                      <p>{dateStr}, {timeStr}</p>
                    </div>

                    <div className="border-b border-dashed border-black/80 my-2" />

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between font-bold text-[10px] pb-1 border-b border-dashed border-black/60">
                        <span>Item</span>
                        <span>Amount</span>
                      </div>
                      {slipData.items.map((item, idx) => {
                        const rowTotal = item.price * item.qty - (item.discount || 0);
                        return (
                          <div key={item.id || idx} className="space-y-0.5">
                            {item.dealName && (
                              <p className="text-[9px] font-bold uppercase text-zinc-600">{item.dealName}</p>
                            )}
                            <div className="flex justify-between items-start">
                              <span className="font-semibold">{item.name} x{item.qty}</span>
                              <span className="font-mono">{cur} {rowTotal.toLocaleString()}</span>
                            </div>
                            {item.modifiers && item.modifiers.length > 0 && (
                              <p className="text-[9px] text-zinc-600 pl-2">+ {item.modifiers.join(", ")}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-b border-dashed border-black/80 my-2" />

                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span className="font-mono">{cur} {slipData.subtotal.toLocaleString()}</span>
                      </div>
                      {slipData.discount > 0 && (
                        <div className="flex justify-between text-zinc-800">
                          <span>Discount</span>
                          <span className="font-mono">-{cur} {slipData.discount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Tax</span>
                        <span className="font-mono">{cur} {slipData.tax.toLocaleString()}</span>
                      </div>
                      <div className="border-b border-dashed border-black/80 my-1" />
                      <div className="flex justify-between font-black text-sm pt-0.5">
                        <span>TOTAL</span>
                        <span className="font-mono">{cur} {slipData.total.toLocaleString()}</span>
                      </div>
                      {slipData.advancePayment && slipData.advancePayment > 0 ? (
                        <>
                          <div className="flex justify-between font-semibold text-zinc-800 pt-0.5">
                            <span>Advance Paid</span>
                            <span className="font-mono">-{cur} {slipData.advancePayment.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between font-black text-sm pt-0.5">
                            <span>Net Payable</span>
                            <span className="font-mono">
                              {cur} {(slipData.netPayable ?? (slipData.total - slipData.advancePayment)).toLocaleString()}
                            </span>
                          </div>
                        </>
                      ) : null}
                    </div>

                    <div className="border-b border-dashed border-black/80 my-2" />

                    <div className="text-[11px]">
                      <p>Paid via {slipData.paymentMethod || "Cash"}</p>
                    </div>

                    <div className="text-center font-bold text-[11px] pt-1">
                      Thank you for visiting!
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Buttons: Back & Print */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                className="h-10 px-5 rounded-xl border-border/70 text-foreground font-semibold gap-1.5"
                onClick={() => setPreviewMode(null)}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                className="flex-1 h-10 px-5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold gap-2 shadow-sm active:scale-[0.98] transition-all"
                onClick={() => handlePrint(previewMode)}
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
export default OrderPlacedPrintModal;
