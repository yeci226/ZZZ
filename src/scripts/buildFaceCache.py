#!/usr/bin/env python3
"""
Detect anime character face positions in wiki paintings and cache the results.
Outputs: src/assets/images/zzz/wiki_paintings/face_cache.json
Format: { "entryId": { "faceY": 0.0~1.0, "faceX": 0.0~1.0 }, ... }
"""

import os, json, sys
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

PAINTINGS_DIR = os.path.join("src", "assets", "images", "zzz", "wiki_paintings")
CACHE_FILE = os.path.join(PAINTINGS_DIR, "face_cache.json")
MODEL_PATH = "/tmp/blaze_face.tflite"
DEFAULT_FACE_Y = 0.35  # fallback if detection fails
DEFAULT_FACE_X = 0.5   # fallback if detection fails

# Download model if needed
if not os.path.exists(MODEL_PATH):
    import urllib.request
    print("Downloading BlazeFace model...")
    urllib.request.urlretrieve(
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        MODEL_PATH
    )

BaseOptions = mp_python.BaseOptions
FaceDetector = mp_vision.FaceDetector
FaceDetectorOptions = mp_vision.FaceDetectorOptions

options = FaceDetectorOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    min_detection_confidence=0.2
)

def detect_face(img_path: str):
    img = cv2.imread(img_path)
    if img is None:
        return None
    h, w = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    with FaceDetector.create_from_options(options) as detector:
        result = detector.detect(mp_img)
    if result.detections:
        best = max(result.detections, key=lambda d: d.categories[0].score)
        bb = best.bounding_box
        face_y = (bb.origin_y + bb.height / 2) / h
        face_x = (bb.origin_x + bb.width / 2) / w
        score = best.categories[0].score
        return round(face_y, 3), round(face_x, 3), round(score, 2)
    return None

# Load existing cache
cache = {}
if os.path.exists(CACHE_FILE):
    with open(CACHE_FILE) as f:
        cache = json.load(f)

entries = sorted(e for e in os.listdir(PAINTINGS_DIR) if not e.endswith('.json'))
failed = []

for entry_id in entries:
    entry_dir = os.path.join(PAINTINGS_DIR, entry_id)
    if not os.path.isdir(entry_dir):
        continue

    # Try highest painting first (2.png > 1.png > 0.png)
    detected = None
    used_file = None
    for idx in ['2', '1', '0']:
        p = os.path.join(entry_dir, f"{idx}.png")
        if os.path.exists(p):
            result = detect_face(p)
            if result is not None:
                face_y, face_x, score = result
                detected = (face_y, face_x)
                used_file = f"{idx}.png (score={score})"
                break

    if detected is not None:
        face_y, face_x = detected
        cache[entry_id] = { "faceY": face_y, "faceX": face_x }
        print(f"  ✓ {entry_id}: faceY={face_y} faceX={face_x} [{used_file}]")
    else:
        cache[entry_id] = { "faceY": DEFAULT_FACE_Y, "faceX": DEFAULT_FACE_X }
        failed.append(entry_id)
        print(f"  ✗ {entry_id}: fallback faceY={DEFAULT_FACE_Y} faceX={DEFAULT_FACE_X}")

# Save cache
with open(CACHE_FILE, 'w') as f:
    json.dump(cache, f, indent=2)

print(f"\nDone. {len(entries) - len(failed)}/{len(entries)} detected.")
if failed:
    print(f"Fallback entries (manual review recommended): {failed}")
print(f"Cache saved to: {CACHE_FILE}")
