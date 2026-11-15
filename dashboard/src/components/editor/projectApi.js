import { apiJson } from '../../lib/api';

/**
 * Saves or updates an editor project.
 * @param {Object} payload - { id?: string, name: string, project: Object, tracks: Array }
 * @returns {Promise<{ id: string, name: string, updatedAt: string }>}
 */
export async function saveProject(payload) {
  return apiJson('/api/editor/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Lists all saved editor projects, newest first.
 * @returns {Promise<Array<{ id: string, name: string, updatedAt: string, duration: number, clipCount: number }>>}
 */
export async function listProjects() {
  return apiJson('/api/editor/projects');
}

/**
 * Retrieves a single editor project with resolved media items.
 * @param {string} id - Project UUID
 * @returns {Promise<Object>}
 */
export async function loadProject(id) {
  return apiJson(`/api/editor/projects/${id}`);
}

/**
 * Deletes an editor project by UUID.
 * @param {string} id - Project UUID
 * @returns {Promise<{ ok: boolean }>}
 */
export async function deleteProject(id) {
  return apiJson(`/api/editor/projects/${id}`, {
    method: 'DELETE',
  });
}

