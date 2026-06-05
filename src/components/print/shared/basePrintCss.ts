export const BASE_PRINT_RESET = `
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
  }
  html, body, #root, #root > * {
    height: initial !important;
    overflow: initial !important;
    background: #ffffff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;
