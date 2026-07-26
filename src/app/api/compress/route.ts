import { NextRequest, NextResponse } from 'next/server';
import { compress, Resolution } from 'compress-pdf';
import path from 'path';
import fsSync from 'fs';

/**
 * Resolves the absolute path to the bundled Ghostscript executable.
 * Next.js server bundling changes __dirname, so get-bin-path fails to find the local binary unless explicitly specified.
 */
function getGhostscriptBinPath(): string | undefined {
  const rootDir = process.cwd();
  const gsDir = path.join(rootDir, 'node_modules', 'compress-pdf', 'bin', 'gs');

  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(
      path.join(gsDir, 'bin', 'gswin64c.exe'),
      path.join(gsDir, 'gswin64c.exe'),
      path.join(gsDir, 'bin', 'gswin32c.exe')
    );
  } else {
    candidates.push(
      path.join(gsDir, 'bin', 'gs'),
      path.join(gsDir, 'gs'),
      '/usr/bin/gs',
      '/usr/local/bin/gs',
      '/opt/homebrew/bin/gs'
    );
  }

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob | null;
    const level = (formData.get('level') as string) || 'medium';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    const resolutionMap: Record<string, Resolution> = {
      low: 'printer',    // 300 DPI, high quality, light compression
      medium: 'ebook',   // 150 DPI, balanced quality and size
      high: 'screen',    // 72 DPI, maximum file size reduction
    };

    const resolution = resolutionMap[level] || 'ebook';

    // Resolve and set the exact binary path so compress-pdf doesn't fail with ENOENT
    const binPath = getGhostscriptBinPath();
    if (binPath) {
      process.env.COMPRESS_PDF_BIN_PATH = binPath;
      console.log(`[Server] Found Ghostscript binary at: ${binPath}`);
    } else {
      console.warn('[Server] Could not locate bundled Ghostscript binary, relying on system PATH...');
    }

    console.log(`[Server] Compressing PDF (${inputBuffer.length} B) with resolution=${resolution}...`);

    const result = await compress(inputBuffer, {
      resolution,
      compatibilityLevel: 1.4,
      ...(binPath ? { gsModule: binPath } : {}),
    });

    const compressedBuffer: Buffer = Buffer.isBuffer(result) ? result : ((result as any).buffer as Buffer) || Buffer.from(result as any);

    console.log(`[Server] Compression finished: ${compressedBuffer.length} B (saved ${((1 - compressedBuffer.length / inputBuffer.length) * 100).toFixed(1)}%)`);

    // Ensure we return the smaller of the two files
    const finalBuffer = compressedBuffer.length < inputBuffer.length ? compressedBuffer : inputBuffer;

    return new NextResponse(new Uint8Array(finalBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': finalBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('[Server] Ghostscript compression error:', error);
    return NextResponse.json({ error: error.message || 'Compression failed' }, { status: 500 });
  }
}
