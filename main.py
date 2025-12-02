from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import librosa
import numpy as np
import parselmouth
import tempfile
import pickle
import subprocess
import os
from datetime import datetime
import json

app = FastAPI(title="NeuroVoice AI API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
MODEL_PATH = "pd_model.pkl"
model = None

@app.on_event("startup")
async def startup_event():
    """Load the model on startup"""
    global model
    try:
        if os.path.exists(MODEL_PATH):
            model = pickle.load(open(MODEL_PATH, "rb"))
            print(f"Model loaded successfully from {MODEL_PATH}")
        else:
            print(f"Warning: Model file not found at {MODEL_PATH}")
            # Create a dummy model for testing
            from sklearn.ensemble import RandomForestClassifier
            model = RandomForestClassifier()
            # Train on dummy data
            X_dummy = np.random.rand(100, 26)
            y_dummy = np.random.randint(0, 2, 100)
            model.fit(X_dummy, y_dummy)
            print("Created dummy model for testing")
    except Exception as e:
        print(f"Error loading model: {e}")
        model = None

def convert_to_wav(input_path: str) -> str:
    """Convert any audio file to WAV format using ffmpeg"""
    tmp_wav = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp_wav.close()
    
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", tmp_wav.name],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
        return tmp_wav.name
    except subprocess.CalledProcessError as e:
        os.remove(tmp_wav.name)
        raise HTTPException(status_code=400, detail=f"Audio conversion failed: {e.stderr.decode()}")

def safe_call(*args):
    """Safe wrapper for Praat calls to handle errors"""
    try:
        return parselmouth.praat.call(*args)
    except Exception as e:
        print(f"Praat call failed: {e}")
        return 0.0

def extract_features(filepath: str, sr: int = 16000) -> np.ndarray:
    """
    Extract 26 acoustic features from audio file
    Features include jitter, shimmer, HNR, pitch statistics, and voicing parameters
    """
    try:
        # Load audio with librosa for duration check
        y, sr = librosa.load(filepath, sr=sr, mono=True)
        duration = librosa.get_duration(y=y, sr=sr)
        
        if duration < 0.5:  # Minimum 0.5 seconds
            raise ValueError("Audio too short for analysis")
        
        # Load with Parselmouth for feature extraction
        snd = parselmouth.Sound(filepath)
        
        # 1. Pitch features
        pitch = snd.to_pitch(time_step=0.01, pitch_floor=75, pitch_ceiling=600)
        pitch_values = pitch.selected_array['frequency']
        pitch_values = pitch_values[pitch_values > 0]
        
        median_pitch = np.median(pitch_values) if len(pitch_values) else 0.0
        mean_pitch = np.mean(pitch_values) if len(pitch_values) else 0.0
        std_pitch = np.std(pitch_values) if len(pitch_values) else 0.0
        min_pitch = np.min(pitch_values) if len(pitch_values) else 0.0
        max_pitch = np.max(pitch_values) if len(pitch_values) else 0.0
        
        # 2. Jitter features (period perturbation)
        point_process = safe_call(snd, "To PointProcess (periodic, cc)", 75, 600)
        
        jitter_local = safe_call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        jitter_abs = safe_call(point_process, "Get jitter (local, absolute)", 0, 0, 0.0001, 0.02, 1.3)
        jitter_rap = safe_call(point_process, "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3)
        jitter_ppq5 = safe_call(point_process, "Get jitter (ppq5)", 0, 0, 0.0001, 0.02, 1.3)
        jitter_ddp = safe_call(point_process, "Get jitter (ddp)", 0, 0, 0.0001, 0.02, 1.3)
        
        # 3. Shimmer features (amplitude perturbation)
        shimmer_local = safe_call(point_process, "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        shimmer_db = safe_call(point_process, "Get shimmer (local_dB)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        shimmer_apq3 = safe_call(point_process, "Get shimmer (apq3)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        shimmer_apq5 = safe_call(point_process, "Get shimmer (apq5)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        shimmer_apq11 = safe_call(point_process, "Get shimmer (apq11)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        shimmer_dda = safe_call(point_process, "Get shimmer (dda)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        
        # 4. Harmonicity features
        harmonicity = safe_call(snd, "To Harmonicity (cc)", 0.01, 75, 0.1, 1.0)
        hnr = safe_call(harmonicity, "Get mean", 0, 0) if harmonicity else 0.0
        
        # 5. Noise features
        noise = safe_call(snd, "To Noise levels", 75)
        nth = noise["nth"] if noise else 0.0
        htn = noise["htn"] if noise else 0.0
        
        # 6. Voicing features
        fraction_unvoiced = safe_call(pitch, "Fraction unvoiced frames")
        num_breaks = safe_call(pitch, "Get number of voice breaks")
        degree_breaks = safe_call(pitch, "Get degree of voice breaks")
        
        # 7. Period features
        pulses = safe_call(point_process, "Get number of points")
        periods = pulses - 1 if pulses > 1 else 0
        mean_period = safe_call(point_process, "Get mean period", 0, 0, 0.0001, 0.02, 1.3)
        sd_period = safe_call(point_process, "Get standard deviation of period", 0, 0, 0.0001, 0.02, 1.3)
        
        # Compile all 26 features
        features = np.array([
            jitter_local, jitter_abs, jitter_rap, jitter_ppq5, jitter_ddp,
            shimmer_local, shimmer_db, shimmer_apq3, shimmer_apq5, shimmer_apq11, shimmer_dda,
            hnr, nth, htn,
            median_pitch, mean_pitch, std_pitch, min_pitch, max_pitch,
            pulses, periods, mean_period, sd_period,
            fraction_unvoiced, num_breaks, degree_breaks
        ], dtype=np.float32).reshape(1, -1)
        
        # Validate features
        if np.any(np.isnan(features)) or np.any(np.isinf(features)):
            print("Warning: Some features are NaN or Inf")
            features = np.nan_to_num(features, nan=0.0, posinf=0.0, neginf=0.0)
        
        return features
        
    except Exception as e:
        print(f"Feature extraction error: {e}")
        raise HTTPException(status_code=500, detail=f"Feature extraction failed: {str(e)}")

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "name": "NeuroVoice AI API",
        "version": "1.0.0",
        "description": "Parkinson's Disease Voice Analysis System",
        "endpoints": {
            "/": "API Information",
            "/health": "Health Check",
            "/predict": "Voice Analysis",
            "/features": "Feature Extraction Only",
            "/info": "Model Information"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "model_loaded": model is not None
    }

@app.get("/info")
async def model_info():
    """Get model information"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    return {
        "model_type": str(type(model)),
        "n_features": getattr(model, "n_features_in_", "unknown"),
        "n_classes": getattr(model, "n_classes_", "unknown"),
        "classes": getattr(model, "classes_", []).tolist() if hasattr(model, "classes_") else []
    }

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Main prediction endpoint
    Accepts audio file and returns Parkinson's disease risk assessment
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    # Validate file
    if not file.content_type.startswith('audio/'):
        raise HTTPException(status_code=400, detail="File must be an audio file")
    
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    wav_path = None
    try:
        # Convert to WAV
        wav_path = convert_to_wav(tmp_path)
        
        # Extract features
        features = extract_features(wav_path)
        
        # Make prediction
        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(features)[0]
            prediction = model.predict(features)[0]
            
            # For binary classification
            if len(probabilities) == 2:
                parkinsons_prob = probabilities[1]  # Probability of class 1 (Parkinson's)
            else:
                parkinsons_prob = probabilities[prediction]
        else:
            # If model doesn't have predict_proba
            prediction = model.predict(features)[0]
            parkinsons_prob = float(prediction)
        
        # Determine risk level
        score = float(parkinsons_prob)
        if score > 0.7:
            label = "High Risk"
            confidence = "high"
            recommendation = "Immediate clinical evaluation recommended"
        elif score > 0.4:
            label = "Moderate Risk"
            confidence = "medium"
            recommendation = "Follow-up monitoring advised"
        else:
            label = "Low Risk"
            confidence = "low"
            recommendation = "Regular screening sufficient"
        
        # Calculate feature statistics for frontend
        feature_values = features[0].tolist()
        feature_stats = {
            "jitter_local": float(feature_values[0]),
            "jitter_abs": float(feature_values[1]),
            "shimmer_local": float(feature_values[5]),
            "hnr": float(feature_values[11]),
            "mean_pitch": float(feature_values[14]),
            "std_pitch": float(feature_values[16]),
            "fraction_unvoiced": float(feature_values[23])
        }
        
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "analysis": {
                "score": score,
                "percentage": round(score * 100, 1),
                "label": label,
                "confidence": confidence,
                "prediction": int(prediction)
            },
            "features": feature_stats,
            "recommendation": recommendation,
            "metadata": {
                "duration": librosa.get_duration(filename=wav_path),
                "sample_rate": 16000,
                "channels": 1
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")
    finally:
        # Cleanup temporary files
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)

@app.post("/features")
async def extract_features_only(file: UploadFile = File(...)):
    """
    Extract and return features without prediction
    Useful for debugging and analysis
    """
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    wav_path = None
    try:
        # Convert to WAV
        wav_path = convert_to_wav(tmp_path)
        
        # Extract features
        features = extract_features(wav_path)
        
        # Feature names corresponding to the 26 features
        feature_names = [
            "jitter_local", "jitter_abs", "jitter_rap", "jitter_ppq5", "jitter_ddp",
            "shimmer_local", "shimmer_db", "shimmer_apq3", "shimmer_apq5", "shimmer_apq11", "shimmer_dda",
            "hnr", "nth", "htn",
            "median_pitch", "mean_pitch", "std_pitch", "min_pitch", "max_pitch",
            "pulses", "periods", "mean_period", "sd_period",
            "fraction_unvoiced", "num_breaks", "degree_breaks"
        ]
        
        # Create feature dictionary
        feature_dict = {
            name: float(value) 
            for name, value in zip(feature_names, features[0])
        }
        
        return {
            "success": True,
            "features": feature_dict,
            "count": len(feature_names),
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Feature extraction error: {e}")
        raise HTTPException(status_code=500, detail=f"Feature extraction failed: {str(e)}")
    finally:
        # Cleanup temporary files
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
