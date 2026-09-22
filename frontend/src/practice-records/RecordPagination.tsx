import { ChevronLeft, ChevronRight } from "lucide-react";

export function RecordPagination({ page, pages, onChange, label }: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="record-pagination text-actions" aria-label={label}>
      <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="ui-icon" aria-hidden="true" />上一页
      </button>
      <span role="status" aria-live="polite" aria-atomic="true">{page} / {pages}</span>
      <button type="button" disabled={page === pages} onClick={() => onChange(page + 1)}>
        下一页<ChevronRight className="ui-icon" aria-hidden="true" />
      </button>
    </nav>
  );
}
