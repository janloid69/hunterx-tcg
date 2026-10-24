// The camera view for scanning on the website. Shows the back camera with a
// guide box, reads the text inside the box every moment with Tesseract.js (on
// the device), and hands it to the page. Also: torch, zoom, and "use a photo".

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { prepareImage, prepareReader, readText, type Crop } from '@/lib/ocr.web';
import { colors } from '@/lib/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';
import type { CardScannerProps, ScannerStatus } from './CardScanner';

const GUIDE = { left: 0.06, right: 0.06, top: 0.4, height: 0.2 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type TrackExtras = { torch?: boolean; zoom?: { min: number; max: number; step?: number } };

/** Where the guide box falls in the camera's own pixels (the video is shown "cover"). */
function guideCrop(video: HTMLVideoElement, box: DOMRect): Crop {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.max(box.width / vw, box.height / vh);
  const offsetX = (box.width - vw * scale) / 2;
  const offsetY = (box.height - vh * scale) / 2;
  const x1 = (box.width * GUIDE.left - offsetX) / scale;
  const x2 = (box.width * (1 - GUIDE.right) - offsetX) / scale;
  const y1 = (box.height * GUIDE.top - offsetY) / scale;
  const y2 = (box.height * (GUIDE.top + GUIDE.height) - offsetY) / scale;
  const x = Math.max(0, x1);
  const y = Math.max(0, y1);
  return { x, y, width: Math.min(vw, x2) - x, height: Math.min(vh, y2) - y };
}

export function CardScanner({ enabled, reading, height, onText, onStatus }: CardScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const onTextRef = useRef(onText);
  const onStatusRef = useRef(onStatus);
  onTextRef.current = onText;
  onStatusRef.current = onStatus;

  const [status, setStatusState] = useState<ScannerStatus>('starting');
  const [streamReady, setStreamReady] = useState(false);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [extras, setExtras] = useState<TrackExtras>({});
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [photoBusy, setPhotoBusy] = useState(false);

  const setStatus = (next: ScannerStatus, detail?: string) => {
    setStatusState(next);
    onStatusRef.current?.(next, detail);
  };

  // Camera on while the page is open.
  useEffect(() => {
    if (!enabled) return undefined;
    let stream: MediaStream | null = null;
    let stopped = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('no-camera', 'This browser can’t use the camera. Use a photo or type the number instead.');
        return;
      }
      setStatus('starting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const videoTrack = stream.getVideoTracks()[0] ?? null;
        setTrack(videoTrack);
        const caps = (videoTrack?.getCapabilities?.() ?? {}) as unknown as TrackExtras & { focusMode?: string[] };
        setExtras({ torch: Boolean(caps.torch), zoom: caps.zoom && caps.zoom.max > 1 ? caps.zoom : undefined });
        if (caps.focusMode?.includes('continuous')) {
          videoTrack
            ?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] })
            .catch(() => {});
        }
        setStreamReady(true);
      } catch (error) {
        const name = (error as { name?: string })?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied', 'Camera access is blocked. Allow the camera for this site in your browser settings, or type the number.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setStatus('no-camera', 'No camera found. Use a photo or type the number instead.');
        } else {
          setStatus('error', 'The camera didn’t start. Try again, or type the number.');
        }
      }
    })();
    return () => {
      stopped = true;
      setStreamReady(false);
      setTorchOn(false);
      setZoom(1);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Read the guide box over and over while reading is on.
  useEffect(() => {
    if (!enabled || !reading || !streamReady) {
      if (streamReady && !reading) setStatus('paused');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        setStatus('loading-reader');
        await prepareReader();
      } catch (error) {
        if (!cancelled) setStatus('error', (error as Error).message);
        return;
      }
      if (cancelled) return;
      setStatus('scanning');
      let invert = false;
      while (!cancelled) {
        const video = videoRef.current;
        const box = boxRef.current;
        if (!video || !box || video.readyState < 2 || !video.videoWidth) {
          await sleep(300);
          continue;
        }
        const crop = guideCrop(video, box.getBoundingClientRect());
        if (crop.width < 20 || crop.height < 10) {
          await sleep(300);
          continue;
        }
        const image = prepareImage(video, crop, { invert });
        invert = !invert; // every other try reads light text on dark cards
        let text = '';
        try {
          text = await readText(image);
        } catch {
          await sleep(500);
          continue;
        }
        if (cancelled) break;
        if (text.trim() && (await onTextRef.current(text))) break;
        await sleep(200);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reading, streamReady]);

  async function toggleTorch() {
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setExtras((current) => ({ ...current, torch: false }));
    }
  }

  async function cycleZoom() {
    if (!track || !extras.zoom) return;
    const steps = [1, 2, 3].filter((step) => step >= extras.zoom!.min && step <= extras.zoom!.max);
    const next = steps[(steps.indexOf(zoom) + 1) % steps.length] ?? 1;
    try {
      await track.applyConstraints({ advanced: [{ zoom: next } as unknown as MediaTrackConstraintSet] });
      setZoom(next);
    } catch {
      setExtras((current) => ({ ...current, zoom: undefined }));
    }
  }

  async function readPhoto(file: File) {
    setPhotoBusy(true);
    try {
      await prepareReader();
      const bitmap = await createImageBitmap(file);
      const full = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
      // The number is near the bottom: read the bottom third first, then the whole photo.
      const bottom = { x: 0, y: bitmap.height * 0.66, width: bitmap.width, height: bitmap.height * 0.34 };
      for (const crop of [bottom, full]) {
        for (const invert of [false, true]) {
          const text = await readText(prepareImage(bitmap, crop, { invert, maxWidth: 1800 }));
          if (text.trim() && (await onTextRef.current(text))) return;
        }
      }
      onStatusRef.current?.('no-match', 'Couldn’t find a card number in that photo. Get closer to the number, or type it.');
    } catch (error) {
      onStatusRef.current?.('error', (error as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  const cameraOff = status === 'denied' || status === 'no-camera' || status === 'error';
  const hint =
    status === 'starting'
      ? 'Starting the camera…'
      : status === 'loading-reader'
        ? 'Loading the card reader (first time only)…'
        : status === 'scanning'
          ? 'Fit the card number in the box'
          : status === 'paused'
            ? 'Paused'
            : '';

  const boxStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height,
    borderRadius: 16,
    overflow: 'hidden',
    background: '#000',
  };
  const videoStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: cameraOff ? 0 : 1,
  };
  const guideStyle: CSSProperties = {
    position: 'absolute',
    left: `${GUIDE.left * 100}%`,
    right: `${GUIDE.right * 100}%`,
    top: `${GUIDE.top * 100}%`,
    height: `${GUIDE.height * 100}%`,
    border: `3px solid ${status === 'scanning' ? colors.accent : 'rgba(255,255,255,0.7)'}`,
    borderRadius: 12,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
    pointerEvents: 'none',
  };

  return (
    <View style={{ gap: 10 }}>
      <div ref={boxRef} style={boxStyle}>
        <video ref={videoRef} playsInline muted autoPlay style={videoStyle} />
        {cameraOff ? null : <div style={guideStyle} />}
        {hint ? (
          <View style={styles.hint}>
            <AppText variant="smallStrong" color="#fff" style={{ textAlign: 'center' }}>
              {hint}
            </AppText>
          </View>
        ) : null}
        {cameraOff ? (
          <View style={styles.off}>
            <Icon name="camera" size={34} color={colors.textMuted} />
          </View>
        ) : null}
        <View style={styles.tools}>
          {extras.torch ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={torchOn ? 'Turn the light off' : 'Turn the light on'}
              accessibilityState={{ selected: torchOn }}
              onPress={toggleTorch}
              style={torchOn ? styles.toolOn : styles.tool}
            >
              <Icon name="flash" size={20} color={torchOn ? colors.onAccent : '#fff'} />
            </Pressable>
          ) : null}
          {extras.zoom ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Zoom ${zoom}x, tap to change`} onPress={cycleZoom} style={styles.tool}>
              <AppText variant="smallStrong" color="#fff">
                {zoom}×
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </div>

      <View style={styles.photoRow}>
        <Pressable
          accessibilityRole="button"
          disabled={photoBusy}
          onPress={() => fileRef.current?.click()}
          style={styles.photoButton}
        >
          <Icon name="camera" size={18} color={colors.accent} />
          <AppText variant="smallStrong" color={colors.accent}>
            {photoBusy ? 'Reading the photo…' : 'Use a photo instead'}
          </AppText>
        </Pressable>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) readPhoto(file);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 14,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  off: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  tools: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', gap: 8 },
  tool: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolOn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRow: { flexDirection: 'row', justifyContent: 'center' },
  photoButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 12 },
});
