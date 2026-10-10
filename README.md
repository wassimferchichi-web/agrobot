#  PlantGuard — Plant Disease Detector

CNN-powered web app using EfficientNet-B0 trained on PlantVillage (38 classes, ~54K images).

---

## Project Structure

```
plantguard/
├── train_plantvillage.py   ← Kaggle training script
├── backend/
│   ├── main.py             ← FastAPI server
│   ├── requirements.txt
│   └── plant_disease_model.pth   ← (add after training)
└── frontend/
    └── src/App.jsx         ← React app
```

---

## Phase 1 — Train on Kaggle

1. Go to https://www.kaggle.com/datasets/abdallahalidev/plantvillage-dataset
2. Create a new Kaggle Notebook → **+ Add Data** → search "plantvillage-dataset"
3. Enable **GPU T4 x2** under Settings → Accelerator
4. Paste the contents of `train_plantvillage.py` into a code cell and run
5. Training takes ~30–60 min. After it finishes, download from `/kaggle/working`:
   - `plant_disease_model.pth`
   - `class_names.json`

---

## Phase 2 — Run the FastAPI Backend

```bash
cd backend
pip install -r requirements.txt

# Place plant_disease_model.pth in the backend/ folder
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Test it:
```bash
# Health check
curl http://localhost:8000/health

# Predict
curl -X POST http://localhost:8000/predict \
  -F "file=@leaf.jpg"
```

API docs auto-generated at: http://localhost:8000/docs

---

## Phase 3 — Run the React Frontend

```bash
cd frontend
npm create vite@latest . -- --template react
# (copy App.jsx into src/ replacing the default)
npm install
npm run dev
```

Open http://localhost:5173

---

## Model Architecture

| Component | Detail |
|---|---|
| Base model | EfficientNet-B0 (ImageNet pretrained) |
| Training strategy | Phase 1: head only → Phase 2: full fine-tune |
| Optimizer | AdamW + CosineAnnealingLR |
| Regularization | Early stopping (patience=5), Dropout(0.3) |
| Augmentation | Flip, rotate, color jitter |
| Expected accuracy | ~95–98% on PlantVillage |

---

## 38 Classes (PlantVillage)

Apple, Blueberry, Cherry, Corn, Grape, Orange, Peach, Pepper, Potato,
Raspberry, Soybean, Squash, Strawberry, Tomato — each with healthy + disease variants.
