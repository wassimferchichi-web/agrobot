# ============================================================
#  PlantGuard — FastAPI Backend (Robot Edition)
#  Supports: manual upload + robot HTTP frame submission
#  Run: uvicorn main:app --reload --host 0.0.0.0 --port 8000
# ============================================================

import io, json, time, uuid
from pathlib import Path
from typing import Optional
from collections import deque
from datetime import datetime

import torch
import torch.nn as nn
from torchvision import transforms, models
from torchvision.models import EfficientNet_B0_Weights
from PIL import Image
import base64

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ───────────────────────────────────────────────────
MODEL_PATH   = "plant_disease_model.pth"
IMG_SIZE     = 224
DEVICE       = torch.device("cuda" if torch.cuda.is_available() else "cpu")
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_HISTORY  = 100   # keep last 100 detections in memory

# ── App ──────────────────────────────────────────────────────
app = FastAPI(title="PlantGuard Robot API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory detection log ───────────────────────────────────
detection_log: deque = deque(maxlen=MAX_HISTORY)
latest_frame: dict   = {}          # holds the most recent robot frame + result

# ── Model Manager ─────────────────────────────────────────────
class ModelManager:
    model: Optional[nn.Module] = None
    class_names: list          = []
    is_ready: bool             = False

manager = ModelManager()

def load_model():
    path = Path(MODEL_PATH)
    if not path.exists():
        print(f"⚠  Model not found at {path.resolve()}")
        return
    ckpt        = torch.load(path, map_location=DEVICE)
    class_names = ckpt["class_names"]
    num_classes = ckpt["num_classes"]
    m = models.efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)
    in_features = m.classifier[1].in_features
    m.classifier = nn.Sequential(
        nn.Dropout(p=0.3, inplace=True),
        nn.Linear(in_features, num_classes),
    )
    m.load_state_dict(ckpt["model_state_dict"])
    m.to(DEVICE).eval()
    manager.model       = m
    manager.class_names = class_names
    manager.is_ready    = True
    print(f"✅ Model loaded — {num_classes} classes | {DEVICE}")

@app.on_event("startup")
def startup():
    load_model()

# ── Preprocessing ─────────────────────────────────────────────
preprocess = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

def run_inference(img: Image.Image) -> dict:
    tensor = preprocess(img).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        probs = torch.softmax(manager.model(tensor), dim=1)[0]
    top5_probs, top5_idx = torch.topk(probs, min(5, len(manager.class_names)))
    raw   = manager.class_names[top5_idx[0].item()]
    parts = raw.split("___")
    plant     = parts[0].replace("_", " ")
    condition = parts[1].replace("_", " ") if len(parts) > 1 else "Unknown"
    return {
        "plant":      plant,
        "condition":  condition,
        "is_healthy": "healthy" in condition.lower(),
        "confidence": round(top5_probs[0].item() * 100, 2),
        "top5": [
            {
                "label":      manager.class_names[idx.item()].replace("___", " — ").replace("_", " "),
                "confidence": round(p.item() * 100, 2),
            }
            for p, idx in zip(top5_probs, top5_idx)
        ],
    }

def make_log_entry(result: dict, source: str, frame_b64: str = None) -> dict:
    entry = {
        "id":        str(uuid.uuid4())[:8],
        "timestamp": datetime.now().isoformat(),
        "source":    source,   # "robot" | "manual"
        **result,
    }
    if frame_b64:
        entry["thumbnail"] = frame_b64   # base64 image for the log
    return entry

# ── Endpoints ─────────────────────────────────────────────────

# Health
@app.get("/health")
def health():
    return {"status": "ok", "model_ready": manager.is_ready,
            "num_classes": len(manager.class_names), "device": str(DEVICE)}

# Manual upload (from browser)
@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, f"Unsupported type: {ext}")
    if not manager.is_ready:
        raise HTTPException(503, "Model not loaded")
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(400, "Invalid image")
    result = run_inference(img)
    # thumbnail for log
    thumb = base64.b64encode(contents).decode()[:5000]   # truncate for memory safety
    entry = make_log_entry(result, source="manual", frame_b64=thumb)
    detection_log.appendleft(entry)
    return result

# Robot frame submission — robot calls this every N seconds
@app.post("/robot/frame")
async def robot_frame(file: UploadFile = File(...)):
    """
    The robot sends a JPEG/PNG frame to this endpoint.
    Returns prediction + stores in log + updates live feed.
    """
    if not manager.is_ready:
        raise HTTPException(503, "Model not loaded")
    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(400, "Invalid image")
    result   = run_inference(img)
    frame_b64 = "data:image/jpeg;base64," + base64.b64encode(contents).decode()
    entry    = make_log_entry(result, source="robot", frame_b64=frame_b64)
    detection_log.appendleft(entry)
    # Update live view
    latest_frame.clear()
    latest_frame.update({"frame": frame_b64, "result": result,
                          "timestamp": entry["timestamp"]})
    return result

# Live feed — frontend polls this every 2s
@app.get("/robot/live")
def robot_live():
    return latest_frame if latest_frame else {"frame": None, "result": None}

# Detection history
@app.get("/history")
def history(limit: int = 20):
    return {"detections": list(detection_log)[:limit],
            "total": len(detection_log)}

# Clear log
@app.delete("/history")
def clear_history():
    detection_log.clear()
    latest_frame.clear()
    return {"status": "cleared"}

# Classes list
@app.get("/classes")
def get_classes():
    return {"classes": manager.class_names, "count": len(manager.class_names)}