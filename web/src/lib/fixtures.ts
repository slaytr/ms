/** Dev-only helpers for saving raw, full-resolution game frames (see api/routes/dev-fixtures.mjs). */

export async function isFixtureUploadEnabled(): Promise<boolean> {
  try {
    const response = await fetch('/api/dev/config');
    const body = (await response.json()) as { data?: { fixtureUpload?: boolean } };
    return body.data?.fixtureUpload === true;
  } catch {
    return false;
  }
}

/** Lossless PNG of the current video frame at its native resolution (no scaling, no JPEG blur). */
export function frameToPng(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0) return Promise.reject(new Error('No video frame available yet.'));
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))), 'image/png'),
  );
}

export async function saveFixture(video: HTMLVideoElement, label: string): Promise<string> {
  const png = await frameToPng(video);
  const query = new URLSearchParams({ label, w: String(video.videoWidth), h: String(video.videoHeight) });
  const response = await fetch(`/api/dev/fixtures?${query}`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: png,
  });
  const body = (await response.json().catch(() => null)) as { data?: { file: string }; error?: string } | null;
  if (!response.ok || !body?.data) throw new Error(body?.error ?? `Save failed (${response.status})`);
  return body.data.file;
}
