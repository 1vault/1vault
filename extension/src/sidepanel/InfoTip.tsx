import { IconInfo } from "./icons";

type InfoTipProps = {
  text: string;
  label?: string;
};

export function InfoTip({ text, label = "More information" }: InfoTipProps) {
  return (
    <span className="info-tip">
      <button type="button" className="info-tip-btn" aria-label={label}>
        <IconInfo width={11} height={11} />
      </button>
      <span className="info-tip-popover" role="tooltip">
        {text}
      </span>
    </span>
  );
}

export function HeroHead({
  title,
  info,
  infoLabel,
}: {
  title: string;
  info?: string;
  infoLabel?: string;
}) {
  return (
    <div className="hero-head">
      <h1>{title}</h1>
      {info ? <InfoTip text={info} label={infoLabel ?? title} /> : null}
    </div>
  );
}
