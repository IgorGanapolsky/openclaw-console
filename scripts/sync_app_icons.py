#!/usr/bin/env python3
"""Synchronize Android launcher icons from the canonical iOS marketing icon."""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
from pathlib import Path
from typing import Iterable

try:
    from PIL import Image, ImageDraw
except ImportError as exc:
    raise SystemExit(
        "Pillow is required. Install it with `python3 -m pip install pillow`."
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
IOS_APP_ICON_DIR = ROOT / "ios/OpenClawConsole/OpenClawConsole/Assets.xcassets/AppIcon.appiconset"
IOS_CONTENTS = IOS_APP_ICON_DIR / "Contents.json"
SOURCE_ICON = IOS_APP_ICON_DIR / "icon-1024.png"
ANDROID_RES_DIR = ROOT / "android/app/src/main/res"
ANDROID_BG_XML = ANDROID_RES_DIR / "values/ic_launcher_background.xml"
ADAPTIVE_ICON_FILES = (
    ANDROID_RES_DIR / "mipmap-anydpi-v26/ic_launcher.xml",
    ANDROID_RES_DIR / "mipmap-anydpi-v26/ic_launcher_round.xml",
)
ANDROID_DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
ANDROID_BACKGROUND = (0, 0, 0)
ADAPTIVE_SCALE = 108 / 48
SAFE_ZONE_FRACTION = 0.66


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify committed assets match generated outputs without writing files.",
    )
    return parser.parse_args()


def ensure_prerequisites() -> None:
    for path in (IOS_CONTENTS, SOURCE_ICON, ANDROID_RES_DIR):
        if not path.exists():
            raise SystemExit(f"Missing required path: {path}")


def load_source_icon() -> Image.Image:
    return Image.open(SOURCE_ICON).convert("RGBA")


def flatten(image: Image.Image, background: tuple[int, int, int], size: int) -> Image.Image:
    canvas = Image.new("RGB", (size, size), background)
    canvas.paste(image, mask=image)
    return canvas


def rounded_square(image: Image.Image, size: int, radius_ratio: float = 0.224) -> Image.Image:
    rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    radius = int(size * radius_ratio)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    rounded.paste(image, mask=mask)
    return rounded


def ios_targets() -> list[tuple[str, int]]:
    contents = json.loads(IOS_CONTENTS.read_text())
    targets: list[tuple[str, int]] = []
    for image in contents.get("images", []):
        filename = image.get("filename")
        size = image.get("size")
        scale = image.get("scale")
        if not filename or not size or not scale:
            continue
        base_size = float(size.split("x", 1)[0])
        factor = int(scale.rstrip("x"))
        pixel_size = int(round(base_size * factor))
        targets.append((filename, pixel_size))
    return targets


def adaptive_icon_xml() -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n'
    )


def background_xml(color: tuple[int, int, int]) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">#{color[0]:02X}{color[1]:02X}{color[2]:02X}</color>\n'
        "</resources>\n"
    )


def png_bytes(image: Image.Image) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, "PNG", optimize=True)
    return buffer.getvalue()


def generate_outputs(target_root: Path) -> list[Path]:
    generated: list[Path] = []
    source = load_source_icon()

    for filename, pixel_size in ios_targets():
        output_path = target_root / IOS_APP_ICON_DIR.relative_to(ROOT) / filename
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if filename == SOURCE_ICON.name:
            output_path.write_bytes(SOURCE_ICON.read_bytes())
        else:
            rendered = source.resize((pixel_size, pixel_size), Image.LANCZOS)
            rendered.convert("RGB").save(output_path, "PNG", optimize=True)
        generated.append(output_path)

    for density, size in ANDROID_DENSITIES.items():
        output_dir = target_root / ANDROID_RES_DIR.relative_to(ROOT) / density
        output_dir.mkdir(parents=True, exist_ok=True)

        square = source.resize((size, size), Image.LANCZOS).convert("RGBA")
        rounded = rounded_square(square, size)
        flatten(rounded, ANDROID_BACKGROUND, size).save(output_dir / "ic_launcher.png", "PNG", optimize=True)
        generated.append(output_dir / "ic_launcher.png")

        round_image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
        round_image.paste(rounded, mask=mask)
        flatten(round_image, ANDROID_BACKGROUND, size).save(output_dir / "ic_launcher_round.png", "PNG", optimize=True)
        generated.append(output_dir / "ic_launcher_round.png")

        foreground_size = int(size * ADAPTIVE_SCALE)
        inner_size = int(foreground_size * SAFE_ZONE_FRACTION)
        foreground = Image.new("RGBA", (foreground_size, foreground_size), (0, 0, 0, 0))
        inset = source.resize((inner_size, inner_size), Image.LANCZOS).convert("RGBA")
        inset = rounded_square(inset, inner_size)
        offset = (foreground_size - inner_size) // 2
        foreground.paste(inset, (offset, offset), mask=inset)
        foreground_path = output_dir / "ic_launcher_foreground.png"
        foreground_path.write_bytes(png_bytes(foreground))
        generated.append(foreground_path)

    for adaptive_file in ADAPTIVE_ICON_FILES:
        output_path = target_root / adaptive_file.relative_to(ROOT)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(adaptive_icon_xml())
        generated.append(output_path)

    background_output = target_root / ANDROID_BG_XML.relative_to(ROOT)
    background_output.parent.mkdir(parents=True, exist_ok=True)
    background_output.write_text(background_xml(ANDROID_BACKGROUND))
    generated.append(background_output)

    return generated


def sync_outputs(generated_paths: Iterable[Path], generated_root: Path) -> None:
    for generated_path in generated_paths:
        destination = ROOT / generated_path.relative_to(generated_root)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(generated_path, destination)


def check_outputs(generated_paths: Iterable[Path], generated_root: Path) -> int:
    mismatches: list[str] = []
    for generated_path in generated_paths:
        destination = ROOT / generated_path.relative_to(generated_root)
        if not destination.exists():
            mismatches.append(f"missing {destination.relative_to(ROOT)}")
            continue
        if generated_path.read_bytes() != destination.read_bytes():
            mismatches.append(f"out-of-sync {destination.relative_to(ROOT)}")

    if mismatches:
        print("App icon assets are out of sync with the canonical iOS marketing icon:")
        for mismatch in mismatches:
            print(f" - {mismatch}")
        print("Run `python3 scripts/sync_app_icons.py` to regenerate.")
        return 1

    print("App icon assets match the canonical iOS marketing icon.")
    return 0


def main() -> int:
    ensure_prerequisites()
    args = parse_args()

    with tempfile.TemporaryDirectory(prefix="openclaw-icons-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        generated_paths = generate_outputs(temp_dir)
        if args.check:
            return check_outputs(generated_paths, temp_dir)
        sync_outputs(generated_paths, temp_dir)

    print("Synchronized iOS and Android app icons from the canonical iOS marketing icon.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
