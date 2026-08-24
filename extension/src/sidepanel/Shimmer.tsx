import { useMemo, type CSSProperties, type ReactNode } from "react";
import { VaultSummaryShimmer } from "./VaultSummary";

export function ShimmerBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <span className={`shimmer ${className}`.trim()} style={style} aria-hidden />;
}

export function ShimmerRow() {
  return (
    <div className="row-card shimmer-row" aria-busy="true" aria-label="Loading">
      <ShimmerBlock className="shimmer-avatar" />
      <div className="row-main">
        <ShimmerBlock className="shimmer-line shimmer-line-md" />
        <ShimmerBlock className="shimmer-line shimmer-line-sm" />
      </div>
      <div className="row-right">
        <ShimmerBlock className="shimmer-line shimmer-line-sm" />
        <ShimmerBlock className="shimmer-line shimmer-line-xs" />
      </div>
    </div>
  );
}

export function ShimmerList({ count = 3, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`list ${className}`.trim()} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <ShimmerRow key={i} />
      ))}
    </div>
  );
}

export function ShimmerHero() {
  return (
    <section className="hero" aria-busy="true" aria-label="Loading vault">
      <VaultSummaryShimmer />
      <div className="quick hero-quick">
        <ShimmerBlock className="shimmer-quick" />
        <ShimmerBlock className="shimmer-quick" />
        <ShimmerBlock className="shimmer-quick" />
        <ShimmerBlock className="shimmer-quick" />
      </div>
    </section>
  );
}

export function ShimmerResearch() {
  return (
    <div className="dd-result" aria-busy="true">
      <ShimmerBlock className="shimmer-line shimmer-line-md" style={{ width: "55%" }} />
      <ShimmerBlock className="shimmer-line shimmer-line-sm" style={{ width: "100%", height: 72 }} />
    </div>
  );
}

const PAGE_SIZE = 5;

export function usePagedSlice<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  return useMemo(() => {
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    return { slice, total, totalPages, page: safePage, pageSize, start };
  }, [items, page, pageSize]);
}

export function ListPager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}): ReactNode {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="pager">
      <span className="pager-meta">
        {from}–{to} of {total}
      </span>
      <div className="pager-actions">
        <button
          type="button"
          className="pager-btn"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>
        <span className="pager-page">
          {page}/{totalPages}
        </span>
        <button
          type="button"
          className="pager-btn"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}

export { PAGE_SIZE };
