import { ref } from 'vue';

import { postMissFrame } from '../lib/api';
import type { Detection } from '../lib/detect/detect.ts';
import { frameToPng } from '../lib/fixtures';
import { createMissGate, describeDetection, findMisses, gameSeen, missSignature } from '../lib/miss-capture';

/**
 * When the detector can't read some piece of data, saves a full-resolution screenshot to the server so
 * it can be pulled from production and trained on. Best effort: it never interrupts tracking, and a
 * failed upload only sets `error`. A frame is only kept once the game has been recognised in this run,
 * so sharing the wrong window never uploads it.
 */
export function useMissReporter() {
  const gate = createMissGate();
  let gameWasSeen = false;
  const sent = ref(0);
  const error = ref<string | null>(null);

  async function consider(detection: Detection, video: HTMLVideoElement, sessionId: string): Promise<void> {
    if (gameSeen(detection)) gameWasSeen = true;
    if (!gameWasSeen) return;

    const misses = findMisses(detection);
    if (misses.length === 0) return;

    const { videoWidth: width, videoHeight: height } = video;
    const signature = missSignature(misses, detection, width, height);
    const now = Date.now();
    if (!gate.allow(signature, now)) return;
    gate.record(signature, now); // claimed before the upload so the next tick can't send it twice

    try {
      const png = await frameToPng(video);
      const result = await postMissFrame({
        width,
        height,
        missing: misses,
        detection: describeDetection(detection),
        ...(sessionId ? { sessionId } : {}),
        png,
      });
      if (result.stored) sent.value += 1;
      error.value = null;
    } catch (cause) {
      gate.forget(signature);
      error.value = (cause as Error).message;
    }
  }

  function reset(): void {
    gate.reset();
    gameWasSeen = false;
    sent.value = 0;
    error.value = null;
  }

  return { consider, reset, sent, error };
}
