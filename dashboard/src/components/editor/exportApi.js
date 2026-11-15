import { apiJson } from '../../lib/api';

/**
 * Starts an export job on the backend.
 * @param {Object} payload
 * @returns {Promise<{ jobId: string }>}
 */
export async function startExport(payload) {
  return apiJson('/api/editor/export', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Gets the status of an export job.
 * @param {string} jobId
 * @returns {Promise<{ status: string, progress: number, url?: string, error?: string, warnings?: string[] }>}
 */
export async function getExportStatus(jobId) {
  return apiJson(`/api/editor/export/${jobId}`);
}

/**
 * Cancels a running or queued export job.
 * @param {string} jobId
 * @returns {Promise<{ ok: boolean }>}
 */
export async function cancelExport(jobId) {
  return apiJson(`/api/editor/export/${jobId}/cancel`, {
    method: 'POST',
  });
}

