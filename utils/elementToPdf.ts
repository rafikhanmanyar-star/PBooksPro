import html2canvas from 'html2canvas';

type PrintOrientation = 'portrait' | 'landscape';

function resolvePrintOrientation(root: HTMLElement): PrintOrientation {
  return root.dataset.printOrientation === 'landscape' ? 'landscape' : 'portrait';
}

/** Printable width inside A4 margins (96 CSS px per inch). */
function a4ContentWidthPx(orientation: PrintOrientation, marginMm = 8): number {
  const pageWidthMm = orientation === 'landscape' ? 297 : 210;
  return ((pageWidthMm - 2 * marginMm) * 96) / 25.4;
}

export function resolveElementToPdfCapturePlan(root: HTMLElement): {
  captureEl: HTMLElement;
  scrollContainers: HTMLElement[];
} {
  return {
    captureEl: root,
    scrollContainers: Array.from(root.querySelectorAll<HTMLElement>('[data-print-scroll-container]')),
  };
}

/**
 * Rasterizes a DOM subtree to a multi-page A4 PDF.
 * Expands overflow-hidden scroll containers marked with `[data-print-scroll-container]` when present.
 * Honors `data-print-orientation="landscape"` on the root element.
 */
export async function elementToPdfBlob(root: HTMLElement): Promise<Blob> {
  const { captureEl, scrollContainers } = resolveElementToPdfCapturePlan(root);
  const orientation = resolvePrintOrientation(root);
  const marginMm = 8;
  const contentWidthPx = a4ContentWidthPx(orientation, marginMm);

  const hadCaptureClass = root.classList.contains('pdf-capture-active');
  root.classList.add('pdf-capture-active');

  const prev = {
    rootWidth: root.style.width,
    rootMaxWidth: root.style.maxWidth,
    captureOverflow: captureEl.style.overflow,
    captureMaxHeight: captureEl.style.maxHeight,
    captureHeight: captureEl.style.height,
    captureWidth: captureEl.style.width,
    captureMaxWidth: captureEl.style.maxWidth,
    captureBackgroundColor: captureEl.style.backgroundColor,
    scrollContainers: scrollContainers.map((el) => ({
      el,
      overflow: el.style.overflow,
      maxHeight: el.style.maxHeight,
      height: el.style.height,
    })),
  };

  root.style.width = `${contentWidthPx}px`;
  root.style.maxWidth = `${contentWidthPx}px`;
  captureEl.style.overflow = 'visible';
  captureEl.style.maxHeight = 'none';
  captureEl.style.height = 'auto';
  captureEl.style.width = `${contentWidthPx}px`;
  captureEl.style.maxWidth = `${contentWidthPx}px`;
  if (!captureEl.style.backgroundColor) {
    captureEl.style.backgroundColor = '#ffffff';
  }
  for (const el of scrollContainers) {
    el.style.overflow = 'visible';
    el.style.maxHeight = 'none';
    el.style.height = 'auto';
  }

  try {
    const canvas = await html2canvas(captureEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: contentWidthPx,
      windowWidth: contentWidthPx,
    });

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = marginMm;
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
    if (!hadCaptureClass) {
      root.classList.remove('pdf-capture-active');
    }
    root.style.width = prev.rootWidth;
    root.style.maxWidth = prev.rootMaxWidth;
    captureEl.style.overflow = prev.captureOverflow;
    captureEl.style.maxHeight = prev.captureMaxHeight;
    captureEl.style.height = prev.captureHeight;
    captureEl.style.width = prev.captureWidth;
    captureEl.style.maxWidth = prev.captureMaxWidth;
    captureEl.style.backgroundColor = prev.captureBackgroundColor;
    for (const saved of prev.scrollContainers) {
      saved.el.style.overflow = saved.overflow;
      saved.el.style.maxHeight = saved.maxHeight;
      saved.el.style.height = saved.height;
    }
  }
}
