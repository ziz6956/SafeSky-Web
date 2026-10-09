#!/bin/bash
# SAF-234: сборка python3-биндинга pjsua2 из исходников pjproject.
# Пакета python3-pjsua2 нет ни в Debian 12/13, ни в Ubuntu (проверено 09.10.2026:
# packages.debian.org, packages.ubuntu.com, PyPI — только sdist), поэтому собираем
# из официального архива pjproject. Скрипт идемпотентен: при установленном модуле
# сборка пропускается.
set -euo pipefail

PJ_VER=2.14.1
SRC=/usr/src/pjproject-$PJ_VER

if python3 -c 'import pjsua2' 2>/dev/null; then
    echo "pjsua2 уже установлен — сборка не требуется"
    exit 0
fi

cd /usr/src
if [ ! -d "$SRC" ]; then
    curl -fL --retry 3 -o pjproject.tar.gz \
        "https://github.com/pjsip/pjproject/archive/refs/tags/$PJ_VER.tar.gz"
    tar xzf pjproject.tar.gz
fi

cd "$SRC"
# Софтфону нужны только SIP-сигнализация, RTP и файловый плеер (WAV в звонок);
# видео, звуковые устройства и тяжёлые кодеки отключаем — меньше сборочных
# зависимостей и меньше поверхность.
./configure --disable-video --disable-sound --disable-v4l2 --disable-ffmpeg \
            --disable-opencore-amr --disable-openh264 --disable-libwebrtc \
            --disable-libyuv --enable-shared

make dep -j"$(nproc)"
make -j"$(nproc)"

# Python-биндинг (SWIG): _pjsua2.so линкуется со статическими libpj* из сборки выше.
cd pjsip-apps/src/swig
make python
cd python
# setup.py install без --user: модуль в /usr/local/lib/python3.X/dist-packages —
# виден системному пользователю safesky, от которого работает воркер.
python3 setup.py install

python3 -c 'import pjsua2; print("pjsua2 OK:", pjsua2.__file__)'
