import { useState, useEffect } from "react";
import { Flame } from "lucide-react";

interface DisplayCart {
  cart: { name: string; qty: number; price: number; discount: number; modifiers?: string[] }[];
  orderType?: string; tableNumber?: number | null; customerName?: string;
  subtotal?: number; orderDiscount?: number; tax?: number; total?: number;
  status?: "active" | "completed" | "idle"; timestamp?: number;
}

const CustomerDisplay = () => {
  const [data, setData] = useState<DisplayCart | null>(null);
  const [time, setTime] = useState(new Date());
  const [showThankYou, setShowThankYou] = useState(false);

  useEffect(() => {
    const poll = setInterval(() => {
      try {
        const raw = localStorage.getItem("ovenisto-pos-cart");
        if (raw) {
          const parsed: DisplayCart = JSON.parse(raw);
          if (parsed.status === "completed" && !showThankYou) { setShowThankYou(true); setData(null); setTimeout(() => setShowThankYou(false), 5000); }
          else if (parsed.status === "active" && parsed.cart?.length > 0) { setData(parsed); setShowThankYou(false); }
          else if (parsed.status === "idle" || !parsed.cart?.length) { if (!showThankYou) setData(null); }
        }
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(poll);
  }, [showThankYou]);

  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  if (showThankYou) {
    return (
      <div className="dark fixed inset-0 z-50" data-theme="dark">
        <div className="bg-background text-foreground min-h-screen flex flex-col items-center justify-center">
          <div className="animate-in fade-in zoom-in duration-700 text-center">
            <Flame className="h-24 w-24 mx-auto mb-6 text-primary" />
            <h1 className="text-5xl font-bold mb-4 text-primary">Thank You!</h1>
            <p className="text-xl text-muted-foreground">Your order has been placed</p>
            <p className="text-lg text-muted-foreground mt-2">We hope you enjoy your meal!</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data || !data.cart || data.cart.length === 0) {
    return (
      <div className="dark fixed inset-0 z-50" data-theme="dark">
        <div className="bg-background text-foreground min-h-screen flex flex-col items-center justify-center">
          <Flame className="h-20 w-20 mb-4 text-primary" />
          <h1 className="text-4xl font-bold mb-2 text-primary">Welcome to Ovenisto</h1>
          <p className="text-xl text-muted-foreground italic">&quot;Flame-Kissed Flavor&quot;</p>
          <p className="text-sm text-muted-foreground/50 mt-8">{time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dark fixed inset-0 z-50" data-theme="dark">
      <div className="bg-background text-foreground min-h-screen flex flex-col">
        <div className="flex items-center justify-between px-8 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Flame className="h-8 w-8 text-primary" />
            <div><h1 className="text-2xl font-bold text-primary">OVENISTO</h1><p className="text-xs text-muted-foreground italic">&quot;Flame-Kissed Flavor&quot;</p></div>
          </div>
          <span className="text-lg text-muted-foreground tabular-nums">{time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-lg">
                <th className="text-left py-3 font-semibold w-12">#</th>
                <th className="text-left py-3 font-semibold">Item Name</th>
                <th className="text-center py-3 font-semibold w-20">Qty</th>
                <th className="text-right py-3 font-semibold w-36">Price</th>
              </tr>
            </thead>
            <tbody>
              {data.cart.map((item, idx) => (
                <tr key={idx} className="border-b border-border/50 animate-in fade-in slide-in-from-right-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                  <td className="py-4 text-base text-muted-foreground">{idx + 1}</td>
                  <td className="py-4">
                    <span className="text-base font-medium">{item.name}</span>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <p className="text-sm mt-0.5 text-primary">→ {item.modifiers.join(", ")}</p>
                    )}
                  </td>
                  <td className="py-4 text-center text-base font-semibold">{item.qty}</td>
                  <td className="py-4 text-right text-base">Rs. {((item.price * item.qty) - (item.discount || 0)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-8 py-6 border-t border-border">
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex justify-between text-lg text-muted-foreground"><span>Subtotal</span><span>Rs. {(data.subtotal || 0).toLocaleString()}</span></div>
            {(data.orderDiscount || 0) > 0 && <div className="flex justify-between text-lg text-muted-foreground"><span>Discount</span><span>-Rs. {(data.orderDiscount || 0).toLocaleString()}</span></div>}
            <div className="flex justify-between text-lg text-muted-foreground"><span>Tax (16%)</span><span>Rs. {(data.tax || 0).toLocaleString()}</span></div>
            <div className="border-t border-border pt-3 flex justify-between"><span className="text-3xl font-bold">TOTAL</span><span className="text-4xl font-bold text-primary">Rs. {(data.total || 0).toLocaleString()}</span></div>
          </div>
        </div>

        <div className="px-8 py-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground/70">
          <div>
            <span>Order Type: <span className="text-muted-foreground font-medium">{data.orderType || "—"}</span></span>
            {data.tableNumber && <span className="ml-4">Table: <span className="text-muted-foreground font-medium">#{data.tableNumber}</span></span>}
          </div>
          <p className="italic">Thank you for choosing Ovenisto!</p>
        </div>
        <div className="text-center py-2 text-xs text-muted-foreground/40">Powered by Ovenisto POS</div>
      </div>
    </div>
  );
};

export default CustomerDisplay;
