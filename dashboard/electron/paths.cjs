const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const isDev = !app.isPackaged;

function getAppRoot() {
  if (isDev) {
    // In dev: dashboard/electron -> root repo
    return path.resolve(__dirname, '..', '..');
  }
  // In packaged production: resources directory
  return process.resourcesPath;
}

function getPythonExecutable() {
  const root = getAppRoot();
  const isWin = process.platform === 'win32';

  if (isDev) {
    // Check virtualenv in project root first
    const venvPython = isWin
      ? path.join(root, '.venv', 'Scripts', 'python.exe')
      : path.join(root, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPython)) return venvPython;

    // Fallback to system python
    return isWin ? 'python.exe' : 'python3';
  }

  // Production packaged sidecar
  const sidecarName = isWin ? 'shortly-backend.exe' : 'shortly-backend';
  return path.join(root, 'sidecar', sidecarName);
}

function getBinariesDir() {
  const root = getAppRoot();
  return path.join(root, 'bin');
}

module.exports = {
  isDev,
  getAppRoot,
  getPythonExecutable,
  getBinariesDir,
};
