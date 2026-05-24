from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from .api.routes.generation import router as generation_router

load_dotenv()

app = FastAPI(
    title="AI-Driven BIM Generation API",
    description="Natural language to IFC building model generator using local Ollama AI",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generation_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
