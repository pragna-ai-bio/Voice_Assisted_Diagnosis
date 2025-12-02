from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import numpy as np
import pickle
import librosa
import tempfile
import os
from typing import Dict, Any
import json
import traceback

# Initialize FastAPI app
app = FastAPI(title="Parkinson's Voice Analysis API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the trained model
MODEL_PATH = "pd_model.pkl"

try:
    with open(MODEL_PATH,
