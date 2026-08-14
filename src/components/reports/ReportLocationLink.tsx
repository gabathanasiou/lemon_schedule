import React from 'react';

// Shared renderer for every location link (map block address bar, link block).
// Canvas inertness comes from the global .block-card a rule — callers don't
// need to opt in.

interface ReportLocationLinkProps {
  href: string;
  label: string;
  style?: React.CSSProperties;
  className?: string;
}

export const ReportLocationLink: React.FC<ReportLocationLinkProps> = ({ href, label, style, className }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className={`report-location-link ${className || ''}`}
    style={style}
  >
    {label || href}
  </a>
);
