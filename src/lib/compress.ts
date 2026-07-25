import { PDFDocument, PDFRawStream, PDFName, PDFNumber, PDFArray } from 'pdf-lib';

/**
 * Helper to safely check if a pdf-lib PDFObject is a PDFName matching a target string.
 */
const isName = (obj: any, target: string): boolean => {
  if (!obj) return false;
  if (obj instanceof PDFName) {
    const val = obj.asString();
    return val === `/${target}` || val === target;
  }
  const str = String(obj);
  return str === `/${target}` || str === target;
};

/**
 * Compresses a PDF using a hybrid algorithm:
 * 1. Attempts high-fidelity downsampling of embedded JPEG (DCTDecode) images.
 * 2. If the document has images but direct compression saves < 10% space,
 *    it falls back to page-to-image rasterization.
 * 3. If the document has no images (text/vector only), it avoids rasterization.
 */
export async function compressPdf(
  arrayBuffer: ArrayBuffer,
  level: 'low' | 'medium' | 'high'
): Promise<{ bytes: Uint8Array; actualSize: number }> {
  const originalBytes = new Uint8Array(arrayBuffer);
  const doc = await PDFDocument.load(arrayBuffer);
  
  // Parameters based on level
  const quality = level === 'low' ? 0.75 : level === 'medium' ? 0.55 : 0.35;
  const scale = level === 'low' ? 0.85 : level === 'medium' ? 0.70 : 0.50;

  const indirectObjects = doc.context.enumerateIndirectObjects();
  
  let totalImagesCount = 0;
  let dctImagesCount = 0;

  // First pass: count images and types using helper
  for (const [ref, pdfObject] of indirectObjects) {
    if (!(pdfObject instanceof PDFRawStream)) continue;
    const { dict } = pdfObject;
    const subtype = dict.get(PDFName.of('Subtype'));
    
    if (isName(subtype, 'Image')) {
      totalImagesCount++;
      const filter = dict.get(PDFName.of('Filter'));
      let isDCT = false;
      if (isName(filter, 'DCTDecode')) {
        isDCT = true;
      } else if (filter instanceof PDFArray) {
        isDCT = filter.asArray().some(f => isName(f, 'DCTDecode'));
      }
      if (isDCT) dctImagesCount++;
    }
  }

  console.log(`PDF Compression check: Total images = ${totalImagesCount}, DCT images = ${dctImagesCount}`);

  // Second pass: compress DCT images directly
  if (dctImagesCount > 0) {
    for (const [ref, pdfObject] of indirectObjects) {
      if (!(pdfObject instanceof PDFRawStream)) continue;
      const { dict } = pdfObject;
      const subtype = dict.get(PDFName.of('Subtype'));
      if (!isName(subtype, 'Image')) continue;

      const filter = dict.get(PDFName.of('Filter'));
      let isDCT = false;
      if (isName(filter, 'DCTDecode')) {
        isDCT = true;
      } else if (filter instanceof PDFArray) {
        isDCT = filter.asArray().some(f => isName(f, 'DCTDecode'));
      }

      if (isDCT) {
        const widthObj = dict.get(PDFName.of('Width'));
        const heightObj = dict.get(PDFName.of('Height'));
        
        if (!(widthObj instanceof PDFNumber) || !(heightObj instanceof PDFNumber)) continue;
        
        const width = widthObj.asNumber();
        const height = heightObj.asNumber();
        const originalImageBytes = pdfObject.contents;
        
        try {
          const compressedImageBytes = await compressJpegBytes(originalImageBytes, quality, scale, width, height);
          
          if (compressedImageBytes.length < originalImageBytes.length) {
            // Update the dictionary
            dict.set(PDFName.of('Length'), PDFNumber.of(compressedImageBytes.length));
            const newWidth = Math.round(width * scale);
            const newHeight = Math.round(height * scale);
            dict.set(PDFName.of('Width'), PDFNumber.of(newWidth));
            dict.set(PDFName.of('Height'), PDFNumber.of(newHeight));

            // Create a new stream and assign it to the context
            const newStream = PDFRawStream.of(dict, compressedImageBytes);
            doc.context.assign(ref, newStream);
          }
        } catch (err) {
          console.error('Failed to compress image object:', err);
        }
      }
    }
  }

  let finalBytes = await doc.save({ useObjectStreams: true });
  let compressionRatio = (originalBytes.length - finalBytes.length) / originalBytes.length;

  console.log(`Direct compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);

  // Fallback to rasterization if direct compression did not compress by at least 10%,
  // and the document contains images.
  if (compressionRatio < 0.10 && totalImagesCount > 0) {
    console.log("Direct compression saved less than 10%. Falling back to rasterization compression...");
    try {
      finalBytes = await rasterizeCompress(arrayBuffer, quality, scale);
      compressionRatio = (originalBytes.length - finalBytes.length) / originalBytes.length;
      console.log(`Rasterized compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);
    } catch (err) {
      console.error("Rasterization fallback failed:", err);
    }
  }

  // Ensure we return the smaller array
  if (finalBytes.length >= originalBytes.length) {
    return {
      bytes: originalBytes,
      actualSize: originalBytes.length
    };
  }

  return {
    bytes: finalBytes,
    actualSize: finalBytes.length
  };
}

async function compressJpegBytes(
  bytes: Uint8Array,
  quality: number,
  scale: number,
  originalWidth: number,
  originalHeight: number
): Promise<Uint8Array> {
  return new Promise((resolve) => {
    const blob = new Blob([bytes as any], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(bytes);
        return;
      }
      const newWidth = Math.max(1, Math.round(originalWidth * scale));
      const newHeight = Math.max(1, Math.round(originalHeight * scale));
      canvas.width = newWidth;
      canvas.height = newHeight;
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      
      canvas.toBlob((newBlob) => {
        if (!newBlob) {
          resolve(bytes);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(new Uint8Array(reader.result));
          } else {
            resolve(bytes);
          }
        };
        reader.onerror = () => resolve(bytes);
        reader.readAsArrayBuffer(newBlob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(bytes);
    };
    img.src = url;
  });
}

async function rasterizeCompress(
  arrayBuffer: ArrayBuffer,
  quality: number,
  scale: number
): Promise<Uint8Array> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  const { PDFDocument } = await import('pdf-lib');
  const newDoc = await PDFDocument.create();
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      canvas: canvas
    }).promise;
    
    const jpegBytes = await new Promise<Uint8Array>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(new Uint8Array());
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(new Uint8Array(reader.result));
          } else {
            resolve(new Uint8Array());
          }
        };
        reader.onerror = () => resolve(new Uint8Array());
        reader.readAsArrayBuffer(blob);
      }, 'image/jpeg', quality);
    });
    
    if (jpegBytes.length > 0) {
      const embeddedImage = await newDoc.embedJpg(jpegBytes);
      const newPage = newDoc.addPage([viewport.width, viewport.height]);
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height
      });
    }
  }
  
  return await newDoc.save({ useObjectStreams: true });
}

