/**
 * Client-side wrapper for PDF compression.
 * Sends the PDF buffer to the server-side Ghostscript API endpoint (/api/compress).
 */
export async function compressPdf(
  arrayBuffer: ArrayBuffer,
  level: 'low' | 'medium' | 'high'
): Promise<{ bytes: Uint8Array; actualSize: number }> {
  // Pass a slice copy so the original buffer is never detached or mutated
  const originalBytes = new Uint8Array(arrayBuffer.slice(0));

  const formData = new FormData();
  const blob = new Blob([originalBytes], { type: 'application/pdf' });
  formData.append('file', blob, 'document.pdf');
  formData.append('level', level);

  try {
    console.log(`Sending ${originalBytes.length} B to /api/compress (level=${level})...`);
    const response = await fetch('/api/compress', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned status ${response.status}`);
    }

    const compressedArrayBuffer = await response.arrayBuffer();
    const compressedBytes = new Uint8Array(compressedArrayBuffer);

    if (compressedBytes.length === 0 || compressedBytes.length >= originalBytes.length) {
      console.log('Ghostscript produced no size reduction — returning original.');
      return { bytes: originalBytes, actualSize: originalBytes.length };
    }

    console.log(`Received compressed PDF: ${compressedBytes.length} B (saved ${((1 - compressedBytes.length / originalBytes.length) * 100).toFixed(1)}%)`);
    return { bytes: compressedBytes, actualSize: compressedBytes.length };
  } catch (err) {
    console.error('Compression request failed, returning original:', err);
    return { bytes: originalBytes, actualSize: originalBytes.length };
  }
}
