import html2canvas from 'html2canvas';

// Helper canvas context to convert any modern CSS color (oklch, color-mix, lab, etc.) to standard hex/rgba
const helperCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const helperCtx = helperCanvas ? helperCanvas.getContext('2d') : null;

/**
 * Convert any CSS color (including modern oklch, lab, color-mix) to standard hex or rgb/rgba string
 * Browser's 2D canvas context natively resolves any CSS color string to #rrggbb or rgba(...)
 */
function normalizeCssColor(colorStr: string, fallback: string = '#000000'): string {
  if (!colorStr || colorStr === 'transparent' || colorStr === 'inherit' || colorStr === 'initial' || colorStr === 'none') {
    return colorStr;
  }

  // If it's already simple hex or rgb, return as is
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorStr)) {
    return colorStr;
  }

  if (!helperCtx) return fallback;

  try {
    helperCtx.fillStyle = fallback;
    helperCtx.fillStyle = colorStr;
    const resolved = helperCtx.fillStyle;
    return typeof resolved === 'string' ? resolved : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Recursively normalize all colors on cloned DOM tree before html2canvas parses it
 */
function sanitizeClonedDomColors(clonedElement: HTMLElement, originalElement: HTMLElement) {
  // 1. Sanitize style tags in cloned doc
  const doc = clonedElement.ownerDocument;
  if (doc) {
    const styleTags = doc.querySelectorAll('style');
    styleTags.forEach(st => {
      if (st.textContent && st.textContent.includes('oklch')) {
        // Replace oklch definitions with neutral fallbacks to prevent html2canvas crashing on stylesheet rules
        st.textContent = st.textContent.replace(/oklch\([^)]+\)/g, '#6b7280');
      }
    });
  }

  const origElements = [originalElement, ...Array.from(originalElement.querySelectorAll('*'))] as HTMLElement[];
  const cloneElements = [clonedElement, ...Array.from(clonedElement.querySelectorAll('*'))] as HTMLElement[];

  const colorProperties = [
    'color',
    'backgroundColor',
    'borderTopColor',
    'borderBottomColor',
    'borderLeftColor',
    'borderRightColor',
    'outlineColor',
    'textDecorationColor',
    'fill',
    'stroke',
  ] as const;

  for (let i = 0; i < origElements.length && i < cloneElements.length; i++) {
    const orig = origElements[i];
    const clone = cloneElements[i];
    if (!orig || !clone) continue;

    try {
      const computed = window.getComputedStyle(orig);

      colorProperties.forEach(prop => {
        const val = computed.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
        if (val && (val.includes('oklch') || val.includes('color(') || val.includes('color-mix') || val.includes('lab('))) {
          const normalized = normalizeCssColor(val, prop === 'backgroundColor' ? '#ffffff' : '#000000');
          (clone.style as any)[prop] = normalized;
        }
      });
    } catch {
      // ignore getComputedStyle errors on detached nodes
    }
  }
}

/**
 * Capture an HTML element as high-resolution PNG canvas using html2canvas with oklch sanitization
 */
export async function captureInvoiceElement(elementId: string): Promise<HTMLCanvasElement | null> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element #${elementId} not found for capture`);
    return null;
  }

  try {
    // Primary: html2canvas with robust onclone color sanitization
    const canvas = await html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      onclone: (clonedDoc) => {
        const clonedEl = clonedDoc.getElementById(elementId);
        if (clonedEl) {
          sanitizeClonedDomColors(clonedEl, element);
        }
      },
    });

    return canvas;
  } catch (err: any) {
    console.warn('html2canvas failed, attempting SVG ForeignObject capture fallback:', err);
    return captureWithForeignObject(element);
  }
}

/**
 * Fallback SVG ForeignObject renderer (100% native browser engine, immune to CSS color syntax issues)
 */
async function captureWithForeignObject(element: HTMLElement): Promise<HTMLCanvasElement | null> {
  try {
    const width = element.offsetWidth || 800;
    const height = element.offsetHeight || 1000;
    const scale = 2.5;

    // Clone element and inline computed styles
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.backgroundColor = '#ffffff';

    const serializedHtml = new XMLSerializer().serializeToString(clone);

    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="background:#ffffff; color:#000000; font-family: sans-serif;">
            ${serializedHtml}
          </div>
        </foreignObject>
      </svg>
    `;

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    URL.revokeObjectURL(url);
    return canvas;
  } catch (fallbackErr) {
    console.error('All screenshot capture methods failed:', fallbackErr);
    return null;
  }
}

/**
 * Copy invoice directly to system clipboard as image (PNG)
 * Perfect for instant pasting into Facebook Messenger, WhatsApp, or chat
 */
export async function copyInvoiceToClipboard(elementId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const canvas = await captureInvoiceElement(elementId);
    if (!canvas) {
      return { success: false, message: 'Could not render invoice image' };
    }

    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve({ success: false, message: 'Failed to create image blob' });
          return;
        }

        try {
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            resolve({ success: true, message: 'Invoice screenshot copied to clipboard!' });
          } else {
            // Fallback: trigger download if clipboard API is not available
            downloadBlob(blob, `Invoice-Screenshot-${Date.now()}.png`);
            resolve({ success: true, message: 'Saved as image file (Clipboard unavailable)' });
          }
        } catch (err: any) {
          console.warn('Clipboard write failed, falling back to download:', err);
          downloadBlob(blob, `Invoice-Screenshot-${Date.now()}.png`);
          resolve({ success: true, message: 'Saved as image file' });
        }
      }, 'image/png', 1.0);
    });
  } catch (err: any) {
    console.error('Error capturing screenshot:', err);
    return { success: false, message: err?.message || 'Screenshot failed' };
  }
}

/**
 * Save / Download invoice as high-resolution PNG image
 */
export async function saveInvoiceAsImage(elementId: string, filename: string = 'Invoice.png'): Promise<boolean> {
  try {
    const canvas = await captureInvoiceElement(elementId);
    if (!canvas) return false;

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error('Error downloading invoice image:', err);
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
