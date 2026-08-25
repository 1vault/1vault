import { completedLabel } from "./ProcessingBanner";

export type TxHistoryItem = {
  id: string;
  label: string;
  tx?: string;
  at: string;
};

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function HistoryPanel({ items }: { items: TxHistoryItem[] }) {
  return (
    <section className="history">
      <h1 className="history-title">History</h1>
      <p className="history-sub">Recent on-chain actions from this session.</p>
      {items.length === 0 ? (
        <div className="empty-hint">No transactions yet — Park, Trade, or Create from Home.</div>
      ) : (
        <div className="list">
          {items.map((item) => (
            <div key={item.id} className="row-card">
              <div className="token-icon">TX</div>
              <div className="row-main">
                <div className="row-title">{item.label}</div>
                <div className="row-sub">{formatWhen(item.at)}</div>
              </div>
              {item.tx ? (
                <div className="row-right">
                  <div className="row-value mono" style={{ fontSize: "var(--fs-xs)" }}>
                    {item.tx.slice(0, 8)}…
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function historyEntryFromMode(
  mode: string | undefined,
  tx?: string
): Omit<TxHistoryItem, "id"> {
  return {
    label: completedLabel(mode as Parameters<typeof completedLabel>[0]),
    tx,
    at: new Date().toISOString(),
  };
}
