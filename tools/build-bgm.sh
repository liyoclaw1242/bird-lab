#!/bin/sh
# 把 BigSoundBank 的鄉野環境音（CC0）做成無縫循環：sh tools/build-bgm.sh <暫存資料夾>
# 結尾淡入開頭做成循環，前後再多放一小段，避開 MP3 編碼造成的空白。
# 循環點寫在 public/sound.js 的 BGM：從 PAD 秒到 PAD + LOOP 秒。
set -e
DIR="$1"; XF=4; PAD=0.25
curl -sSf -o "$DIR/source.ogg" "https://bigsoundbank.com/UPLOAD/ogg/0097.ogg"
LEN=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$DIR/source.ogg")
LOOP=$(echo "$LEN - $XF" | bc -l)
ffmpeg -y -v error -i "$DIR/source.ogg" -filter_complex \
  "[0:a]atrim=start=$XF,asetpts=PTS-STARTPTS[x];[0:a]atrim=end=$XF,asetpts=PTS-STARTPTS[y];[x][y]acrossfade=d=$XF:c1=qsin:c2=qsin" \
  -ar 44100 "$DIR/loop.wav"
ffmpeg -y -v error -sseof -$PAD -i "$DIR/loop.wav" -c copy "$DIR/head.wav"
ffmpeg -y -v error -t $PAD -i "$DIR/loop.wav" -c copy "$DIR/tail.wav"
ffmpeg -y -v error -i "$DIR/head.wav" -i "$DIR/loop.wav" -i "$DIR/tail.wav" -filter_complex "[0:a][1:a][2:a]concat=n=3:v=0:a=1" -b:a 128k "$(dirname "$0")/../public/audio/countryside.mp3"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$DIR/loop.wav"
