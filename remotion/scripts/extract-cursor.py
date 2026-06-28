#!/usr/bin/env python3
"""
Extract cursor positions from a macOS screen recording.

Detects the macOS default cursor (white arrow, dark outline, ~25px at retina)
using shape-aware detection with temporal consistency to reject false positives
from page animations, scrolls, and UI transitions.

Usage:
  python3 scripts/extract-cursor.py <video.mov> <output.json> [--fps 10] [--smooth 21]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def extract_frames(video_path: str, out_dir: str, sample_fps: int) -> list[str]:
    pattern = os.path.join(out_dir, "frame_%06d.png")
    subprocess.run(
        ["ffmpeg", "-i", video_path, "-vf", f"fps={sample_fps}", "-q:v", "2", pattern],
        capture_output=True, check=True,
    )
    return sorted(str(f) for f in Path(out_dir).glob("frame_*.png"))


def get_video_info(video_path: str) -> tuple[float, int, int]:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", video_path],
        capture_output=True, text=True, check=True,
    )
    info = json.loads(result.stdout)
    for stream in info["streams"]:
        if stream["codec_type"] == "video":
            fps_parts = stream["r_frame_rate"].split("/")
            fps = int(fps_parts[0]) / int(fps_parts[1])
            return fps, int(stream["width"]), int(stream["height"])
    raise ValueError("No video stream found")


def find_cursor_candidates(gray: np.ndarray, edges: np.ndarray) -> list[tuple[int, int, float]]:
    """
    Find cursor candidates: small clusters of bright pixels near strong edges.
    Returns list of (x, y, score).
    """
    h, w = gray.shape

    white_mask = gray > 235
    edge_mask = edges > 60

    edge_pil = Image.fromarray((edge_mask * 255).astype(np.uint8))
    edge_dilated = np.array(edge_pil.filter(ImageFilter.MaxFilter(5))) > 128

    candidates_mask = white_mask & edge_dilated

    ys, xs = np.where(candidates_mask)
    if len(xs) < 3:
        return []

    grid_size = 30
    bins: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for x, y in zip(xs, ys):
        key = (int(x) // grid_size, int(y) // grid_size)
        bins.setdefault(key, []).append((int(x), int(y)))

    results = []
    for points in bins.values():
        if len(points) < 3 or len(points) > 200:
            continue

        pts = np.array(points)
        cx, cy = int(np.mean(pts[:, 0])), int(np.mean(pts[:, 1]))

        bw = np.max(pts[:, 0]) - np.min(pts[:, 0])
        bh = np.max(pts[:, 1]) - np.min(pts[:, 1])

        # macOS cursor at retina is roughly 15-45px
        if bw < 5 or bw > 50 or bh < 5 or bh > 50:
            continue

        # Cursor is taller than wide (arrow shape)
        aspect = bh / max(bw, 1)
        if aspect < 0.6 or aspect > 3.0:
            continue

        # Score: compact clusters with cursor-like proportions
        area = max(bw * bh, 1)
        density = len(points) / area
        score = density * len(points) * (1.0 if 1.0 < aspect < 2.5 else 0.5)

        results.append((cx, cy, score))

    results.sort(key=lambda r: r[2], reverse=True)
    return results[:10]


def detect_with_motion(
    img: np.ndarray,
    prev_img: np.ndarray | None,
    last_pos: tuple[int, int] | None,
    max_jump: int,
) -> tuple[int, int] | None:
    """
    Detect cursor using shape + motion + temporal consistency.
    """
    gray = np.mean(img, axis=2).astype(np.uint8)
    gray_pil = Image.fromarray(gray)
    edges = np.array(gray_pil.filter(ImageFilter.FIND_EDGES))

    candidates = find_cursor_candidates(gray, edges)
    if not candidates:
        return None

    if prev_img is None and last_pos is None:
        return (candidates[0][0], candidates[0][1])

    # Build motion mask if we have a previous frame
    motion_mask = None
    if prev_img is not None:
        diff = np.abs(img.astype(np.int16) - prev_img.astype(np.int16))
        motion = np.max(diff, axis=2) > 25

        # Separate cursor motion (small local) from page motion (large uniform)
        motion_count = np.sum(motion)
        total_pixels = motion.shape[0] * motion.shape[1]

        # If >15% of pixels changed, it's a page scroll/transition — ignore motion
        if motion_count < total_pixels * 0.15:
            motion_pil = Image.fromarray((motion * 255).astype(np.uint8))
            motion_mask = np.array(motion_pil.filter(ImageFilter.MaxFilter(11))) > 128

    best_score = -1
    best_pos = None

    for cx, cy, shape_score in candidates:
        score = shape_score

        # Bonus for being near detected motion (if motion is localized)
        if motion_mask is not None:
            region_y1 = max(0, cy - 25)
            region_y2 = min(motion_mask.shape[0], cy + 25)
            region_x1 = max(0, cx - 25)
            region_x2 = min(motion_mask.shape[1], cx + 25)
            local_motion = np.sum(motion_mask[region_y1:region_y2, region_x1:region_x2])
            if local_motion > 10:
                score *= 2.0

        # Strong bonus for temporal consistency — cursor doesn't teleport
        if last_pos is not None:
            dist = ((cx - last_pos[0]) ** 2 + (cy - last_pos[1]) ** 2) ** 0.5
            if dist > max_jump:
                score *= 0.05  # Heavily penalise impossible jumps
            elif dist < max_jump * 0.3:
                score *= 3.0  # Strong bonus for staying close
            else:
                score *= 1.5  # Moderate bonus for reasonable movement

        if score > best_score:
            best_score = score
            best_pos = (cx, cy)

    return best_pos


def exponential_smooth(positions: list[dict], alpha: float = 0.15) -> list[dict]:
    """Exponential moving average — much smoother than simple window average."""
    if len(positions) < 2:
        return positions

    smoothed = [positions[0].copy()]
    sx, sy = float(positions[0]["x"]), float(positions[0]["y"])

    for p in positions[1:]:
        sx = alpha * p["x"] + (1 - alpha) * sx
        sy = alpha * p["y"] + (1 - alpha) * sy
        smoothed.append({"frame": p["frame"], "x": int(sx), "y": int(sy)})

    return smoothed


def interpolate_gaps(positions: list[dict], total_frames: int) -> list[dict]:
    if not positions:
        return []

    by_frame = {p["frame"]: p for p in positions}
    known_frames = sorted(by_frame.keys())
    result = []

    for f in range(total_frames):
        if f in by_frame:
            result.append(by_frame[f])
            continue

        prev_f = max((k for k in known_frames if k <= f), default=None)
        next_f = min((k for k in known_frames if k >= f), default=None)

        if prev_f is None and next_f is not None:
            result.append({"frame": f, "x": by_frame[next_f]["x"], "y": by_frame[next_f]["y"]})
        elif next_f is None and prev_f is not None:
            result.append({"frame": f, "x": by_frame[prev_f]["x"], "y": by_frame[prev_f]["y"]})
        elif prev_f is not None and next_f is not None and prev_f != next_f:
            t = (f - prev_f) / (next_f - prev_f)
            x = int(by_frame[prev_f]["x"] + t * (by_frame[next_f]["x"] - by_frame[prev_f]["x"]))
            y = int(by_frame[prev_f]["y"] + t * (by_frame[next_f]["y"] - by_frame[prev_f]["y"]))
            result.append({"frame": f, "x": x, "y": y})
        elif prev_f is not None:
            result.append({"frame": f, "x": by_frame[prev_f]["x"], "y": by_frame[prev_f]["y"]})

    return result


def reject_outliers(positions: list[dict], max_speed: float) -> list[dict]:
    """Remove positions that represent impossible cursor jumps."""
    if len(positions) < 3:
        return positions

    cleaned = [positions[0]]
    for i in range(1, len(positions)):
        prev = cleaned[-1]
        curr = positions[i]
        dt = max(curr["frame"] - prev["frame"], 1)
        dist = ((curr["x"] - prev["x"]) ** 2 + (curr["y"] - prev["y"]) ** 2) ** 0.5
        speed = dist / dt

        if speed <= max_speed:
            cleaned.append(curr)
        # else: skip this point — it's a false detection jump

    return cleaned


def main():
    parser = argparse.ArgumentParser(description="Extract cursor positions from screen recording")
    parser.add_argument("video", help="Path to .mov screen recording")
    parser.add_argument("output", help="Output JSON path")
    parser.add_argument("--sample-fps", type=int, default=10, help="Frame sampling rate (default: 10)")
    parser.add_argument("--target-fps", type=int, default=30, help="Remotion output FPS (default: 30)")
    parser.add_argument("--smooth", type=float, default=0.12, help="EMA alpha — lower = smoother (default: 0.12)")
    parser.add_argument("--max-jump", type=int, default=400, help="Max cursor jump between samples in px (default: 400)")
    args = parser.parse_args()

    video_path = os.path.abspath(args.video)
    if not os.path.exists(video_path):
        print(f"Error: {video_path} not found", file=sys.stderr)
        sys.exit(1)

    print(f"Analyzing: {video_path}")
    source_fps, vid_w, vid_h = get_video_info(video_path)
    print(f"  Source: {vid_w}x{vid_h} @ {source_fps:.1f}fps")

    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"  Extracting frames at {args.sample_fps}fps...")
        frame_paths = extract_frames(video_path, tmpdir, args.sample_fps)
        print(f"  Got {len(frame_paths)} frames")

        raw_positions = []
        prev_img = None
        last_pos: tuple[int, int] | None = None
        detected = 0

        for i, fpath in enumerate(frame_paths):
            img = np.array(Image.open(fpath))
            pos = detect_with_motion(img, prev_img, last_pos, args.max_jump)

            if pos is not None:
                source_time = i / args.sample_fps
                remotion_frame = int(source_time * args.target_fps)
                raw_positions.append({
                    "frame": remotion_frame,
                    "x": pos[0],
                    "y": pos[1],
                })
                last_pos = pos
                detected += 1

            prev_img = img

            if (i + 1) % 10 == 0 or i == len(frame_paths) - 1:
                print(f"  Processed {i + 1}/{len(frame_paths)} frames ({detected} cursors found)")

        if not raw_positions:
            print("Warning: no cursor positions detected. Defaulting to center.", file=sys.stderr)
            duration_sec = len(frame_paths) / args.sample_fps
            total_frames = int(duration_sec * args.target_fps)
            raw_positions = [
                {"frame": 0, "x": vid_w // 2, "y": vid_h // 2},
                {"frame": total_frames - 1, "x": vid_w // 2, "y": vid_h // 2},
            ]

    # Post-process: reject outlier jumps, interpolate, then smooth heavily
    cleaned = reject_outliers(raw_positions, max_speed=args.max_jump / (args.target_fps / args.sample_fps))
    print(f"  After outlier rejection: {len(cleaned)}/{len(raw_positions)} positions kept")

    duration_sec = len(frame_paths) / args.sample_fps
    total_frames = int(duration_sec * args.target_fps)
    interpolated = interpolate_gaps(cleaned, total_frames)

    # Two-pass EMA: forward then backward for zero-lag smoothing
    forward = exponential_smooth(interpolated, args.smooth)
    backward = exponential_smooth(list(reversed(interpolated)), args.smooth)
    backward.reverse()

    final = []
    for f_pt, b_pt in zip(forward, backward):
        final.append({
            "frame": f_pt["frame"],
            "x": (f_pt["x"] + b_pt["x"]) // 2,
            "y": (f_pt["y"] + b_pt["y"]) // 2,
        })

    output = {
        "sourceWidth": vid_w,
        "sourceHeight": vid_h,
        "fps": args.target_fps,
        "totalFrames": total_frames,
        "positions": final,
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nDone! {len(final)} frames written to {args.output}")
    print(f"  Detection rate: {detected}/{len(frame_paths)} ({100*detected/len(frame_paths):.0f}%)")
    print(f"  Smoothing: two-pass EMA (alpha={args.smooth})")


if __name__ == "__main__":
    main()
