import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fsSync from 'fs';
import fs from 'fs/promises';
import os from 'os';
import crypto from 'crypto';
import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCallback);

import { execSync } from 'child_process';

/**
 * Resolves or downloads the absolute path to the Ghostscript executable.
 * On Vercel (Linux), node_modules may be pruned. If gs is missing, we download it to /tmp.
 */
async function ensureGhostscriptBinPath(): Promise<string> {
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
      '/tmp/gs/bin/gs', // Runtime downloaded location
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

  // If we are on Linux and GS is missing (e.g. Vercel), download it at runtime!
  if (process.platform === 'linux') {
    console.log('[Server] Ghostscript missing on Linux. Downloading to /tmp...');
    const tmpGsDir = '/tmp/gs';
    const tmpTarPath = '/tmp/ghostscript_linux.tar.xz';
    const downloadUrl = 'https://github.com/victorsoares96/compress-pdf/releases/download/binaries/ghostscript_linux.tar.xz';
    
    try {
      if (!fsSync.existsSync(tmpGsDir)) {
        execSync(`mkdir -p ${tmpGsDir}`);
        execSync(`curl -L -s ${downloadUrl} -o ${tmpTarPath}`);
        execSync(`tar -xJf ${tmpTarPath} -C ${tmpGsDir}`);
        execSync(`chmod +x ${tmpGsDir}/bin/gs`);
        execSync(`rm ${tmpTarPath}`);
        console.log('[Server] Ghostscript successfully downloaded and extracted to /tmp/gs/bin/gs');
      }
      return `${tmpGsDir}/bin/gs`;
    } catch (e: any) {
      console.error('[Server] Failed to download Ghostscript at runtime:', e.message);
    }
  }

  return process.platform === 'win32' ? 'gswin64c' : 'gs';
}

async function compressWithGhostscript(
  inputBuffer: Buffer,
  level: string,
  gsBinary: string
): Promise<Buffer> {
  const tempDir = os.tmpdir();
  const id = crypto.randomUUID();
  const inputPath = path.join(tempDir, `gs-in-${id}.pdf`);
  const outputPath = path.join(tempDir, `gs-out-${id}.pdf`);

  await fs.writeFile(inputPath, inputBuffer);

  try {
    const presetMap: Record<string, { setting: string; dpi: number; qFactor: number }> = {
      low: { setting: '/printer', dpi: 200, qFactor: 0.7 },
      medium: { setting: '/ebook', dpi: 120, qFactor: 0.4 },
      high: { setting: '/screen', dpi: 72, qFactor: 0.25 },
    };

    const config = presetMap[level] || presetMap.medium;

    const args = [
      '-q',
      '-dNOPAUSE',
      '-dBATCH',
      '-dSAFER',
      '-dSimulateOverprint=true',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${config.setting}`,
      '-dEmbedAllFonts=true',
      '-dSubsetFonts=true',
      '-dAutoRotatePages=/None',
      
      // Force aggressive downsampling at 1.0 threshold for ALL image types
      '-dDownsampleColorImages=true',
      '-dColorImageDownsampleType=/Bicubic',
      `-dColorImageResolution=${config.dpi}`,
      '-dColorImageDownsampleThreshold=1.0',
      
      '-dDownsampleGrayImages=true',
      '-dGrayImageDownsampleType=/Bicubic',
      `-dGrayImageResolution=${config.dpi}`,
      '-dGrayImageDownsampleThreshold=1.0',
      
      '-dDownsampleMonoImages=true',
      '-dMonoImageDownsampleType=/Bicubic',
      `-dMonoImageResolution=${config.dpi}`,
      '-dMonoImageDownsampleThreshold=1.0',
      
      // Prevent AutoFilter override and force lossy DCT (JPEG) encoding
      '-dAutoFilterColorImages=false',
      '-dAutoFilterGrayImages=false',
      '-dColorImageFilter=/DCTEncode',
      '-dGrayImageFilter=/DCTEncode',
      
      `-sOutputFile=${outputPath}`,
      '-c',
      `<< /ColorImageDict << /QFactor ${config.qFactor} /Blend 1 >> /GrayImageDict << /QFactor ${config.qFactor} /Blend 1 >> >> setdistillerparams`,
      '-f',
      inputPath,
    ];

    console.log(`[Server] Executing Ghostscript (${gsBinary}) with level=${level}, dpi=${config.dpi}, qFactor=${config.qFactor}...`);

    // Pass windowsHide: true to prevent Windows terminal popup flash
    await execFile(gsBinary, args, { windowsHide: true });

    const compressedBuffer = await fs.readFile(outputPath);
    return compressedBuffer;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
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

    // Resolve or download bundled Ghostscript executable from project root
    const binPath = await ensureGhostscriptBinPath();
    console.log(`[Server] Using Ghostscript binary at: ${binPath}`);

    console.log(`[Server] Compressing PDF (${inputBuffer.length} B) with level=${level}...`);

    const compressedBuffer = await compressWithGhostscript(inputBuffer, level, binPath);

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
