import { useState, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Flame, LogOut, ChevronDown, ChevronRight, X
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { useModuleEvents } from "@/hooks/use-module-events";
import { cancellationRequestService } from "@/services/cancellationRequest.service";
import { api } from "@/services/api";
import { navSections } from "./AppSidebar";

interface NavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NavDrawer({ open, onOpenChange }: NavDrawerProps) {
  const location = useLocation();
  const { logout, hasPermission, user } = useAuth();

  const canReviewCancellations = hasPermission("cancellation-requests");
  const [pendingCancelCount, setPendingCancelCount] = useState(0);
  const refreshPendingCancelCount = useCallback(() => {
    if (!canReviewCancellations) return;
    api.clearCache('/cancellation-requests');
    cancellationRequestService.list({ status: "pending" })
      .then(r => setPendingCancelCount(r.length))
      .catch(() => {});
  }, [canReviewCancellations]);

  useModuleEvents(["cancellationRequest:created", "cancellationRequest:updated"], refreshPendingCancelCount);
  useVisiblePolling(refreshPendingCancelCount, 120000, canReviewCancellations);

  const isActive = (url?: string) => {
    if (!url) return false;
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-0 bg-card border-r border-border flex flex-col h-full">
        {/* Header */}
        <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card">
          <Link
            to="/"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2.5 font-bold text-foreground text-base tracking-tight"
          >
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shadow-xs">
              <Flame className="h-4 w-4 text-primary-foreground" />
            </div>
            <span>Ovenisto</span>
          </Link>
        </div>

        {/* Scrollable Nav Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {navSections.map((section) => {
            const visibleItems = section.items.filter((item: any) => {
              if (item.url === "/my-portal" && ["Admin", "Super Admin"].includes(user?.role ?? "")) {
                return false;
              }
              return !item.module || hasPermission(item.module);
            });
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.label} className="space-y-1">
                <p className="px-2.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-1">
                  {section.label}
                </p>
                {visibleItems.map((item: any) =>
                  item.children ? (
                    <CollapsibleDrawerItem
                      key={item.title}
                      item={item}
                      isActive={isActive}
                      onNavigate={() => onOpenChange(false)}
                    />
                  ) : (
                    <Link
                      key={item.title}
                      to={item.url!}
                      onClick={() => onOpenChange(false)}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                        isActive(item.url)
                          ? "bg-primary/10 text-primary font-bold border-l-2 border-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.title}</span>
                      {item.url === "/cancellation-requests" && pendingCancelCount > 0 && (
                        <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] leading-none">
                          {pendingCancelCount}
                        </Badge>
                      )}
                    </Link>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border bg-card shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="w-full justify-start text-xs font-semibold text-destructive hover:bg-destructive/10 rounded-lg gap-2"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CollapsibleDrawerItem({
  item,
  isActive,
  onNavigate,
}: {
  item: any;
  isActive: (url?: string) => boolean;
  onNavigate: () => void;
}) {
  const { hasPermission } = useAuth();
  const visibleChildren = item.children?.filter((c: any) => !c.module || hasPermission(c.module)) || [];
  const hasActiveChild = visibleChildren.some((c: any) => isActive(c.url));
  const [open, setOpen] = useState(hasActiveChild);
  const Icon = item.icon;

  if (visibleChildren.length === 0) return null;

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/60",
          hasActiveChild && "text-foreground font-bold"
        )}
      >
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0" />
          <span>{item.title}</span>
        </div>
        {open ? <ChevronDown className="h-3.5 w-3.5 opacity-60" /> : <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
      </button>

      {open && (
        <div className="pl-6 space-y-0.5 border-l border-border/40 ml-4 py-1">
          {visibleChildren.map((child: any) => (
            <Link
              key={child.title}
              to={child.url}
              onClick={onNavigate}
              className={cn(
                "block px-2.5 py-1.5 rounded-md text-xs transition-colors",
                isActive(child.url)
                  ? "bg-primary/10 text-primary font-bold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              {child.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
