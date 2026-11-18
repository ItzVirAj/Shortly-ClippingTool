import { useEffect, useState } from 'react';

export const defaultLook = { captionStyleId: 'trio', captionsEnabled: true, captionSettings: {} };
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function useClipFrame(url) {
    const [frame, setFrame] = useState(null);
    useEffect(() => {
        setFrame(null);
        if (!url) return;
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.preload = 'auto';
        const capture = () => {
            if (!video.videoWidth) return;
            const canvas = document.createElement('canvas');
            canvas.width = 240;
            canvas.height = Math.round((240 * video.videoHeight) / video.videoWidth);
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
                setFrame(canvas.toDataURL('image/jpeg', 0.8));
            } catch {
                setFrame(null);
            }
        };
        video.onloadeddata = capture;
        video.src = url;
        return () => {
            video.onloadeddata = null;
            video.removeAttribute('src');
            video.load();
        };
    }, [url]);
    return frame;
}

export function clipWords(words, segments) {
    let offset = 0;
    return segments.flatMap((seg) => {
        const result = words
            .filter((w) => w.e > seg.start && w.s < seg.end)
            .map((w) => ({
                w: w.w,
                s: offset + Math.max(0, w.s - seg.start),
                e: offset + Math.min(seg.end, w.e) - seg.start,
            }));
        offset += seg.end - seg.start;
        return result;
    });
}
