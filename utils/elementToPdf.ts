import html2canvas from 'html2canvas';

/**
 * Rasterizes a DOM subtree to a multi-page A4 PDF (portrait).
 * Expands overflow-hidden scroll containers marked with `[data-print-scroll-container]` when present.
 */
export async function elementToPdfBlob(root: HTMLElement): Promise<Blob> {
  const inner = root.querySelector<HTMLElement>('[data-print-scroll-container]');
  const captureEl = inner ?? root;

  const prev = {
    overflow: captureEl.style.overflow,
    maxHeight: captureEl.style.maxHeight,
    height: captureEl.style.height,
    backgroundColor: captureEl.style.backgroundColor,
  };

  captureEl.style.overflow = 'visible';
  captureEl.style.maxHeight = 'none';
  captureEl.style.height = 'auto';
  if (!captureEl.style.backgroundColor) {
    captureEl.style.backgroundColor = '#ffffff';
  }

  try {
    const canvas = await html2canvas(captureEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const innerW = pageW - 2 * margin;
    const innerH = pageH - 2 * margin;

    const imgData = canvas.toDataURL('image/png', 1.0);
    const imgH = (canvas.height * innerW) / canvas.width;

    let yOffset = 0;
    while (yOffset < imgH) {
      pdf.addImage(imgData, 'PNG', margin, margin - yOffset, innerW, imgH);
      yOffset += innerH;
      if (yOffset < imgH) {
        pdf.addPage();
      }
    }

    return pdf.output('blob');
  } finally {
    captureEl.style.overflow = prev.overflow;
    captureEl.style.maxHeight = prev.maxHeight;
    captureEl.style.height = prev.height;
    captureEl.style.backgroundColor = prev.backgroundColor;
  }
}
