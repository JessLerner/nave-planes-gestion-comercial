import { createWorker } from 'tesseract.js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();

/** Mechanical OCR for image-based Stellantis circulars. Parsing remains brand/template-specific. */
export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number };
export type OcrCircularPage = { pageNumber: number; text: string; words: OcrWord[] };

export async function extractStellantisCircularPages(buffer: ArrayBuffer, onProgress?: (progress: number) => void): Promise<OcrCircularPage[]> {
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const worker = await createWorker('spa', 1, { logger: event => event.status === 'recognizing text' && onProgress?.(event.progress) });
  try {
    const pages: OcrCircularPage[] = [];
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 3 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
      const recognized = (await worker.recognize(canvas)).data;
      pages.push({ pageNumber: index, text: recognized.text, words: (recognized.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words.map(word => ({ text: word.text, ...word.bbox })))) ) });
    }
    return pages;
  } finally { await worker.terminate(); }
}

export async function extractStellantisCircularText(buffer: ArrayBuffer, onProgress?: (progress: number) => void) {
  return (await extractStellantisCircularPages(buffer, onProgress)).map(page => page.text).join('\n');
}
