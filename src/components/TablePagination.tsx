import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({ currentPage, totalItems, pageSize = 10, onPageChange }: TablePaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages} ({totalItems} items)</p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}><ChevronLeft className="h-3 w-3 mr-1" />Previous</Button>
        <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>Next<ChevronRight className="h-3 w-3 ml-1" /></Button>
      </div>
    </div>
  );
}

export function paginate<T>(items: T[], page: number, pageSize = 10): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize);
}
