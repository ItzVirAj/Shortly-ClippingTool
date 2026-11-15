import { getApiUrl } from '../../config';
import { getToken, apiJson } from '../../lib/api';

/**
 * Uploads a media file with progress tracking via XMLHttpRequest.
 * @param {File} file
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<Object>}
 */
export function uploadMedia(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = getApiUrl('/api/editor/upload');

    xhr.open('POST', url, true);

    const token = getToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch (_) {
        data = { error: xhr.statusText || 'Upload failed' };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const errorMsg = data?.error || data?.detail || `Upload failed (${xhr.status})`;
        reject(new Error(errorMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.onabort = () => {
      reject(new Error('Upload aborted'));
    };

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

/**
 * Fetches all uploaded media items for the editor.
 * @returns {Promise<Array>}
 */
export async function listMedia() {
  return apiJson('/api/editor/media');
}

/**
 * Deletes an uploaded media item by ID.
 * @param {string} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function deleteMedia(id) {
  return apiJson(`/api/editor/media/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Lists already-generated Shortly clips from History/output.
 * @returns {Promise<Array<{ id: string, name: string, url: string, thumbUrl: string|null, duration: number|null, createdAt: string }>>}
 */
export async function listShortlyClips() {
  return apiJson('/api/editor/clips');
}

/**
 * Imports a generated Shortly clip into the editor library.
 * @param {string} clipId
 * @returns {Promise<Object>}
 */
export async function importClip(clipId) {
  return apiJson('/api/editor/import-clip', {
    method: 'POST',
    body: JSON.stringify({ clipId }),
  });
}

/**
 * Starts a faster-whisper transcription job for a media item.
 * @param {string} mediaId
 * @param {string} [language]
 * @returns {Promise<{ jobId: string, cached?: boolean, words?: Array }>}
 */
export async function startTranscribe(mediaId, language = 'auto') {
  return apiJson('/api/editor/transcribe', {
    method: 'POST',
    body: JSON.stringify({ mediaId, language }),
  });
}

export const TRANSCRIBE_IN_PROGRESS = ['queued', 'running', 'processing'];
export const isTranscribeInProgress = (status) => TRANSCRIBE_IN_PROGRESS.includes(status);
export const isTranscribeDone = (status) => status === 'done';
export const isTranscribeError = (status) => status === 'error';

/**
 * Gets the status of a transcription job.
 * @param {string} jobId
 * @returns {Promise<{ status: string, error?: string, words?: Array<{ word: string, start: number, end: number }> }>}
 */
export async function getTranscribeStatus(jobId) {
  return apiJson(`/api/editor/transcribe/${jobId}`);
}

/**
 * Requests hook suggestions based on the media transcript words.
 * @param {string} mediaId
 * @returns {Promise<{ hooks: string[] }>}
 */
export async function suggestHooks(mediaId) {
  return apiJson('/api/editor/hooks', {
    method: 'POST',
    body: JSON.stringify({ mediaId }),
  });
}

