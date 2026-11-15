/**
 * Presets for visual looks, camera motion, transitions, and shape overlays.
 * Each preset includes its future FFmpeg filter equivalent in comments.
 */

// Looks Presets
export const LOOK_PRESETS = [
  // eq=contrast=1.0:saturation=1.0:brightness=0.0
  {
    id: 'none',
    label: 'None',
    filter: 'none',
    props: {
      brightness: 100, contrast: 100, saturation: 100,
      look: { grayscale: 0, sepia: 0, hueRotate: 0 },
    },
  },
  // eq=saturation=1.4:contrast=1.1
  {
    id: 'vivid',
    label: 'Vivid',
    filter: 'contrast(110%) saturate(140%)',
    props: {
      brightness: 100, contrast: 110, saturation: 140,
      look: { grayscale: 0, sepia: 0, hueRotate: 0 },
    },
  },
  // hue=s=0,eq=contrast=1.1
  {
    id: 'bw',
    label: 'B&W',
    filter: 'grayscale(100%) contrast(110%)',
    props: {
      brightness: 100, contrast: 110, saturation: 100,
      look: { grayscale: 100, sepia: 0, hueRotate: 0 },
    },
  },
  // colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=saturation=1.15:brightness=0.05
  {
    id: 'warm',
    label: 'Warm',
    filter: 'sepia(25%) saturate(115%) brightness(105%) hue-rotate(-10deg)',
    props: {
      brightness: 105, contrast: 100, saturation: 115,
      look: { grayscale: 0, sepia: 25, hueRotate: -10 },
    },
  },
  // hue=h=15:s=1.05
  {
    id: 'cool',
    label: 'Cool',
    filter: 'hue-rotate(15deg) saturate(105%)',
    props: {
      brightness: 100, contrast: 100, saturation: 105,
      look: { grayscale: 0, sepia: 0, hueRotate: 15 },
    },
  },
  // colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=0.9:saturation=0.8:brightness=0.05
  {
    id: 'vintage',
    label: 'Vintage',
    filter: 'sepia(60%) contrast(90%) saturate(80%) brightness(105%)',
    props: {
      brightness: 105, contrast: 90, saturation: 80,
      look: { grayscale: 0, sepia: 60, hueRotate: 0 },
    },
  },
  // eq=contrast=1.2:saturation=0.9:brightness=-0.05
  {
    id: 'cinematic',
    label: 'Cinematic',
    filter: 'contrast(120%) saturate(90%) brightness(95%)',
    props: {
      brightness: 95, contrast: 120, saturation: 90,
      look: { grayscale: 0, sepia: 0, hueRotate: 0 },
    },
  },
];

// Motion Presets
export const MOTION_PRESETS = [
  // null
  { id: 'none', label: 'None', type: 'none', amount: 20 },
  // zoompan=z='min(zoom+0.0015,1.2)':d=125
  { id: 'zoomIn', label: 'Zoom in', type: 'zoomIn', amount: 20 },
  // zoompan=z='max(1.2-0.0015*on,1.0)':d=125
  { id: 'zoomOut', label: 'Zoom out', type: 'zoomOut', amount: 20 },
  // UNVERIFIED
  { id: 'punch', label: 'Punch-in', type: 'punch', amount: 15 },
];

// Transition Presets
export const TRANSITION_PRESETS = [
  // null
  { id: 'none', label: 'None' },
  // xfade=transition=fade
  { id: 'fade', label: 'Fade' },
  // xfade=transition=slideleft
  { id: 'slideLeft', label: 'Slide left' },
  // xfade=transition=slideright
  { id: 'slideRight', label: 'Slide right' },
  // xfade=transition=slideup
  { id: 'slideUp', label: 'Slide up' },
  // xfade=transition=zoomin
  { id: 'zoom', label: 'Zoom' },
];

// Shape Presets
export const SHAPE_PRESETS = [
  // drawbox=w=400:h=400:color=white@1.0:t=fill
  {
    id: 'rect',
    label: 'Rectangle',
    props: {
      shape: {
        kind: 'rect', width: 400, height: 400, fill: '#FFFFFF',
        fillOpacity: 100, radius: 0, stroke: { enabled: false, color: '#000000', width: 4 },
      },
    },
  },
  // UNVERIFIED
  {
    id: 'circle',
    label: 'Circle',
    props: {
      shape: {
        kind: 'circle', width: 400, height: 400, fill: '#FFFFFF',
        fillOpacity: 100, radius: 0, stroke: { enabled: false, color: '#000000', width: 4 },
      },
    },
  },
  // drawbox=w=600:h=8:color=white@1.0:t=fill
  {
    id: 'line',
    label: 'Line',
    props: {
      shape: {
        kind: 'line', width: 600, height: 8, fill: '#FFFFFF',
        fillOpacity: 100, radius: 0, stroke: { enabled: false, color: '#000000', width: 4 },
      },
    },
  },
  // UNVERIFIED
  {
    id: 'progress',
    label: 'Progress bar',
    props: {
      shape: {
        kind: 'progress', width: 1080, height: 12, fill: '#FFFFFF',
        fillOpacity: 100, radius: 0, trackColor: '#FFFFFF4D',
        stroke: { enabled: false, color: '#000000', width: 4 },
      },
    },
  },
];

