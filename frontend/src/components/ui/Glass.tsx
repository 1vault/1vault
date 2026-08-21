import type { ElementType, ReactNode } from "react";

type GlassProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  as?: ElementType;
};

export default function Glass({
  children,
  className = "",
  contentClassName = "",
  as: Tag = "div",
}: GlassProps) {
  return (
    <Tag className={`liquidGL glass-edge ${className}`}>
      {/*
        data-liquid-ignore keeps the layout box but excludes the content from the
        refraction snapshot, so the pane does not refract a ghost of its own text.
      */}
      <div data-liquid-ignore className={`glass-content ${contentClassName}`}>
        {children}
      </div>
    </Tag>
  );
}
