"""Find the webcam inset in a screen recording, and frame the two apart.

The case: one source, the whole screen (a game, a desktop, an editor) with the
person composited into a corner. It is how OBS records and how every stream VOD
looks, and it is the case screencast_layout gets wrong. There the speaker band
is a large crop taken AROUND the face, which on a full-screen source means the
band is mostly more screen: measured on an Excel walkthrough, the output showed
the same spreadsheet twice, once whole and once enlarged.

What this needs instead is the inset's own rectangle, so the two bands can hold
genuinely different things — screen above, person below.

Finding it exactly is harder than it looks. The inset is not always a rectangle
(circles and clipped polygons are common), it has no reliable border, and on
gameplay the background moves as much as the person does, which rules out
temporal-variance tricks. What IS reliable is that the inset is anchored to a
corner and that a person detector fires inside it. So: locate the person, decide
which corner they are nearest, and grow a box from that corner until it covers
them with margin.
"""
import os

from ffmpeg_utils import blurred_backdrop

CORNER_MARGIN = 0.20   # a subject this far from an edge (as a fraction of the
                       # frame) still counts as anchored to it

# An inset subject is SMALL and OFF-CENTRE; a presenter filling the shot is
# neither. Requiring the detection to actually touch two edges was tried first
# and rejected: YOLO returns an upper-body box that stops at the chest, so a
# webcam pinned to the right edge measured 18% clear of the bottom and got
# thrown out. Measured on four real clips, these two properties separate the
# cases where "touching a corner" did not.
MAX_SUBJECT_HEIGHT = 0.35   # fraction of frame height

# Horizontal offset from centre, as a fraction of frame width. HORIZONTAL
# specifically: a composited camera is pinned to the left or right side, while a
# talking head is centred left-to-right even when their face sits high in the
# shot. Accepting offset on either axis let four talking heads through, all of
# them with a face near the top edge. Measured on those nine candidates the two
# groups do not overlap: real insets sat 0.37-0.43 from centre, the talking
# heads 0.01-0.12.
MIN_OFFSET = 0.18

# How much bigger than the detected head/upper body the inset is assumed to be.
# A webcam frames head and shoulders, and detectors return the head or the upper
# body, so the box has to grow to reach the inset's real edges.
INSET_PADDING = float(os.environ.get("INSET_PADDING", "1.45"))

# Guard rails as a fraction of frame height. Below the floor there is nothing
# worth showing; above the ceiling it stopped being an inset and the layout
# should not be used at all.
MIN_INSET_HEIGHT = 0.10
MAX_INSET_HEIGHT = 0.38

# An inset is pinned to the same pixels for the whole recording; a presenter
# walks about. Spread of the detected centres, as a fraction of frame width,
# above which this is a person in a room rather than a composited camera.
# Measured on the two false positives this rule was written for: a real inset
# moved 3-11px across samples, a presenter 316px.
MAX_CENTRE_SPREAD = 0.05

# Room kept above the detection, as a fraction of its height (see inset_box).
FACE_HEADROOM = 0.35
BODY_HEADROOM = 0.10

# A webcam window frames head and shoulders: the face is about a third of its
# width. Used for overlays that float mid-screen, where inset_box's corner
# anchoring does not apply and pushed the crop up onto the ceiling, and to grow
# a face detection to the inset in a corner.
OVERLAY_FACE_WIDTHS = 3.0


def nearest_corner(box, frame_w, frame_h):
    """Which corner the subject sits in: (horizontal, vertical) as strings.

    Returns e.g. ("left", "bottom"). A subject in the middle of the frame is
    reported by its nearest edges anyway; callers use `is_cornered` to reject.
    """
    cx = box[0] + box[2] / 2.0
    cy = box[1] + box[3] / 2.0
    return ("left" if cx < frame_w / 2 else "right",
            "top" if cy < frame_h / 2 else "bottom")


def is_cornered(box, frame_w, frame_h, margin=CORNER_MARGIN, relaxed=False):
    """True when the subject looks like a webcam inset rather than the shot.

    Small and off-centre, not "touches two edges": see MAX_SUBJECT_HEIGHT.
    relaxed=True enables streamer-mode detection (allowing centered or larger facecams).
    """
    x, y, w, h = box
    max_h = frame_h * (0.60 if relaxed else MAX_SUBJECT_HEIGHT)
    if h > max_h:
        return False

    cx = (x + w / 2.0) / frame_w
    if relaxed:
        off_centre = abs(cx - 0.5) >= 0.04
        near_edge = (x <= frame_w * 0.40 or (x + w) >= frame_w * 0.60
                     or y <= frame_h * 0.40 or (y + h) >= frame_h * 0.60)
        return off_centre or near_edge

    off_centre = abs(cx - 0.5) >= MIN_OFFSET

    near_edge = (x <= frame_w * margin or (x + w) >= frame_w * (1 - margin)
                 or y <= frame_h * margin or (y + h) >= frame_h * (1 - margin))
    return off_centre and near_edge


INSET_ASPECT = 16 / 9.0


def _place(x, y, w, h, new_w, new_h, frame_w, frame_h, horizontal, vertical):
    """Top-left corner of a new_w x new_h box grown around the detection."""
    # Anchor: keep the edge the subject is already near, grow the other way.
    if horizontal == "left":
        new_x = max(0, min(x - (new_w - w) / 2.0, frame_w - new_w))
        if x <= frame_w * CORNER_MARGIN:
            new_x = 0
    else:
        new_x = max(0, min(x + w + (new_w - w) / 2.0 - new_w, frame_w - new_w))
        if (x + w) >= frame_w * (1 - CORNER_MARGIN):
            new_x = frame_w - new_w

    # Vertical growth is biased upwards: detectors return the head or the chest,
    # and a portrait needs headroom, not more torso. Splitting the growth evenly
    # cropped the top of the head off on real clips.
    grow = new_h - h
    if vertical == "top":
        new_y = max(0, min(y - grow * 0.6, frame_h - new_h))
        if y <= frame_h * CORNER_MARGIN:
            new_y = 0
    else:
        # Pin to the bottom edge: the inset is there, and the detection sits
        # somewhere inside it rather than at its top.
        new_y = frame_h - new_h
        if (y + h) < frame_h * (1 - CORNER_MARGIN):
            new_y = max(0, min(y - grow * 0.6, frame_h - new_h))
    return new_x, new_y


def inset_box(box, frame_w, frame_h, padding=None, face=False):
    """Estimated inset rectangle (x, y, w, h) around a detected subject.

    Grown from the corner the subject is anchored to, so the box hugs the same
    edges the inset does instead of floating around the face.

    The height comes from assuming a 16:9 inset rather than from scaling the
    detection, because the detection is often a torso: YOLO returned a 246x86
    box for a webcam whose real rectangle was about 325x180, and padding that
    shape upwards still cut the head off. Deriving the height from the width
    and pinning the result to the corner reaches the top of the inset instead.

    ``face`` says the detection is a face box, not YOLO's upper body. A face is
    a third of a webcam's width (OVERLAY_FACE_WIDTHS), not 1/1.45 of it: grown
    by the body padding, a 128px face on a 720p Excel walkthrough gave a
    181px box pinned to the bottom edge that started 41px below the top of
    the face, and the enlarged band showed a forehead-less face (17-oct-2026).
    """
    if padding is None:
        padding = OVERLAY_FACE_WIDTHS if face else INSET_PADDING
    x, y, w, h = box
    horizontal, vertical = nearest_corner(box, frame_w, frame_h)

    new_w = min(frame_w, w * padding)
    # A face box is square, so tripling its height too would make a portrait
    # crop; the 16:9 assumption alone sets the height.
    new_h = new_w / INSET_ASPECT if face else max(h * padding, new_w / INSET_ASPECT)
    new_h = min(frame_h, new_h)
    # Never start below the head. A face box stops at the brows, so the hair
    # needs about a third of its height on top; YOLO's box already starts at
    # the top of the head.
    top_limit = max(0.0, y - h * (FACE_HEADROOM if face else BODY_HEADROOM))

    new_x, new_y = _place(x, y, w, h, new_w, new_h, frame_w, frame_h,
                          horizontal, vertical)
    if new_y > top_limit:
        if new_y + new_h >= frame_h - 1:
            # Pinned to the bottom edge: grow upwards (and keep 16:9) rather
            # than slide off the edge the inset sits on.
            new_h = frame_h - top_limit
            new_w = min(frame_w, max(new_w, new_h * INSET_ASPECT))
            new_x, _ = _place(x, y, w, h, new_w, new_h, frame_w, frame_h,
                              horizontal, vertical)
        new_y = top_limit

    return (int(round(new_x)), int(round(new_y)),
            int(round(new_w)), int(round(new_h)))


def usable(box, frame_h, min_ratio=MIN_INSET_HEIGHT, max_ratio=MAX_INSET_HEIGHT):
    """Whether an inset of this size is worth building a layout around."""
    return min_ratio * frame_h <= box[3] <= max_ratio * frame_h


def detect(video_path, samples=10):
    """Median inset rectangle across sampled frames, or None.

    None means "no usable inset here", which callers must treat as "use another
    layout" rather than as an error.
    """
    import cv2
    import numpy as np
    import main as m
    import screencast_layout

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if total <= 0 or not frame_w:
        cap.release()
        return None

    boxes = []
    try:
        for i in range(samples):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(i * total / samples))
            ok, frame = cap.read()
            if not ok:
                continue
            # Faces first, body as fallback: a webcam inset is small, and on a
            # 1080p source the face inside it is often too few pixels for
            # BlazeFace even at full resolution, while YOLO still finds the
            # person.
            faces = screencast_layout.detect_faces_full_res(frame)
            if faces:
                box = max(faces, key=lambda c: c['score'])['box']
            else:
                box = m.detect_person_yolo(frame)
            if not box:
                continue
            if not is_cornered(box, frame_w, frame_h):
                continue
            boxes.append(inset_box(box, frame_w, frame_h, face=bool(faces)))
    finally:
        cap.release()

    if len(boxes) < max(3, samples // 3):
        return None

    return stable_box(boxes, frame_w, frame_h)


def stable_box(boxes, frame_w, frame_h, min_agree=3, relaxed=False):
    """Median of the inset boxes that agree with each other, or None."""
    import numpy as np

    if not boxes:
        return None

    arr = np.array(boxes, dtype=float)

    # Stability gate. Without it, a presenter standing in front of a screen and
    # an ordinary talking head both come back as "insets" and the layout puts a
    # zoom of someone's face under a copy of the same shot.
    centres_x = arr[:, 0] + arr[:, 2] / 2.0
    centres_y = arr[:, 1] + arr[:, 3] / 2.0
    mid_x, mid_y = np.median(centres_x), np.median(centres_y)
    tolerance = frame_w * (0.18 if relaxed else MAX_CENTRE_SPREAD)
    close = ((np.abs(centres_x - mid_x) <= tolerance)
             & (np.abs(centres_y - mid_y) <= tolerance))
    threshold = 2 if relaxed else max(min_agree, 0.6 * len(boxes))
    if close.sum() < threshold:
        if not relaxed:
            return None
        arr_to_use = arr
    else:
        arr_to_use = arr[close]

    median = tuple(int(v) for v in np.median(arr_to_use, axis=0))
    min_h = 0.06 if relaxed else MIN_INSET_HEIGHT
    max_h = 0.65 if relaxed else MAX_INSET_HEIGHT
    if not usable(median, frame_h, min_ratio=min_h, max_ratio=max_h):
        return None
    return median


def overlay_box(box, frame_w, frame_h, widen=OVERLAY_FACE_WIDTHS):
    """A 16:9 box centred on a detected face (or upper body), clamped."""
    x, y, w, h = box
    new_w = min(frame_w, w * widen)
    new_h = min(frame_h, new_w / INSET_ASPECT)
    cx, cy = x + w / 2.0, y + h / 2.0
    new_x = max(0, min(cx - new_w / 2.0, frame_w - new_w))
    new_y = max(0, min(cy - new_h * 0.45, frame_h - new_h))
    return (int(round(new_x)), int(round(new_y)),
            int(round(new_w)), int(round(new_h)))


def detect_in_scene(video_path, start_f, end_f, samples=5):
    """A presenter window laid over the screen in this one scene, or None.

    ``detect`` is the clip-wide check and insists on a corner, because nothing
    upstream of it says the frame is a screen. Here the shot check already did
    (this runs only on scenes Gemini called "screen"), so a small face that
    stays put is the presenter's camera wherever it floats: a QuickTime or Loom
    window over a document sits mid-left, not in a corner, and the screen-only
    layout shrank both into a 1080px-wide strip (Ty Myers tutorial,
    6-oct-2026). What still rules a subject out: being big (that is the shot,
    not an overlay) or moving between samples.

    The caller only asks where the shot check said a live presenter camera is
    laid over the screen (presenter_cam). That gate is what keeps game
    characters, photos on slides and cover art out; the YOLO body fallback
    stays because BlazeFace misses the webcam face in about half the samples
    of a dim or small window (ticker_VUqnFqEHy2E), and without it a real
    presenter window is lost.
    """
    import cv2
    import numpy as np
    import main as m
    import screencast_layout

    if end_f - 1 < start_f:
        return None
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    boxes = []
    try:
        for f_idx in np.linspace(start_f, end_f - 1, samples):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(f_idx)))
            ok, frame = cap.read()
            if not ok:
                continue
            faces = screencast_layout.detect_faces_full_res(frame)
            if faces:
                box = max(faces, key=lambda c: c['score'])['box']
                widen = OVERLAY_FACE_WIDTHS
            else:
                box = m.detect_person_yolo(frame)
                widen = INSET_PADDING
            if not box or box[3] > frame_h * MAX_SUBJECT_HEIGHT:
                continue
            boxes.append(overlay_box(box, frame_w, frame_h, widen))
    finally:
        cap.release()
    need = samples // 2 + 1
    if len(boxes) < need:
        return None
    return stable_box(boxes, frame_w, frame_h, min_agree=need)


def _centre_inside(det, box, slack):
    cx = det[0] + det[2] / 2.0
    cy = det[1] + det[3] / 2.0
    x, y, w, h = box
    return (x - slack <= cx <= x + w + slack) and (y - slack <= cy <= y + h + slack)


def present_in_scene(video_path, box, start_f, end_f, samples=3):
    """Whether the webcam really sits in ``box`` during this scene.

    ``detect`` finds the box once per clip, from samples spread over every
    scene, and a clip cut from a tutorial mixes shots: the bubble is in the
    corner during the screen recording and gone in the editor shot next to it.
    Before this check every screen scene of a clip with an inset anywhere got
    the INSET layout, and on a scene without the camera the bottom band was an
    enlarged crop of a toolbar (measured on a Canva + QuickTime tutorial,
    6-oct-2026). A face or a person whose centre falls in the box in most
    samples is the answer.
    """
    import cv2
    import numpy as np
    import main as m
    import screencast_layout

    if end_f - 1 < start_f:
        return False
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return False
    slack = max(box[2], box[3]) * 0.1
    hits = 0
    try:
        for f_idx in np.linspace(start_f, end_f - 1, samples):
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(f_idx)))
            ok, frame = cap.read()
            if not ok:
                continue
            dets = [c['box'] for c in screencast_layout.detect_faces_full_res(frame)]
            if not any(_centre_inside(d, box, slack) for d in dets):
                person = m.detect_person_yolo(frame)
                dets = [person] if person else []
            if any(_centre_inside(d, box, slack) for d in dets):
                hits += 1
    finally:
        cap.release()
    return hits * 2 > samples


MAX_CAMERA_RATIO = 0.40


def inset_filtergraph(orig_w, orig_h, out_w, out_h, box, camera_ratio=None):
    """Screen on top at full width, the webcam inset below.

    The screen keeps its whole width, which is the point: a game HUD or a
    desktop puts what matters at the edges. The inset is scaled up so the person
    reads at a size the source never gave them.

    The camera band takes its height from the INSET'S OWN aspect ratio rather
    than a fixed share of the frame. A fixed share was tried first and stretched
    every face sideways: a 16:9 inset forced into a 2:1 band is a 12% horizontal
    stretch, and it is immediately visible on a face.
    """
    box_w = max(2, box[2])
    box_h = max(2, box[3])

    if camera_ratio is not None:
        cam_h = int(out_h * camera_ratio)
    else:
        cam_h = int(round(out_w * box_h / float(box_w)))
    cam_h = min(cam_h, int(out_h * MAX_CAMERA_RATIO))
    cam_h -= cam_h % 2

    screen_h = int(round(out_w * orig_h / float(orig_w)))
    screen_h -= screen_h % 2
    screen_h = max(2, min(screen_h, out_h - cam_h - 2))

    # Widen (or heighten) the crop to the band's aspect so the scale below is
    # uniform. Clamped to the frame, so an inset hard against an edge simply
    # keeps whatever it can reach.
    target_aspect = out_w / float(cam_h)
    x, y, w, h = box
    if w / float(h) < target_aspect:
        want_w = min(orig_w, int(round(h * target_aspect)))
        x = int(round(x + w / 2.0 - want_w / 2.0))
        w = want_w
    else:
        want_h = min(orig_h, int(round(w / target_aspect)))
        y = int(round(y + h / 2.0 - want_h / 2.0))
        h = want_h
    x = max(0, min(x, orig_w - w))
    y = max(0, min(y, orig_h - h))

    w -= w % 2
    h -= h % 2
    x -= x % 2
    y -= y % 2

    filler_h = out_h - screen_h - cam_h

    return (
        f"[0:v]split=3[bga][sa][ca];"
        # Blurred backdrop so the leftover strip is not a black bar. Scaled by
        # HEIGHT: scaling a 16:9 source to 1080 wide gives 608 tall, and there
        # is no 1920-tall crop to take out of that.
        f"[bga]{blurred_backdrop(out_w, out_h, 14)}[bg];"
        f"[sa]scale={out_w}:{screen_h}[screen];"
        f"[ca]crop=w={w}:h={h}:x={x}:y={y},scale={out_w}:{cam_h}[cam];"
        f"[bg][screen]overlay=x=0:y={filler_h // 2}[withscreen];"
        f"[withscreen][cam]overlay=x=0:y={filler_h // 2 + screen_h},"
        f"setsar=1[v]"
    )


def detect_streamer_webcam(video_path, samples=12, webcam_mode="auto", webcam_box=None):
    """Detect or resolve the streamer facecam box without grabbing center game characters.

    Modes:
    - ``custom``: Use the user-drawn normalized ``webcam_box`` ({x, y, w, h} in 0..1) directly
      with ZERO ML/YOLO inference (100% locked to the tracing box).
    - ``top_left`` | ``top_right`` | ``bottom_left`` | ``bottom_right``: Inspect ONLY that
      corner quadrant to tighten onto the webcam; falls back to a clean 16:9 crop of that
      exact corner if no face/person is detected.
    - ``auto``: Strictly inspects ONLY the 4 outer corner ROIs (excluding the central gameplay
      area where game characters live), preferring MediaPipe real faces and enforcing strict
      temporal stability across frames. Returns ``None`` if no stationary corner webcam exists
      so callers can fall back cleanly to blurred-center framing.
    - ``none``: Returns ``None`` immediately (disables webcam split).
    """
    import cv2

    mode = normalize_webcam_mode(webcam_mode)
    if mode == "none":
        return None

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    if total <= 0 or not frame_w or not frame_h:
        return None

    return resolve_webcam_box(
        video_path,
        frame_w,
        frame_h,
        webcam_mode=mode,
        webcam_box=webcam_box,
        samples=samples,
    )


VALID_WEBCAM_MODES = (
    "auto",
    "top_left",
    "top_right",
    "bottom_left",
    "bottom_right",
    "custom",
    "none",
)

CORNER_MODES = ("top_left", "top_right", "bottom_left", "bottom_right")

# Outer corner search regions as (x_frac, y_frac, w_frac, h_frac).
# Physically excludes the central gameplay band where game characters stand.
CORNER_ROIS = {
    "top_left": (0.00, 0.00, 0.38, 0.44),
    "top_right": (0.62, 0.00, 0.38, 0.44),
    "bottom_left": (0.00, 0.56, 0.38, 0.44),
    "bottom_right": (0.62, 0.56, 0.38, 0.44),
}


def normalize_webcam_mode(mode) -> str:
    val = str(mode or "auto").strip().lower()
    return val if val in VALID_WEBCAM_MODES else "auto"


def parse_webcam_box(raw):
    """Validate and clamp a normalized {x, y, w, h} webcam box in [0, 1]."""
    if raw is None:
        return None
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return None
        try:
            import json
            raw = json.loads(raw)
        except Exception:
            return None
    if not isinstance(raw, dict):
        return None
    try:
        x = float(raw["x"])
        y = float(raw["y"])
        w = float(raw["w"])
        h = float(raw["h"])
    except (KeyError, TypeError, ValueError):
        return None
    if not all(v == v for v in (x, y, w, h)):  # NaN guard
        return None
    x = max(0.0, min(0.95, x))
    y = max(0.0, min(0.95, y))
    w = max(0.05, min(1.0 - x, w))
    h = max(0.05, min(1.0 - y, h))
    return {
        "x": round(x, 4),
        "y": round(y, 4),
        "w": round(w, 4),
        "h": round(h, 4),
    }


def mirror_webcam_config(webcam_mode, webcam_box):
    """Horizontally mirror a webcam corner or normalized custom box (for pre-mirrored video)."""
    mode = normalize_webcam_mode(webcam_mode)
    swap = {
        "top_left": "top_right",
        "top_right": "top_left",
        "bottom_left": "bottom_right",
        "bottom_right": "bottom_left",
    }
    mirrored_mode = swap.get(mode, mode)
    box = parse_webcam_box(webcam_box)
    mirrored_box = None
    if box is not None:
        mirrored_box = parse_webcam_box({
            "x": max(0.0, 1.0 - (box["x"] + box["w"])),
            "y": box["y"],
            "w": box["w"],
            "h": box["h"],
        })
    return mirrored_mode, mirrored_box


def normalized_to_pixel_box(norm_box, frame_w, frame_h):
    """Convert normalized {x, y, w, h} to clamped even pixel (x, y, w, h)."""
    box = parse_webcam_box(norm_box)
    if not box or frame_w <= 0 or frame_h <= 0:
        return None
    px = int(round(box["x"] * frame_w))
    py = int(round(box["y"] * frame_h))
    pw = max(16, int(round(box["w"] * frame_w)))
    ph = max(16, int(round(box["h"] * frame_h)))
    px = max(0, min(px, frame_w - pw))
    py = max(0, min(py, frame_h - ph))
    pw = min(pw, frame_w - px)
    ph = min(ph, frame_h - py)
    return (px, py, pw, ph)


def default_corner_box(corner, frame_w, frame_h, width_frac=0.30):
    """Default 16:9 webcam crop pinned to one of the 4 corners."""
    bw = max(32, int(round(frame_w * width_frac)))
    bh = max(32, min(frame_h, int(round(bw / INSET_ASPECT))))
    if corner == "top_left":
        return (0, 0, bw, bh)
    if corner == "bottom_left":
        return (0, max(0, frame_h - bh), bw, bh)
    if corner == "bottom_right":
        return (max(0, frame_w - bw), max(0, frame_h - bh), bw, bh)
    return (max(0, frame_w - bw), 0, bw, bh)  # top_right


def _detect_in_corner_roi(frame, corner, frame_w, frame_h):
    """Run face (preferred) then YOLO person detection strictly inside one corner ROI.

    Returns ``(full_frame_box, is_face)`` or ``(None, False)``.
    """
    import main as m
    import screencast_layout

    xf, yf, wf, hf = CORNER_ROIS[corner]
    rx = int(round(xf * frame_w))
    ry = int(round(yf * frame_h))
    rw = max(16, min(frame_w - rx, int(round(wf * frame_w))))
    rh = max(16, min(frame_h - ry, int(round(hf * frame_h))))
    roi = frame[ry:ry + rh, rx:rx + rw]
    if roi.size == 0:
        return None, False

    faces = screencast_layout.detect_faces_full_res(roi)
    if not faces:
        try:
            candidates = m.detect_face_candidates(roi)
            if candidates:
                faces = candidates
        except Exception:
            faces = []

    if faces:
        best = max(faces, key=lambda c: c.get("score", 0) if isinstance(c, dict) else 1)
        fbox = best.get("box") if isinstance(best, dict) else best
        if fbox and len(fbox) == 4:
            bx, by, bw, bh = fbox
            return (rx + int(bx), ry + int(by), int(bw), int(bh)), True

    try:
        pbox = m.detect_person_yolo(roi)
    except Exception:
        pbox = None
    if pbox and len(pbox) == 4:
        bx, by, bw, bh = pbox
        return (rx + int(bx), ry + int(by), int(bw), int(bh)), False

    return None, False


def resolve_webcam_box(video_path, frame_w, frame_h, webcam_mode="auto", webcam_box=None, samples=12):
    """Resolve the exact streamer webcam pixel box (x, y, w, h), or None if no cam."""
    mode = normalize_webcam_mode(webcam_mode)
    if mode == "none":
        return None

    if mode == "custom":
        px_box = normalized_to_pixel_box(webcam_box, frame_w, frame_h)
        if px_box:
            return px_box
        # Invalid/empty custom box -> fall through to auto 4-corner check
        mode = "auto"

    import cv2
    import numpy as np

    corners_to_check = (mode,) if mode in CORNER_MODES else CORNER_MODES

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return default_corner_box(mode, frame_w, frame_h) if mode in CORNER_MODES else None
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        cap.release()
        return default_corner_box(mode, frame_w, frame_h) if mode in CORNER_MODES else None

    corner_hits = {c: [] for c in corners_to_check}
    corner_face_counts = {c: 0 for c in corners_to_check}

    try:
        sample_indices = np.linspace(0, max(0, total - 1), samples, dtype=int)
        for f_idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(f_idx))
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            for c in corners_to_check:
                box, is_face = _detect_in_corner_roi(frame, c, frame_w, frame_h)
                if not box:
                    continue
                grown = inset_box(box, frame_w, frame_h, face=is_face)
                corner_hits[c].append(grown)
                if is_face:
                    corner_face_counts[c] += 1
    finally:
        cap.release()

    min_needed = max(3, samples // 3)
    best_corner = None
    best_score = -1.0
    best_box = None

    for c in corners_to_check:
        hits = corner_hits[c]
        if len(hits) < min_needed:
            continue
        med = stable_box(hits, frame_w, frame_h, min_agree=min_needed, relaxed=False)
        if not med:
            continue
        face_hits = corner_face_counts[c]
        body_hits = len(hits) - face_hits
        score = face_hits * 2.5 + body_hits * 1.0
        if score > best_score:
            best_score = score
            best_corner = c
            best_box = med

    if best_box is not None:
        return best_box

    # If the user explicitly pinned a corner, ALWAYS honor that corner even when
    # lighting/angle prevented face/YOLO detection.
    if mode in CORNER_MODES:
        return default_corner_box(mode, frame_w, frame_h)

    # Auto mode found no stationary webcam in any of the 4 corners -> return None
    # so callers avoid zooming in on a game character or empty HUD corner.
    return None


def streamer_split_filtergraph(orig_w, orig_h, out_w, out_h, box=None, orientation="streamer_top", divider=True):
    """Dual-split 9:16 layout (e.g. 1080x1920):
    - Top half: 1080x960
    - Bottom half: 1080x960
    - orientation="streamer_top": Streamer on Top, Gameplay on Bottom (Gaming Shorts style).
    - orientation="streamer_bottom": Gameplay on Top, Streamer on Bottom (Reaction/Tutorial style).
    - divider=True: renders a crisp 3px divider seam line at the border (y=959).
    """
    half_h = out_h // 2
    half_h -= half_h % 2
    aspect = out_w / float(half_h)  # 1080 / 960 = 1.125

    # 1. Gameplay crop (center 1.125 aspect ratio crop of source):
    game_h = orig_h
    game_w = int(round(game_h * aspect))
    if game_w > orig_w:
        game_w = orig_w
        game_h = int(round(game_w / aspect))
    game_w -= game_w % 2
    game_h -= game_h % 2
    game_x = max(0, min(orig_w - game_w, int(round((orig_w - game_w) / 2.0))))
    game_x -= game_x % 2
    game_y = max(0, min(orig_h - game_h, int(round((orig_h - game_h) / 2.0))))
    game_y -= game_y % 2

    # 2. Streamer webcam crop:
    if box:
        bx, by, bw, bh = box
    else:
        bw = int(round(orig_w * 0.35))
        bh = int(round(bw / INSET_ASPECT))
        bx = orig_w - bw
        by = 0

    bcx = bx + bw / 2.0
    bcy = by + bh / 2.0

    if bw / float(max(1, bh)) >= aspect:
        cam_crop_h = bh
        cam_crop_w = int(round(cam_crop_h * aspect))
        cam_crop_x = int(round(bcx - cam_crop_w / 2.0))
        cam_crop_y = by
    else:
        cam_crop_w = bw
        cam_crop_h = int(round(cam_crop_w / aspect))
        cam_crop_x = bx
        cam_crop_y = int(round(bcy - cam_crop_h * 0.42))

    cam_crop_x = max(0, min(cam_crop_x, orig_w - cam_crop_w))
    cam_crop_y = max(0, min(cam_crop_y, orig_h - cam_crop_h))
    cam_crop_w -= cam_crop_w % 2
    cam_crop_h -= cam_crop_h % 2
    cam_crop_x -= cam_crop_x % 2
    cam_crop_y -= cam_crop_y % 2

    game_layer = f"crop=w={game_w}:h={game_h}:x={game_x}:y={game_y},scale={out_w}:{half_h}"
    cam_layer = f"crop=w={cam_crop_w}:h={cam_crop_h}:x={cam_crop_x}:y={cam_crop_y},scale={out_w}:{half_h}"

    if orientation == "streamer_bottom":
        top_filter = game_layer
        bot_filter = cam_layer
    else:
        top_filter = cam_layer
        bot_filter = game_layer

    seam_y = half_h - 1
    divider_filter = f",drawbox=x=0:y={seam_y}:w={out_w}:h=3:color=black@0.95:t=fill" if divider else ""

    return (
        f"[0:v]split=2[ta][ba];"
        f"[ta]{top_filter}[top];"
        f"[ba]{bot_filter}[bot];"
        f"[top][bot]vstack=inputs=2{divider_filter},setsar=1[v]"
    )
