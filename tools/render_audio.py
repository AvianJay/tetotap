"""Render Tetotap's musical phrases. Source voicebanks stay in the system temp folder.

Requires Windows, Python, numpy, requests, and ffmpeg on PATH.
The website ships rendered performances, never the UTAU source library or engine.
"""

import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile
import wave
import zipfile

import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(tempfile.gettempdir()) / "tetotap-assets"
RATE = 44100
STEP = 60 / 140 / 2
VOICE_URL = "https://kasaneteto.jp/assets/download/utau/TETO-tandoku-100619.zip"
ENGINE_URL = "https://utau2008.xrea.jp/UTAU0419.zip"


def download(url, name):
    path = CACHE / name
    if not path.exists():
        response = requests.get(url, timeout=90)
        response.raise_for_status()
        path.write_bytes(response.content)
    return zipfile.ZipFile(path)


def run(args):
    result = subprocess.run(
        [str(arg) for arg in args],
        capture_output=True,
        timeout=60,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode:
        raise RuntimeError(f"Audio tool failed: {Path(args[0]).name}")


def wav_write(path, samples):
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes((np.clip(samples, -0.98, 0.98) * 32767).astype("<i2").tobytes())


def wav_read(path):
    with wave.open(str(path), "rb") as source:
        assert source.getframerate() == RATE and source.getsampwidth() == 2
        return np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(float) / 32768


def encode(samples, name):
    source = CACHE / f"{name}.wav"
    target = CACHE / f"{name}.mp3"
    wav_write(source, samples)
    run(["ffmpeg", "-y", "-v", "error", "-i", source, "-codec:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", target])
    return "data:audio/mp3;base64," + base64.b64encode(target.read_bytes()).decode("ascii")


def envelope(samples, attack=0.008, release=0.04):
    result = samples.copy()
    a, r = min(len(result), int(RATE * attack)), min(len(result), int(RATE * release))
    result[:a] *= np.linspace(0, 1, a)
    result[-r:] *= np.linspace(1, 0, r)
    return result


def main():
    CACHE.mkdir(exist_ok=True)
    bank = download(VOICE_URL, "voicebank.zip")
    engine = download(ENGINE_URL, "utau.zip")
    executable = CACHE / "resampler.exe"
    executable.write_bytes(engine.read("UTAU0419/resampler.exe"))
    config_path = next(n for n in bank.namelist() if n.endswith("単独音/oto.ini"))
    bank_dir = config_path.rsplit("/", 1)[0]
    settings = {}
    for line in bank.read(config_path).decode("cp932").splitlines():
        if "=" not in line:
            continue
        filename, values = line.split("=", 1)
        alias, *numbers = values.split(",")
        settings[alias] = (filename, [float(v) for v in numbers])

    def sing(phoneme, midi, duration):
        filename, (offset, consonant, cutoff, preutterance, overlap) = settings[phoneme]
        label = hashlib.sha256(filename.encode()).hexdigest()[:12]
        source = CACHE / f"source-{label}.wav"
        source.write_bytes(bank.read(f"{bank_dir}/{filename}"))
        frq = f"{bank_dir}/{filename[:-4]}_wav.frq"
        if frq in bank.namelist():
            (CACHE / f"source-{label}_wav.frq").write_bytes(bank.read(frq))
        note = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][midi % 12] + str(midi // 12 - 1)
        target = CACHE / f"render-{label}-{midi}-{int(duration * 1000)}.wav"
        if not target.exists():
            run([executable, source, target, note, 100, "B0", offset, int(duration * 1000) + 70, consonant, cutoff, 100, 0])
        # Place the consonant just before the beat, then shape a musical note envelope.
        samples = wav_read(target)
        samples = samples[max(0, int((preutterance - 25) / 1000 * RATE)):]
        count = int(duration * RATE)
        samples = np.pad(samples[:count], (0, max(0, count - len(samples))))
        peak = max(0.01, np.max(np.abs(samples)))
        return envelope(samples / peak * 0.58)

    scale = [60, 63, 65, 67, 70, 72, 75, 77]
    words = [("て", "と"), ("ら", "ら"), ("か", "さ", "ね"), ("て", "と", "て", "と")]
    voices = {}
    for index in range(32):
        syllables = words[index // 8]
        notes = [scale[index % 8], scale[(index + 2) % 8], scale[(index + 4) % 8], scale[(index + 1) % 8]]
        duration = STEP if len(syllables) < 4 else STEP / 2
        phrase = np.zeros(int(RATE * (len(syllables) * duration + STEP + 0.08)))
        for j, phoneme in enumerate(syllables):
            samples = sing(phoneme, notes[j], duration)
            start = int(j * duration * RATE)
            phrase[start:start + len(samples)] += samples
            echo = start + int(STEP * RATE)
            phrase[echo:echo + len(samples)] += samples * 0.16
        voices[f"{index}.mp3"] = encode(phrase, f"voice-{index}")
        print(f"Rendered Teto phrase {index + 1}/32", flush=True)

    # Original accompaniment: C minor / A-flat / E-flat / B-flat, 140 BPM.
    rng = np.random.default_rng(401)
    tracks = {}
    t = np.arange(int(RATE * 0.22)) / RATE
    kick = np.sin(2 * np.pi * (48 * t + 70 * (1 - np.exp(-t * 35)) / 35)) * np.exp(-t * 22) * 0.46
    tracks["0.mp3"] = encode(envelope(kick, 0.002, 0.025), "kick")
    t = np.arange(int(RATE * 0.09)) / RATE
    noise = rng.uniform(-1, 1, len(t))
    hat = (noise - np.roll(noise, 1)) * np.exp(-t * 65) * 0.075
    tracks["1.mp3"] = encode(envelope(hat, 0.001, 0.02), "hat")
    t = np.arange(int(RATE * 0.19)) / RATE
    clap = rng.uniform(-1, 1, len(t)) * np.exp(-t * 27) * 0.16
    clap += np.sin(2 * np.pi * 180 * t) * np.exp(-t * 40) * 0.12
    tracks["2.mp3"] = encode(envelope(clap, 0.002, 0.03), "clap")
    for chord, (root, third, fifth) in enumerate([(48, 51, 55), (44, 48, 51), (51, 55, 58), (46, 50, 53)]):
        t = np.arange(int(RATE * 0.58)) / RATE
        samples = np.zeros(len(t))
        for midi in (root + 12, third + 12, fifth + 12):
            frequency = 440 * 2 ** ((midi - 69) / 12)
            samples += (np.sin(2 * np.pi * frequency * t) + 0.22 * np.sin(4 * np.pi * frequency * t)) / 3
        samples *= np.exp(-t * 7) * 0.2
        tracks[f"{3 + chord * 2}.mp3"] = encode(envelope(samples, 0.006, 0.06), f"chord-{chord}")
        t = np.arange(int(RATE * 0.19)) / RATE
        frequency = 440 * 2 ** ((root - 12 - 69) / 12)
        bass = (np.sin(2 * np.pi * frequency * t) + 0.16 * np.sin(4 * np.pi * frequency * t)) * np.exp(-t * 9) * 0.28
        tracks[f"{4 + chord * 2}.mp3"] = encode(envelope(bass, 0.006, 0.035), f"bass-{chord}")

    for folder, clips in [("main", voices), ("track", tracks)]:
        path = ROOT / "data" / folder / f"{folder}.json"
        path.write_text(json.dumps(clips, indent=2) + "\n", encoding="utf-8")
    print("Saved 32 rendered Teto performances and 11 original accompaniment sounds.")


if __name__ == "__main__":
    main()
