#!/usr/bin/env python3
"""Split generated four-pose strips into normalized transparent player frames."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tmp" / "players"
OUTPUT_DIR = ROOT / "public" / "assets" / "players"
CANVAS_SIZE = (430, 620)
MAX_SUBJECT_SIZE = (390, 590)


STRIPS = {
    "rae-sports-strip-alpha.png": ("rae-ready", "rae-aim", "rae-release", "rae-celebrate"),
    "rae-dribble-strip-alpha.png": ("rae-dribble-high", "rae-dribble-low", "rae-dribble-recover", "rae-gather"),
    "zoe-sports-strip-alpha.png": ("zoe-ready", "zoe-aim", "zoe-release", "zoe-celebrate"),
    "zoe-dribble-strip-alpha.png": ("zoe-dribble-high", "zoe-dribble-low", "zoe-dribble-recover", "zoe-gather"),
}


def normalize_frame(frame: Image.Image) -> Image.Image:
    alpha = frame.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 10 else 0).getbbox()
    if bbox is None:
        raise ValueError("Generated sprite cell did not contain an opaque subject.")

    subject = frame.crop(bbox)
    ratio = min(MAX_SUBJECT_SIZE[0] / subject.width, MAX_SUBJECT_SIZE[1] / subject.height)
    resized = subject.resize(
        (max(1, round(subject.width * ratio)), max(1, round(subject.height * ratio))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    x = (CANVAS_SIZE[0] - resized.width) // 2
    y = CANVAS_SIZE[1] - resized.height
    canvas.alpha_composite(resized, (x, y))
    return canvas


def split_strip(source_name: str, frame_names: tuple[str, ...]) -> None:
    strip = Image.open(SOURCE_DIR / source_name).convert("RGBA")
    for index, frame_name in enumerate(frame_names):
        left = round(strip.width * index / len(frame_names))
        right = round(strip.width * (index + 1) / len(frame_names))
        frame = normalize_frame(strip.crop((left, 0, right, strip.height)))
        frame.save(OUTPUT_DIR / f"{frame_name}.png")
        print(f"Wrote {frame_name}.png")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for source_name, frame_names in STRIPS.items():
        split_strip(source_name, frame_names)


if __name__ == "__main__":
    main()
