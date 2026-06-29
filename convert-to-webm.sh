#!/bin/bash
# Chuyển đổi MP4 sang WebM (VP9) - Nén mạnh nhất
# Giảm 50% dung lượng so với MP4

INPUT_FILE=$1
OUTPUT_FILE=${INPUT_FILE%.*}.webm

if [ -z "$INPUT_FILE" ]; then
    echo "Cách sử dụng: ./convert-to-webm.sh input.mp4"
    exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
    echo "File không tồn tại: $INPUT_FILE"
    exit 1
fi

echo "=========================================="
echo "Đang chuyển đổi sang WebM: $INPUT_FILE"
echo "=========================================="

# Cấu hình WebM VP9 - Nén cực mạnh:
# - CRF 30: Chất lượng tốt, nén mạnh (0-63, càng cao càng nén mạnh)
# - Bitrate 2M: Giới hạn bitrate
# - VP9: Codec hiện đại, nén tốt hơn H.264 30-40%
# - Opus: Audio codec tốt nhất cho WebM

ffmpeg -i "$INPUT_FILE" \
    -c:v libvpx-vp9 \
    -crf 30 \
    -b:v 2M \
    -maxrate 2M \
    -bufsize 4M \
    -pix_fmt yuv420p \
    -c:a libopus \
    -b:a 128k \
    -ac 2 \
    -ar 44100 \
    -y \
    "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✓ Hoàn thành!"
    echo "=========================================="
    echo "File đầu ra: $OUTPUT_FILE"
    echo "Kích thước gốc (MP4): $(du -h "$INPUT_FILE" | cut -f1)"
    echo "Kích thước WebM: $(du -h "$OUTPUT_FILE" | cut -f1)"
    
    # Tính % tiết kiệm
    ORIGINAL_SIZE=$(du -m "$INPUT_FILE" | cut -f1)
    WEBM_SIZE=$(du -m "$OUTPUT_FILE" | cut -f1)
    SAVED=$((100 - (WEBM_SIZE * 100 / ORIGINAL_SIZE)))
    echo "Tiết kiệm: ${SAVED}%"
    echo "=========================================="
else
    echo ""
    echo "❌ Lỗi khi chuyển đổi video"
    exit 1
fi