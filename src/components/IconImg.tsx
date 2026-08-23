import { useState } from "react";

interface IconImgProps {
  src: string;
  alt: string;
  className?: string;
}

export default function IconImg({ src, alt, className }: IconImgProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-osrs-panel-dark/60 text-[10px] font-semibold text-osrs-parchment-dark/60 ${className ?? ""}`}
        title={alt}
      >
        {alt.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`object-contain ${className ?? ""}`}
      onError={() => setFailed(true)}
    />
  );
}
