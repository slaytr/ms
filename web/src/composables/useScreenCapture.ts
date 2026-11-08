import { onBeforeUnmount, ref } from 'vue';

/** Wraps getDisplayMedia: the user picks the MapleStory window/tab, we render it into a <video>. */
export function useScreenCapture() {
  const video = ref<HTMLVideoElement | null>(null);
  const stream = ref<MediaStream | null>(null);
  const error = ref<string | null>(null);
  const onEndedCallbacks: Array<() => void> = [];

  async function start(): Promise<boolean> {
    error.value = null;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      error.value = 'This browser does not support screen sharing.';
      return false;
    }
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      stream.value = media;
      // The user can stop sharing from the browser's own UI.
      media.getVideoTracks()[0]?.addEventListener('ended', () => {
        stop();
        onEndedCallbacks.forEach((cb) => cb());
      });
      if (video.value) {
        video.value.srcObject = media;
        await video.value.play();
      }
      return true;
    } catch (cause) {
      error.value =
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Screen share was cancelled or denied.'
          : `Could not start screen share: ${(cause as Error).message}`;
      return false;
    }
  }

  function stop(): void {
    stream.value?.getTracks().forEach((track) => track.stop());
    stream.value = null;
    if (video.value) video.value.srcObject = null;
  }

  function onEnded(cb: () => void): void {
    onEndedCallbacks.push(cb);
  }

  onBeforeUnmount(stop);

  return { video, stream, error, start, stop, onEnded };
}
