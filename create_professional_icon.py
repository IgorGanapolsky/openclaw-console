#!/usr/bin/env python3
"""
Create a professional OpenClaw Console app icon
"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_professional_icon():
    # Create the main 1024x1024 icon
    size = 1024
    icon = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)

    # Modern gradient background (dark blue to darker blue)
    for y in range(size):
        alpha = y / size
        color = (
            int(15 + alpha * 5),   # Dark blue to slightly lighter
            int(25 + alpha * 10),
            int(45 + alpha * 15),
            255
        )
        draw.line([(0, y), (size-1, y)], fill=color, width=1)

    # Draw rounded rectangle background
    margin = 80
    corner_radius = 180
    draw.rounded_rectangle(
        [margin, margin, size-margin, size-margin],
        radius=corner_radius,
        fill=(25, 35, 55, 255),
        outline=(60, 120, 180, 200),
        width=8
    )

    # Central console icon - modern terminal/console symbol
    center_x, center_y = size // 2, size // 2

    # Draw stylized console window
    console_width = 400
    console_height = 280
    console_x = center_x - console_width // 2
    console_y = center_y - console_height // 2 - 40

    # Console background
    draw.rounded_rectangle(
        [console_x, console_y, console_x + console_width, console_y + console_height],
        radius=20,
        fill=(10, 15, 25, 255),
        outline=(0, 180, 255, 255),
        width=6
    )

    # Console header bar
    header_height = 40
    draw.rounded_rectangle(
        [console_x, console_y, console_x + console_width, console_y + header_height],
        radius=20,
        fill=(0, 160, 220, 255)
    )
    draw.rectangle(
        [console_x, console_y + 20, console_x + console_width, console_y + header_height],
        fill=(0, 160, 220, 255)
    )

    # Window controls (macOS style)
    control_y = console_y + 20
    control_radius = 8
    draw.ellipse([console_x + 15, control_y - control_radius,
                  console_x + 15 + control_radius*2, control_y + control_radius],
                 fill=(255, 95, 87, 255))  # Red
    draw.ellipse([console_x + 40, control_y - control_radius,
                  console_x + 40 + control_radius*2, control_y + control_radius],
                 fill=(255, 189, 46, 255))  # Yellow
    draw.ellipse([console_x + 65, control_y - control_radius,
                  console_x + 65 + control_radius*2, control_y + control_radius],
                 fill=(39, 201, 63, 255))  # Green

    # Terminal prompt and cursor
    prompt_start_x = console_x + 30
    prompt_y = console_y + 80
    line_height = 35

    # Draw terminal text lines (simulated)
    text_color = (0, 255, 150, 255)  # Bright green
    secondary_color = (150, 150, 150, 255)  # Gray

    # Line 1: $ openclaw status
    draw.rectangle([prompt_start_x, prompt_y, prompt_start_x + 200, prompt_y + 20], fill=text_color)

    # Line 2: Agent: ACTIVE
    draw.rectangle([prompt_start_x, prompt_y + line_height, prompt_start_x + 150, prompt_y + line_height + 20], fill=secondary_color)

    # Line 3: Tasks: 3 pending
    draw.rectangle([prompt_start_x, prompt_y + line_height*2, prompt_start_x + 180, prompt_y + line_height*2 + 20], fill=secondary_color)

    # Cursor (blinking terminal cursor)
    cursor_x = prompt_start_x
    cursor_y = prompt_y + line_height*3
    draw.rectangle([cursor_x, cursor_y, cursor_x + 15, cursor_y + 25], fill=(0, 255, 150, 255))

    # Mobile/phone indicator at bottom
    phone_width = 120
    phone_height = 200
    phone_x = center_x - phone_width // 2
    phone_y = console_y + console_height + 50

    # Phone outline
    draw.rounded_rectangle(
        [phone_x, phone_y, phone_x + phone_width, phone_y + phone_height],
        radius=25,
        fill=(40, 50, 70, 255),
        outline=(0, 180, 255, 200),
        width=4
    )

    # Phone screen
    screen_margin = 15
    draw.rounded_rectangle(
        [phone_x + screen_margin, phone_y + 25,
         phone_x + phone_width - screen_margin, phone_y + phone_height - 25],
        radius=15,
        fill=(0, 0, 0, 255),
        outline=(0, 255, 150, 150),
        width=2
    )

    # Small notification dots on phone
    dot_size = 8
    for i, x_offset in enumerate([30, 50, 70]):
        color = (0, 255, 150, 255) if i % 2 == 0 else (255, 100, 0, 255)
        draw.ellipse([phone_x + x_offset, phone_y + 40,
                      phone_x + x_offset + dot_size, phone_y + 40 + dot_size],
                     fill=color)

    return icon

def create_all_icon_sizes(base_icon):
    """Create all required iOS app icon sizes"""
    sizes = {
        'icon-1024.png': 1024,
        'icon-60@3x.png': 180,
        'icon-60@2x.png': 120,
        'icon-40@3x.png': 120,
        'icon-40@2x.png': 80,
        'icon-40@2x~ipad.png': 80,
        'icon-76@2x~ipad.png': 152,
        'icon-76@2x.png': 152,
        'icon-76@1x~ipad.png': 76,
        'icon-76.png': 76,
        'icon-83.5@2x~ipad.png': 167,
        'icon-83.5@2x.png': 167,
        'icon-29@3x.png': 87,
        'icon-29@2x.png': 58,
        'icon-29@2x~ipad.png': 58,
        'icon-29@1x~ipad.png': 29,
        'icon-29@1x.png': 29,
        'icon-20@3x.png': 60,
        'icon-20@2x.png': 40,
        'icon-20@2x~ipad.png': 40,
        'icon-20@1x.png': 20,
        'icon-40@1x~ipad.png': 40,
        'icon-40-ipad.png': 40,
        'icon-29-ipad.png': 29,
        'icon-20-ipad.png': 20,
        'icon-20@2x-ipad.png': 40,
        'icon-29@2x-ipad.png': 58,
        'icon-40@2x-ipad.png': 80,
    }

    icon_dir = '/Users/igorganapolsky/workspace/git/igor/openclaw-console/ios/OpenClawConsole/OpenClawConsole/Assets.xcassets/AppIcon.appiconset/'

    for filename, size in sizes.items():
        resized = base_icon.resize((size, size), Image.LANCZOS)
        # Convert to RGB to remove alpha channel (required by App Store)
        rgb_icon = Image.new('RGB', (size, size), (0, 0, 0))
        rgb_icon.paste(resized, mask=resized)
        rgb_icon.save(os.path.join(icon_dir, filename), 'PNG', optimize=True)
        print(f"Created {filename} ({size}x{size})")

def create_android_icons(base_icon):
    """Export the same iOS master to Android mipmap densities.

    Android launcher icon sizes:
      mdpi    = 48x48
      hdpi    = 72x72
      xhdpi   = 96x96
      xxhdpi  = 144x144
      xxxhdpi = 192x192
    We emit both ic_launcher.png (square) and ic_launcher_round.png
    (circular mask) so every launcher renders the same artwork as iOS.
    """
    import os as _os

    densities = {
        'mipmap-mdpi': 48,
        'mipmap-hdpi': 72,
        'mipmap-xhdpi': 96,
        'mipmap-xxhdpi': 144,
        'mipmap-xxxhdpi': 192,
    }
    android_res = '/Users/igorganapolsky/workspace/git/igor/openclaw-console/android/app/src/main/res'

    # Adaptive-icon foregrounds (Android 8+) need 108x108dp with 66dp safe zone.
    # We produce foreground PNGs at 1.5x the ic_launcher size at each density
    # so the central artwork is not clipped on circular/squircle masks.
    foreground_scale = 108 / 48  # 2.25x over the base ic_launcher size

    for folder, size in densities.items():
        target_dir = _os.path.join(android_res, folder)
        _os.makedirs(target_dir, exist_ok=True)

        # Square launcher (legacy + round variant background)
        square = base_icon.resize((size, size), Image.LANCZOS).convert('RGBA')
        square_rgb = Image.new('RGB', (size, size), (26, 26, 46))
        square_rgb.paste(square, mask=square)
        square_rgb.save(_os.path.join(target_dir, 'ic_launcher.png'), 'PNG', optimize=True)

        # Round launcher (for legacy devices pre-API 26)
        round_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
        round_img.paste(square, (0, 0), mask=mask)
        round_rgb = Image.new('RGB', (size, size), (26, 26, 46))
        round_rgb.paste(round_img, mask=round_img)
        round_rgb.save(_os.path.join(target_dir, 'ic_launcher_round.png'), 'PNG', optimize=True)

        # Adaptive-icon foreground PNG (drawn centered in safe zone)
        fg_size = int(size * foreground_scale)
        fg_canvas = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
        inner_size = int(fg_size * 0.66)  # 66dp safe zone in 108dp
        inner = base_icon.resize((inner_size, inner_size), Image.LANCZOS).convert('RGBA')
        offset = (fg_size - inner_size) // 2
        fg_canvas.paste(inner, (offset, offset), mask=inner)
        fg_canvas.save(_os.path.join(target_dir, 'ic_launcher_foreground.png'), 'PNG', optimize=True)

        print(f"Created {folder}/ic_launcher.png + _round.png + _foreground.png ({size}px)")

    # Adaptive-icon XMLs point at the PNG foreground we just wrote.
    adaptive_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n'
    )
    anydpi = _os.path.join(android_res, 'mipmap-anydpi-v26')
    _os.makedirs(anydpi, exist_ok=True)
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        with open(_os.path.join(anydpi, name), 'w') as fh:
            fh.write(adaptive_xml)

    # Remove stale vector foregrounds so gradle doesn't resolve to them.
    for folder in densities:
        stale = _os.path.join(android_res, folder, 'ic_launcher_foreground.xml')
        if _os.path.exists(stale):
            _os.remove(stale)
            print(f"Removed stale vector foreground: {folder}/ic_launcher_foreground.xml")


if __name__ == '__main__':
    print("Creating professional OpenClaw Console app icon...")
    icon = create_professional_icon()
    create_all_icon_sizes(icon)
    create_android_icons(icon)
    print("[OK] Professional app icon created on iOS + Android from a single master.")