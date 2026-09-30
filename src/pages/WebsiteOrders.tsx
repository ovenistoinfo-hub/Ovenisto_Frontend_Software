import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { WebsiteOrdersInbox } from '@/components/website/WebsiteOrdersInbox';

export default function WebsiteOrders() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-muted/10">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-primary" />
              Website Orders
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage incoming website orders and accept or decline them.
            </p>
          </div>
        </div>

        <WebsiteOrdersInbox />
      </div>
    </div>
  );
}
