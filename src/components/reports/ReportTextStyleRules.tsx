import React from 'react';
import { Project } from '../../types';
import { getTextStyles } from '../../lib/reportTextStyles';

// Editor-only WYSIWYG for linked named-style runs (roadmap 193): the mark
// stores just `data-text-style="id"`, so the canvas editors (report text
// blocks + free-table cells) render the LIVE registry typography through
// these scoped rules. Preview/print resolve the marker inline in
// `resolveReportTokensHtml`, so they never need this sheet.
export const ReportTextStyleRules: React.FC<{ project: Project }> = ({ project }) => (
  <style>
    {getTextStyles(project).map(s => {
      const decls = [
        `font-size: ${s.fontSize}pt`,
        s.fontFamily ? `font-family: ${s.fontFamily}` : '',
        s.bold ? 'font-weight: 700' : '',
        s.italic ? 'font-style: italic' : '',
      ].filter(Boolean).join('; ');
      return `.richtext-editor [data-text-style="${s.id}"] { ${decls}; }`;
    }).join('')}
  </style>
);

export default ReportTextStyleRules;
