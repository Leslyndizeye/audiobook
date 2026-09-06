# Jesus Is the King — Audio Reader

## Quick Start (Local, no Docker)

### Backend
```bash
cd backend
pip install -r requirements.txt
cp ../env.example .env          # edit DATABASE_URL to sqlite if needed
uvicorn app.main:app --reload --port 8000
```

For SQLite (no Postgres required), change `DATABASE_URL` in `.env`:
```
DATABASE_URL=sqlite:///./audiobook.db
```
Then in `backend/app/database.py` replace `create_engine(...)` with:
```python
engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

---

## Docker (Full Stack)
```bash
cp .env.example .env
docker-compose up --build
```
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## Entry Experience
1. Open http://localhost:3000
2. Fullscreen cinematic intro appears
3. Microphone activates automatically
4. **Say aloud:** "Jesus is the King"
5. Golden unlock animation plays
6. Dashboard opens

> Chrome/Edge recommended for Web Speech API support.
> Firefox fallback: type the phrase in the text input.

---

## Features
- Voice-gated entry (Web Speech API)
- 400+ neural voices via edge-tts (free)
- Upload PDF, DOCX, TXT, RTF, ODT
- AI audiobook generation with sentence timing
- Sentence-level reading highlight with auto-scroll
- Audio-reactive waveform
- Floating glowing voice orb
- History dashboard
- Adjustable pitch, speed, volume
- Dark cinematic glassmorphism UI
