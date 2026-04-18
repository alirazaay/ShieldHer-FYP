#!/usr/bin/env python3
"""
ShieldHer TFLite Scream Model Offline Audit
============================================
Deterministic offline audit of the shipped shieldher_yamnet.tflite model.

Loads silence / speech / scream WAV files, runs windowed inference, and
emits a machine-readable JSON report with per-class distribution statistics
and a final PASS / FAIL verdict.

Usage:
    python tools/audit_scream_model.py \
        --model  android/app/src/main/assets/shieldher_yamnet.tflite \
        --silence  debug_audio/shieldher_test_silence.wav \
        --speech   debug_audio/shieldher_test_speech.wav \
        --scream   debug_audio/shieldher_test_scream.wav \
        --report   debug_audio/audit_report.json

If any WAV file is missing the script auto-generates a synthetic fallback
and marks it in the report.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
import time
import traceback
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Dependency bootstrap
# ---------------------------------------------------------------------------

def _ensure_packages():
    """Import required packages, installing if needed."""
    missing = []
    try:
        import numpy  # noqa: F401
    except ImportError:
        missing.append("numpy")
    try:
        import soundfile  # noqa: F401
    except ImportError:
        missing.append("soundfile")
    # Accept either tflite-runtime or full tensorflow
    try:
        from tflite_runtime.interpreter import Interpreter  # noqa: F401
    except ImportError:
        try:
            import tensorflow  # noqa: F401
        except ImportError:
            missing.append("tensorflow")

    if missing:
        print(f"[audit] Installing missing packages: {missing}")
        import subprocess
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "--quiet", *missing],
        )

_ensure_packages()

import numpy as np

try:
    import soundfile as sf
    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False

try:
    from tflite_runtime.interpreter import Interpreter as TFLiteInterpreter
except ImportError:
    import tensorflow as tf
    TFLiteInterpreter = tf.lite.Interpreter


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SAMPLE_RATE = 16_000
REQUIRED_SAMPLES = 15_600
HOP_SAMPLES = REQUIRED_SAMPLES // 2  # 7800, 50% overlap
QUANTIZATION_STEP = 1.0 / 255.0      # ≈ 0.00392157


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------

def load_wav(path: str) -> Tuple[np.ndarray, int]:
    """Load a WAV/audio file, return (float32 mono samples, sample_rate)."""
    if HAS_SOUNDFILE:
        data, sr = sf.read(path, dtype="float32", always_2d=True)
        # Mix to mono
        mono = data.mean(axis=1)
        return mono, sr

    # Fallback: raw WAV parser for PCM16
    return _load_wav_raw(path)


def _load_wav_raw(path: str) -> Tuple[np.ndarray, int]:
    """Minimal RIFF WAV PCM-16 reader (no dependencies)."""
    with open(path, "rb") as fh:
        riff = fh.read(4)
        if riff != b"RIFF":
            raise ValueError(f"Not a RIFF file: {path}")
        fh.read(4)  # chunk size
        wave = fh.read(4)
        if wave != b"WAVE":
            raise ValueError(f"Not a WAVE file: {path}")

        fmt_parsed = False
        audio_format = channels = sample_rate = bits_per_sample = 0
        data_bytes = b""

        while True:
            chunk_hdr = fh.read(8)
            if len(chunk_hdr) < 8:
                break
            chunk_id = chunk_hdr[:4]
            chunk_size = struct.unpack("<I", chunk_hdr[4:8])[0]
            chunk_data = fh.read(chunk_size)
            # Pad byte
            if chunk_size % 2 != 0:
                fh.read(1)

            if chunk_id == b"fmt ":
                audio_format = struct.unpack("<H", chunk_data[0:2])[0]
                channels = struct.unpack("<H", chunk_data[2:4])[0]
                sample_rate = struct.unpack("<I", chunk_data[4:8])[0]
                bits_per_sample = struct.unpack("<H", chunk_data[14:16])[0]
                fmt_parsed = True
            elif chunk_id == b"data":
                data_bytes = chunk_data

        if not fmt_parsed:
            raise ValueError(f"WAV missing fmt chunk: {path}")
        if audio_format != 1:
            raise ValueError(f"Only PCM WAV supported (got format={audio_format}): {path}")
        if bits_per_sample != 16:
            raise ValueError(f"Only 16-bit WAV supported (got {bits_per_sample}): {path}")

        count = len(data_bytes) // (2 * channels)
        raw = np.frombuffer(data_bytes, dtype=np.int16).reshape(-1, channels)
        mono = raw.mean(axis=1).astype(np.float32) / 32768.0
        return mono, sample_rate


def resample_linear(audio: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    """Simple linear-interpolation resampler."""
    if src_rate == dst_rate:
        return audio
    ratio = dst_rate / src_rate
    out_len = int(len(audio) * ratio)
    indices = np.arange(out_len) / ratio
    left = np.floor(indices).astype(int)
    left = np.clip(left, 0, len(audio) - 1)
    right = np.clip(left + 1, 0, len(audio) - 1)
    frac = (indices - left).astype(np.float32)
    return audio[left] * (1 - frac) + audio[right] * frac


def normalize_waveform(audio: np.ndarray) -> np.ndarray:
    """Normalize to [-1, 1] (same as the app pipeline)."""
    return np.clip(audio, -1.0, 1.0).astype(np.float32)


# ---------------------------------------------------------------------------
# Synthetic WAV generation
# ---------------------------------------------------------------------------

def generate_silence_wav(path: str, duration_s: float = 2.5):
    """Generate a WAV of pure zeros."""
    samples = np.zeros(int(SAMPLE_RATE * duration_s), dtype=np.float32)
    _write_wav_pcm16(path, samples, SAMPLE_RATE)


def generate_speech_wav(path: str, duration_s: float = 2.5):
    """Generate a speech-like synthetic signal: band-limited noise with
    amplitude modulation simulating syllable cadence."""
    n = int(SAMPLE_RATE * duration_s)
    t = np.linspace(0, duration_s, n, dtype=np.float32)
    # Band-limited noise (300-3000 Hz equivalent via sum of random sinusoids)
    rng = np.random.RandomState(42)
    signal = np.zeros(n, dtype=np.float32)
    for _ in range(30):
        freq = rng.uniform(200, 3500)
        phase = rng.uniform(0, 2 * np.pi)
        signal += np.sin(2 * np.pi * freq * t + phase).astype(np.float32)
    signal /= np.max(np.abs(signal)) + 1e-8
    # AM envelope: ~4 Hz syllable rate
    envelope = 0.3 + 0.7 * np.abs(np.sin(2 * np.pi * 4.0 * t))
    signal *= envelope.astype(np.float32)
    signal *= 0.5  # moderate level
    _write_wav_pcm16(path, signal, SAMPLE_RATE)


def generate_scream_wav(path: str, duration_s: float = 2.5):
    """Generate a scream-like synthetic signal: high-energy harmonics
    with broadband noise burst."""
    n = int(SAMPLE_RATE * duration_s)
    t = np.linspace(0, duration_s, n, dtype=np.float32)
    rng = np.random.RandomState(99)
    # Fundamental + harmonics (shrill)
    signal = np.zeros(n, dtype=np.float32)
    f0 = 800.0
    for k in range(1, 12):
        amp = 1.0 / k
        signal += amp * np.sin(2 * np.pi * f0 * k * t).astype(np.float32)
    signal /= np.max(np.abs(signal)) + 1e-8
    # Add broadband noise
    noise = rng.randn(n).astype(np.float32)
    noise /= np.max(np.abs(noise)) + 1e-8
    signal = 0.6 * signal + 0.4 * noise
    # Aggressive envelope: sharp onset, sustained
    envelope = np.clip(t / 0.05, 0, 1).astype(np.float32)
    signal *= envelope
    signal *= 0.9  # high level
    signal = np.clip(signal, -1.0, 1.0)
    _write_wav_pcm16(path, signal, SAMPLE_RATE)


def _write_wav_pcm16(path: str, samples: np.ndarray, sample_rate: int):
    """Write a mono PCM-16 WAV file."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    data_bytes = pcm.tobytes()
    n_channels = 1
    bits = 16
    byte_rate = sample_rate * n_channels * bits // 8
    block_align = n_channels * bits // 8
    with open(path, "wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + len(data_bytes)))
        f.write(b"WAVE")
        f.write(b"fmt ")
        f.write(struct.pack("<I", 16))  # chunk size
        f.write(struct.pack("<H", 1))   # PCM
        f.write(struct.pack("<H", n_channels))
        f.write(struct.pack("<I", sample_rate))
        f.write(struct.pack("<I", byte_rate))
        f.write(struct.pack("<H", block_align))
        f.write(struct.pack("<H", bits))
        f.write(b"data")
        f.write(struct.pack("<I", len(data_bytes)))
        f.write(data_bytes)


# ---------------------------------------------------------------------------
# TFLite helpers
# ---------------------------------------------------------------------------

@dataclass
class TensorMeta:
    name: str
    shape: List[int]
    dtype: str
    quantization: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        d = {"name": self.name, "shape": self.shape, "dtype": self.dtype}
        if self.quantization:
            d["quantization"] = self.quantization
        return d


def get_tensor_meta(detail: dict) -> TensorMeta:
    quant = detail.get("quantization_parameters") or detail.get("quantization")
    q_dict = None
    if quant:
        scales = quant.get("scales")
        zero_points = quant.get("zero_points")
        if scales is not None and hasattr(scales, "tolist"):
            scales = scales.tolist()
        if zero_points is not None and hasattr(zero_points, "tolist"):
            zero_points = zero_points.tolist()
        q_dict = {"scales": scales, "zero_points": zero_points}
    return TensorMeta(
        name=detail.get("name", ""),
        shape=list(detail["shape"]),
        dtype=str(detail["dtype"]),
        quantization=q_dict,
    )


# ---------------------------------------------------------------------------
# Per-class stats
# ---------------------------------------------------------------------------

@dataclass
class ClassStats:
    label: str
    file_path: str
    file_is_synthetic: bool
    original_sample_rate: int
    total_audio_samples: int
    duration_s: float
    windows: int = 0
    probs: List[float] = field(default_factory=list)

    # Computed after inference
    min_prob: float = 0.0
    max_prob: float = 0.0
    mean_prob: float = 0.0
    median_prob: float = 0.0
    p90_prob: float = 0.0
    p99_prob: float = 0.0
    count_zero: int = 0
    count_le_1_255: int = 0
    count_1_255_to_0_01: int = 0
    count_gt_0_01: int = 0
    first_20_probs: List[float] = field(default_factory=list)

    def compute(self):
        arr = np.array(self.probs, dtype=np.float64)
        self.windows = len(arr)
        if self.windows == 0:
            return
        self.min_prob = float(arr.min())
        self.max_prob = float(arr.max())
        self.mean_prob = float(arr.mean())
        self.median_prob = float(np.median(arr))
        self.p90_prob = float(np.percentile(arr, 90))
        self.p99_prob = float(np.percentile(arr, 99))

        for p in arr:
            if p <= 0.0:
                self.count_zero += 1
            elif p <= QUANTIZATION_STEP:
                self.count_le_1_255 += 1
            elif p <= 0.01:
                self.count_1_255_to_0_01 += 1
            else:
                self.count_gt_0_01 += 1

        self.first_20_probs = [round(float(x), 10) for x in arr[:20]]

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "file_path": self.file_path,
            "file_is_synthetic": self.file_is_synthetic,
            "original_sample_rate": self.original_sample_rate,
            "total_audio_samples": self.total_audio_samples,
            "duration_s": round(self.duration_s, 4),
            "windows": self.windows,
            "min_prob": round(self.min_prob, 10),
            "max_prob": round(self.max_prob, 10),
            "mean_prob": round(self.mean_prob, 10),
            "median_prob": round(self.median_prob, 10),
            "p90_prob": round(self.p90_prob, 10),
            "p99_prob": round(self.p99_prob, 10),
            "count_zero": self.count_zero,
            "count_le_1_255": self.count_le_1_255,
            "count_1_255_to_0_01": self.count_1_255_to_0_01,
            "count_gt_0_01": self.count_gt_0_01,
            "first_20_probs": self.first_20_probs,
        }


# ---------------------------------------------------------------------------
# Core audit logic
# ---------------------------------------------------------------------------

def run_windowed_inference(
    interpreter: "TFLiteInterpreter",
    input_detail: dict,
    output_detail: dict,
    audio: np.ndarray,
) -> List[float]:
    """Run the model over rolling windows of REQUIRED_SAMPLES with HOP_SAMPLES hop."""
    input_index = input_detail["index"]
    output_index = output_detail["index"]
    input_shape = list(input_detail["shape"])
    input_dtype = input_detail["dtype"]

    probs: List[float] = []
    total = len(audio)

    start = 0
    while start < total or len(probs) == 0:
        # Build frame
        end = start + REQUIRED_SAMPLES
        if end <= total:
            frame = audio[start:end].copy()
        else:
            frame = np.zeros(REQUIRED_SAMPLES, dtype=np.float32)
            available = total - start
            if available > 0:
                frame[:available] = audio[start:start + available]

        # Reshape to model input shape
        if len(input_shape) == 2:
            frame_input = frame.reshape(1, REQUIRED_SAMPLES)
        elif len(input_shape) == 1:
            frame_input = frame.reshape(REQUIRED_SAMPLES,)
        else:
            frame_input = frame.reshape(input_shape)

        frame_input = frame_input.astype(np.float32)

        interpreter.set_tensor(input_index, frame_input)
        interpreter.invoke()
        raw_output = interpreter.get_tensor(output_index)

        # Extract probability
        prob = _extract_prob(raw_output)
        probs.append(prob)

        start += HOP_SAMPLES
        if start >= total and len(probs) >= 1:
            break

    return probs


def _extract_prob(raw_output: np.ndarray) -> float:
    """Extract a single [0, 1] probability from the model output."""
    flat = raw_output.flatten().astype(np.float64)
    if len(flat) == 0:
        return 0.0

    if len(flat) == 1:
        val = float(flat[0])
        if 0.0 <= val <= 1.0:
            return val
        # Apply sigmoid if outside [0, 1]
        return float(1.0 / (1.0 + math.exp(-val)))

    # Multi-class: return max probability (assume softmax already applied if in [0,1])
    all_in_unit = np.all((flat >= 0) & (flat <= 1))
    if all_in_unit:
        return float(flat.max())
    # Apply softmax
    shifted = flat - flat.max()
    exp_vals = np.exp(shifted)
    softmax = exp_vals / exp_vals.sum()
    return float(softmax.max())


# ---------------------------------------------------------------------------
# Audit checks
# ---------------------------------------------------------------------------

@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str

    def to_dict(self) -> dict:
        return {"name": self.name, "passed": self.passed, "detail": self.detail}


def run_checks(
    silence: ClassStats,
    speech: ClassStats,
    scream: ClassStats,
) -> List[CheckResult]:
    checks: List[CheckResult] = []

    # 1. Silence should produce low output
    passed = silence.max_prob < 0.05
    checks.append(CheckResult(
        "silence_low",
        passed,
        f"silence max_prob={silence.max_prob:.8f} (need < 0.05)",
    ))

    # 2. Scream mean should exceed speech mean by margin
    margin_speech = scream.mean_prob - speech.mean_prob
    passed = margin_speech > 0.05
    checks.append(CheckResult(
        "scream_above_speech_mean",
        passed,
        f"scream_mean={scream.mean_prob:.8f} - speech_mean={speech.mean_prob:.8f} = {margin_speech:.8f} (need > 0.05)",
    ))

    # 3. Scream mean should exceed silence mean by margin
    margin_silence = scream.mean_prob - silence.mean_prob
    passed = margin_silence > 0.05
    checks.append(CheckResult(
        "scream_above_silence_mean",
        passed,
        f"scream_mean={scream.mean_prob:.8f} - silence_mean={silence.mean_prob:.8f} = {margin_silence:.8f} (need > 0.05)",
    ))

    # 4. Scream should have consistent high outputs
    passed = scream.p90_prob > 0.1
    checks.append(CheckResult(
        "scream_consistency",
        passed,
        f"scream p90={scream.p90_prob:.8f} (need > 0.1)",
    ))

    # 5. No plateau pathology: silence and scream should not both peak at same suspicious value
    suspicious_value = 0.6862744
    tolerance = 0.01
    silence_near = abs(silence.max_prob - suspicious_value) < tolerance
    scream_near = abs(scream.max_prob - suspicious_value) < tolerance
    # Also check if both have zero-heavy distributions with identical non-zero spike
    both_plateau = silence_near and scream_near
    passed = not both_plateau
    checks.append(CheckResult(
        "no_plateau_pathology",
        passed,
        f"silence_max={silence.max_prob:.8f} scream_max={scream.max_prob:.8f} "
        f"both_near_0.686={both_plateau}",
    ))

    return checks


# ---------------------------------------------------------------------------
# Report builder
# ---------------------------------------------------------------------------

def build_report(
    model_path: str,
    input_meta: TensorMeta,
    output_meta: TensorMeta,
    class_stats: Dict[str, ClassStats],
    checks: List[CheckResult],
    elapsed_s: float,
    errors: List[str],
) -> dict:
    all_passed = all(c.passed for c in checks) and len(errors) == 0
    return {
        "audit": "ShieldHer TFLite Scream Model Audit",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "elapsed_seconds": round(elapsed_s, 2),
        "model_path": model_path,
        "model_size_bytes": os.path.getsize(model_path) if os.path.exists(model_path) else None,
        "input_tensor": input_meta.to_dict(),
        "output_tensor": output_meta.to_dict(),
        "class_stats": {k: v.to_dict() for k, v in class_stats.items()},
        "checks": [c.to_dict() for c in checks],
        "errors": errors,
        "pass": all_passed,
        "verdict": "PASS" if all_passed else "FAIL",
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def resolve_path(base: str, p: str) -> str:
    """Resolve a path relative to the repo root."""
    if os.path.isabs(p):
        return p
    return os.path.normpath(os.path.join(base, p))


def main():
    parser = argparse.ArgumentParser(
        description="ShieldHer TFLite Scream Model Offline Audit",
    )
    parser.add_argument("--model", default=None, help="Path to .tflite model")
    parser.add_argument("--silence", default=None, help="Path to silence WAV")
    parser.add_argument("--speech", default=None, help="Path to speech WAV")
    parser.add_argument("--scream", default=None, help="Path to scream WAV")
    parser.add_argument("--report", default=None, help="Path to output JSON report")
    parser.add_argument("--repo-root", default=None, help="Repo root override")
    args = parser.parse_args()

    # Determine repo root
    if args.repo_root:
        repo_root = args.repo_root
    else:
        # Walk up from script location to find repo root
        script_dir = os.path.dirname(os.path.abspath(__file__))
        repo_root = os.path.dirname(script_dir)  # tools/ -> repo root

    print(f"[audit] Repo root: {repo_root}")

    # Resolve defaults
    model_path = args.model or resolve_path(
        repo_root, "android/app/src/main/assets/shieldher_yamnet.tflite"
    )
    silence_path = args.silence or resolve_path(repo_root, "debug_audio/shieldher_test_silence.wav")
    speech_path = args.speech or resolve_path(repo_root, "debug_audio/shieldher_test_speech.wav")
    scream_path = args.scream or resolve_path(repo_root, "debug_audio/shieldher_test_scream.wav")
    report_path = args.report or resolve_path(repo_root, "debug_audio/audit_report.json")

    # Ensure debug_audio exists
    os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)

    errors: List[str] = []
    t0 = time.time()

    # ── 1. Validate model ──────────────────────────────────────────────
    if not os.path.exists(model_path):
        # Try alternate name
        alt = os.path.join(os.path.dirname(model_path), "shieldher_model.tflite")
        if os.path.exists(alt):
            print(f"[audit] Primary model not found, using alternate: {alt}")
            model_path = alt
        else:
            print(f"[FATAL] Model not found: {model_path}")
            sys.exit(1)

    print(f"[audit] Model:   {model_path}  ({os.path.getsize(model_path):,} bytes)")

    # ── 2. Load model ──────────────────────────────────────────────────
    interpreter = TFLiteInterpreter(model_path=model_path)
    interpreter.allocate_tensors()

    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    if not input_details or not output_details:
        print("[FATAL] Model has no input or output tensors")
        sys.exit(1)

    input_detail = input_details[0]
    output_detail = output_details[0]
    input_meta = get_tensor_meta(input_detail)
    output_meta = get_tensor_meta(output_detail)

    print(f"[audit] Input:   shape={input_meta.shape}  dtype={input_meta.dtype}")
    print(f"[audit] Output:  shape={output_meta.shape}  dtype={output_meta.dtype}")
    if input_meta.quantization:
        print(f"[audit] Input Q: {input_meta.quantization}")
    if output_meta.quantization:
        print(f"[audit] Output Q: {output_meta.quantization}")

    # Determine expected input length
    flat_input_len = 1
    for d in input_meta.shape:
        flat_input_len *= d
    if flat_input_len != REQUIRED_SAMPLES and flat_input_len != REQUIRED_SAMPLES:
        print(f"[audit] WARNING: Model expects {flat_input_len} input elements, "
              f"audit expects {REQUIRED_SAMPLES}. Proceeding anyway.")
        errors.append(f"Input size mismatch: model={flat_input_len} expected={REQUIRED_SAMPLES}")

    # ── 3. Prepare audio files ─────────────────────────────────────────
    audio_files = {
        "silence": (silence_path, generate_silence_wav),
        "speech":  (speech_path,  generate_speech_wav),
        "scream":  (scream_path,  generate_scream_wav),
    }

    class_stats: Dict[str, ClassStats] = {}

    for label, (fpath, gen_fn) in audio_files.items():
        is_synthetic = False
        if not os.path.exists(fpath):
            print(f"[audit] {label} WAV not found at {fpath}  → generating synthetic fallback")
            gen_fn(fpath)
            is_synthetic = True

        print(f"[audit] Loading {label}: {fpath}")
        try:
            audio, sr = load_wav(fpath)
        except Exception as e:
            msg = f"Failed to load {label} WAV: {e}"
            print(f"[ERROR] {msg}")
            errors.append(msg)
            # Generate synthetic as fallback
            gen_fn(fpath)
            is_synthetic = True
            audio, sr = load_wav(fpath)

        # Resample to 16 kHz if needed
        if sr != SAMPLE_RATE:
            print(f"[audit]   Resampling {label} from {sr} Hz to {SAMPLE_RATE} Hz")
            audio = resample_linear(audio, sr, SAMPLE_RATE)
            sr = SAMPLE_RATE

        audio = normalize_waveform(audio)
        duration = len(audio) / SAMPLE_RATE

        print(f"[audit]   {label}: {len(audio)} samples, {duration:.3f}s, "
              f"rms={np.sqrt(np.mean(audio**2)):.6f}, peak={np.max(np.abs(audio)):.6f}")

        stats = ClassStats(
            label=label,
            file_path=fpath,
            file_is_synthetic=is_synthetic,
            original_sample_rate=sr,
            total_audio_samples=len(audio),
            duration_s=duration,
        )

        # ── 4. Run windowed inference ────────────────────────────────
        try:
            probs = run_windowed_inference(interpreter, input_detail, output_detail, audio)
            stats.probs = probs
        except Exception as e:
            msg = f"Inference failed on {label}: {e}\n{traceback.format_exc()}"
            print(f"[ERROR] {msg}")
            errors.append(msg)

        stats.compute()
        class_stats[label] = stats

        print(f"[audit]   {label} results: windows={stats.windows} "
              f"min={stats.min_prob:.8f} max={stats.max_prob:.8f} "
              f"mean={stats.mean_prob:.8f} median={stats.median_prob:.8f} "
              f"p90={stats.p90_prob:.8f} p99={stats.p99_prob:.8f}")
        print(f"[audit]   {label} dist: zero={stats.count_zero} "
              f"le_1/255={stats.count_le_1_255} "
              f"1/255..0.01={stats.count_1_255_to_0_01} "
              f"gt_0.01={stats.count_gt_0_01}")
        print(f"[audit]   {label} first_20: {stats.first_20_probs}")

    # ── 5. Run checks ─────────────────────────────────────────────────
    silence_stats = class_stats.get("silence")
    speech_stats = class_stats.get("speech")
    scream_stats = class_stats.get("scream")

    if silence_stats and speech_stats and scream_stats:
        checks = run_checks(silence_stats, speech_stats, scream_stats)
    else:
        checks = []
        errors.append("Could not run checks: missing class stats")

    elapsed = time.time() - t0

    # ── 6. Build and save report ──────────────────────────────────────
    report = build_report(
        model_path=model_path,
        input_meta=input_meta,
        output_meta=output_meta,
        class_stats=class_stats,
        checks=checks,
        elapsed_s=elapsed,
        errors=errors,
    )

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # ── 7. Print summary ─────────────────────────────────────────────
    print()
    print("=" * 72)
    print("  ShieldHer TFLite Model Audit Report")
    print("=" * 72)
    print()
    print(f"  Model:     {model_path}")
    print(f"  Input:     {input_meta.shape}  {input_meta.dtype}")
    print(f"  Output:    {output_meta.shape}  {output_meta.dtype}")
    print()

    print("  ┌─────────────────────────────────────────────────────────────────┐")
    print("  │  Class Stats                                                    │")
    print("  ├──────────┬─────────┬──────────┬──────────┬──────────┬──────────┤")
    print("  │ Class    │ Windows │ Mean     │ Max      │ P90      │ Zeros    │")
    print("  ├──────────┼─────────┼──────────┼──────────┼──────────┼──────────┤")
    for label in ["silence", "speech", "scream"]:
        s = class_stats.get(label)
        if s:
            syn = " (syn)" if s.file_is_synthetic else ""
            print(f"  │ {label:8s} │ {s.windows:7d} │ {s.mean_prob:8.6f} │ "
                  f"{s.max_prob:8.6f} │ {s.p90_prob:8.6f} │ {s.count_zero:8d} │{syn}")
    print("  └──────────┴─────────┴──────────┴──────────┴──────────┴──────────┘")
    print()

    print("  Checks:")
    for c in checks:
        icon = "  ✓" if c.passed else "  ✗"
        print(f"    {icon}  {c.name}: {c.detail}")
    print()

    if errors:
        print("  Errors:")
        for e in errors:
            print(f"    ⚠  {e[:120]}")
        print()

    verdict = report["verdict"]
    if verdict == "PASS":
        print("  ╔════════════════════════════════╗")
        print("  ║       VERDICT:   P A S S       ║")
        print("  ╚════════════════════════════════╝")
    else:
        print("  ╔════════════════════════════════╗")
        print("  ║       VERDICT:   F A I L       ║")
        print("  ╚════════════════════════════════╝")

    print()
    print(f"  Report saved: {report_path}")
    print(f"  Elapsed: {elapsed:.2f}s")
    print()

    sys.exit(0 if verdict == "PASS" else 1)


if __name__ == "__main__":
    main()
