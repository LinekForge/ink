#!/usr/bin/env python3
"""
生成 Ink app icon —— 黑底圆角 + 宋体"墨"字。
输出 1024x1024 PNG，Tauri CLI 用它 generate 全套尺寸。
"""
import os
from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
BG = '#1a1a1a'
FG = '#f5f1e8'  # 略偏暖米色
# macOS icon 标准圆角比例 (Apple HIG): 22.37%
RADIUS = int(SIZE * 0.2237)
FONT_PATH = '/System/Library/Fonts/Supplemental/Songti.ttc'
FONT_SIZE = 620
TEXT = '墨'

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# 背景圆角方形
draw.rounded_rectangle([(0, 0), (SIZE, SIZE)], radius=RADIUS, fill=BG)

# 字居中
# Songti.ttc 是 collection；index=0 是 Songti (宋体)，1 可能是 bold 等
font = ImageFont.truetype(FONT_PATH, FONT_SIZE, index=0)
bbox = draw.textbbox((0, 0), TEXT, font=font)
w = bbox[2] - bbox[0]
h = bbox[3] - bbox[1]
x = (SIZE - w) / 2 - bbox[0]
# 中文字形垂直 baseline 偏下，视觉居中需要 up-shift 一点
y = (SIZE - h) / 2 - bbox[1] - 20
draw.text((x, y), TEXT, fill=FG, font=font)

out = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'app-icon.png',
)
img.save(out)
print(f'✓ {out} ({SIZE}x{SIZE})')
