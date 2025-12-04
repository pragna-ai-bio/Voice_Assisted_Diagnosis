class VoiceAnalysisApp {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioContext = null;
        this.analyser = null;
        this.isRecording = false;
        this.timerInterval = null;
        this.recordingStartTime = null;
        this.currentGraph = 'waveform';
        this.graphChart = null;
        
        this.initElements();
        this.initEventListeners();
        this.initGraph();
        this.checkBackendConnection();
    }
    
    initElements() {
        // UI Elements
        this.recordBtn = document.getElementById('record-btn');
        this.recordBtnText = document.getElementById('record-btn-text');
        this.playBtn = document.getElementById('play-btn');
        this.playBtnIcon = this.playBtn ? this.playBtn.querySelector('i') : null;
        this.timerDisplay = document.getElementById('timer');
        this.audioPlayer = document.getElementById('audio-player');
        this.audioControls = document.querySelector('.audio-player-controls');
        this.progressFill = document.getElementById('progress-fill');
        this.progressSlider = document.getElementById('progress-slider');
        this.currentTimeDisplay = document.getElementById('current-time');
        this.totalTimeDisplay = document.getElementById('total-time');
        this.waveformCanvas = document.getElementById('waveform-canvas');
        this.graphCanvas = document.getElementById('analysis-graph');
        
        // Status Elements
        this.connectionDot = document.getElementById('connection-dot');
        this.connectionStatus = document.getElementById('connection-status');
        this.modelStatusDot = document.getElementById('model-status-dot');
        this.modelStatus = document.getElementById('model-status');
        this.resultBadge = document.getElementById('result-badge');
        this.featuresCount = document.getElementById('features-count');
        
        // Results Elements
        this.riskValue = document.getElementById('risk-value');
        this.riskProgress = document.getElementById('risk-progress');
        this.riskLevel = document.getElementById('risk-level');
        this.riskDescription = document.getElementById('risk-description');
        
        // Feature Elements
        this.jitterValue = document.getElementById('jitter-value');
        this.shimmerValue = document.getElementById('shimmer-value');
        this.hnrValue = document.getElementById('hnr-value');
        this.pitchValue = document.getElementById('pitch-value');
        
        // Graph Elements
        this.graphButtons = document.querySelectorAll('.graph-btn');

        // If there's no recorded audio yet, visually mark controls as disabled
        if (this.audioControls) this.audioControls.classList.add('disabled');
        // ensure play button shows play icon initially
        if (this.playBtnIcon) {
            this.playBtnIcon.classList.remove('fa-pause');
            this.playBtnIcon.classList.add('fa-play');
            if (this.playBtn) this.playBtn.title = 'Play';
        }
    }
    
    initEventListeners() {
        // Recording Controls - Toggle button
        this.recordBtn.addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        });
        if (this.playBtn) {
            this.playBtn.addEventListener('click', () => {
                if (!this.audioPlayer) return;
                if (this.audioPlayer.paused || this.audioPlayer.ended) {
                    this.audioPlayer.play().catch(() => {});
                } else {
                    this.audioPlayer.pause();
                }
            });
        }
        
        // Audio Player Controls
        if (this.audioPlayer) {
            this.audioPlayer.addEventListener('timeupdate', () => this.updateProgressBar());
            this.audioPlayer.addEventListener('loadedmetadata', () => this.updateTotalTime());
            // Sync play/pause icon with audio playback
            this.audioPlayer.addEventListener('play', () => this.updatePlayButtonIcon());
            this.audioPlayer.addEventListener('playing', () => this.updatePlayButtonIcon());
            this.audioPlayer.addEventListener('pause', () => this.updatePlayButtonIcon());
            this.audioPlayer.addEventListener('ended', () => this.updatePlayButtonIcon());
        }
        if (this.progressSlider) {
            this.progressSlider.addEventListener('input', (e) => {
                if (this.audioPlayer && this.audioPlayer.duration) {
                    this.audioPlayer.currentTime = (e.target.value / 100) * this.audioPlayer.duration;
                }
            });
        }
        
        // Graph Controls
        this.graphButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.graphButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentGraph = btn.dataset.graph;
                this.updateGraph();
            });
        });
    }
    
    initGraph() {
        const ctx = this.graphCanvas.getContext('2d');
        
        // Set canvas size
        const dpr = window.devicePixelRatio || 1;
        const rect = this.graphCanvas.getBoundingClientRect();
        this.graphCanvas.width = rect.width * dpr;
        this.graphCanvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        
        this.graphChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Waveform',
                    data: [],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        title: {
                            display: true,
                            text: 'Time',
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'rgba(255, 255, 255, 0.7)'
                        },
                        title: {
                            display: true,
                            text: 'Amplitude',
                            color: 'rgba(255, 255, 255, 0.7)'
                        }
                    }
                }
            }
        });
    }
    
    async checkBackendConnection() {
        try {
            const response = await fetch('https://voice-assisted-diagnosis.onrender.com/health');
            if (response.ok) {
                this.updateConnectionStatus('Connected', true);
                this.updateModelStatus('Model Loaded', true);
            } else {
                this.updateConnectionStatus('Backend Error', false);
            }
        } catch (error) {
            this.updateConnectionStatus('Not Connected', false);
            this.updateModelStatus('Backend Unavailable', false);
        }
    }
    
    updateConnectionStatus(status, connected) {
        this.connectionStatus.textContent = status;
        this.connectionDot.classList.toggle('connected', connected);
    }
    
    updateModelStatus(status, loaded) {
        this.modelStatus.textContent = status;
        this.modelStatusDot.classList.toggle('connected', loaded);
    }

    updatePlayButtonIcon() {
        if (!this.playBtn || !this.playBtnIcon) return;
        if (this.audioPlayer && !this.audioPlayer.paused && !this.audioPlayer.ended) {
            this.playBtnIcon.classList.remove('fa-play');
            this.playBtnIcon.classList.add('fa-pause');
            this.playBtn.title = 'Pause';
        } else {
            this.playBtnIcon.classList.remove('fa-pause');
            this.playBtnIcon.classList.add('fa-play');
            this.playBtn.title = 'Play';
        }
    }
    
    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });
            
            // Initialize audio context for visualization
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);
            this.analyser.fftSize = 2048;
            
            // Set up media recorder
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                this.audioPlayer.src = audioUrl;
                this.playBtn.disabled = false;
                // enable audio controls visually once audio is available
                if (this.audioControls) this.audioControls.classList.remove('disabled');
                // ensure play button shows correct icon
                this.updatePlayButtonIcon();
                // Decode audio and compute visuals (waveform, spectrum, pitch)
                try {
                    await this._decodeAndComputeVisuals(audioBlob);
                } catch (e) {
                    console.warn('Visuals decode failed:', e);
                }

                // Analyze the recording
                await this.analyzeRecording(audioBlob);
                
                // Clean up
                stream.getTracks().forEach(track => track.stop());
                if (this.audioContext) {
                    this.audioContext.close();
                }
            };
            
            // Start recording
            this.mediaRecorder.start();
            this.isRecording = true;
            
            // Update UI
            this.recordBtnText.textContent = 'Stop Recording';
            this.recordBtn.classList.add('recording');
            this.resultBadge.textContent = 'Recording';
            this.resultBadge.style.color = '#f59e0b';
            // Ensure badge shows text state (not circle)
            if (this.resultBadge) {
                this.resultBadge.classList.remove('badge-circle');
                this.resultBadge.style.display = 'inline-block';
                this.resultBadge.style.background = '';
                this.resultBadge.style.boxShadow = '';
                this.resultBadge.title = '';
            }
            
            // Start timer
            this.recordingStartTime = Date.now();
            this.startTimer();
            
            // Start visualization
            this.visualizeRecording();
            
        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Unable to access microphone. Please check permissions and try again.');
        }
    }

    async _decodeAndComputeVisuals(audioBlob) {
        // Decode audio blob to AudioBuffer and compute waveform, spectrum and pitch contour
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const actx = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await actx.decodeAudioData(arrayBuffer);
            const sampleRate = audioBuffer.sampleRate;
            const channelData = audioBuffer.getChannelData(0);

            // Waveform: downsample to 500 points
            const wfSize = 500;
            const step = Math.max(1, Math.floor(channelData.length / wfSize));
            const waveform = new Array(Math.ceil(channelData.length / step)).fill(0).map((_, i) => channelData[i * step]);

            // Spectrum: take first N samples (power of two), window and FFT
            const N = 2048;
            const specInput = channelData.subarray(0, Math.min(N, channelData.length));
            const fftSize = this._nextPow2(specInput.length);
            const real = new Float32Array(fftSize);
            const imag = new Float32Array(fftSize);
            // copy and apply Hanning window
            for (let i = 0; i < specInput.length; i++) {
                const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (specInput.length - 1)));
                real[i] = specInput[i] * w;
            }
            // zero-pad rest
            for (let i = specInput.length; i < fftSize; i++) real[i] = 0;

            this._fft(real, imag);
            const mags = [];
            const half = fftSize / 2;
            for (let i = 0; i < half; i++) {
                mags.push(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]));
            }

            // Reduce spectrum to 128 bins for plotting
            const specBins = 128;
            const bins = new Array(specBins).fill(0);
            for (let i = 0; i < specBins; i++) {
                const start = Math.floor((i / specBins) * mags.length);
                const end = Math.floor(((i + 1) / specBins) * mags.length);
                let sum = 0;
                for (let j = start; j < end; j++) sum += mags[j] || 0;
                bins[i] = sum / Math.max(1, end - start);
            }

            // Pitch contour: simple autocorrelation per frame
            const frameCount = 80;
            const frameLen = Math.floor(channelData.length / frameCount);
            const pitchContour = [];
            for (let f = 0; f < frameCount; f++) {
                const start = f * frameLen;
                const frame = channelData.subarray(start, Math.min(start + frameLen, channelData.length));
                const freq = this._estimatePitchFromAutocorr(frame, sampleRate);
                pitchContour.push(freq || 0);
            }

            // Store latest visuals and update graph if user is on waveform
            this.latestVisuals = { waveform, spectrum: bins, pitch: pitchContour };
            // If current graph not set, update the graph display with waveform by default
            if (this.currentGraph === 'waveform') this.updateGraphWithData(waveform);
            else if (this.currentGraph === 'spectrum') this.updateGraphWithData(bins);
            else if (this.currentGraph === 'pitch') this.updateGraphWithData(pitchContour);

            try { actx.close(); } catch (e) { /* ignore */ }
        } catch (e) {
            console.error('Error decoding audio for visuals', e);
            throw e;
        }
    }

    _nextPow2(v) {
        let p = 1;
        while (p < v) p <<= 1;
        return p;
    }

    _fft(real, imag) {
        // iterative Cooley-Tukey FFT (in-place), assumes length is power of two
        const n = real.length;
        if (n <= 1) return;
        const levels = Math.log2(n);
        if (Math.floor(levels) !== levels) throw new Error('FFT size must be power of two');

        // bit-reversal permutation
        for (let i = 0; i < n; i++) {
            let j = 0;
            for (let k = 0; k < levels; k++) j = (j << 1) | ((i >>> k) & 1);
            if (j > i) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }

        for (let size = 2; size <= n; size <<= 1) {
            const halfSize = size >> 1;
            const tableStep = n / size;
            for (let i = 0; i < n; i += size) {
                for (let j = i, k = 0; j < i + halfSize; j++, k += tableStep) {
                    const l = j + halfSize;
                    const angle = -2 * Math.PI * k / n;
                    const wr = Math.cos(angle);
                    const wi = Math.sin(angle);
                    const xr = wr * real[l] - wi * imag[l];
                    const xi = wr * imag[l] + wi * real[l];
                    real[l] = real[j] - xr;
                    imag[l] = imag[j] - xi;
                    real[j] += xr;
                    imag[j] += xi;
                }
            }
        }
    }

    _estimatePitchFromAutocorr(frame, sampleRate) {
        // basic autocorrelation-based pitch detection
        const size = frame.length;
        if (size < 32) return 0;
        // remove DC
        let mean = 0;
        for (let i = 0; i < size; i++) mean += frame[i];
        mean /= size;
        const signal = new Float32Array(size);
        for (let i = 0; i < size; i++) signal[i] = frame[i] - mean;

        // autocorrelation
        const maxLag = Math.floor(sampleRate / 50); // min 50 Hz
        const minLag = Math.floor(sampleRate / 500); // max 500 Hz
        let bestLag = -1;
        let bestVal = -Infinity;
        for (let lag = minLag; lag <= maxLag && lag < size; lag++) {
            let sum = 0;
            for (let i = 0; i < size - lag; i++) sum += signal[i] * signal[i + lag];
            if (sum > bestVal) { bestVal = sum; bestLag = lag; }
        }
        if (bestLag <= 0) return 0;
        const freq = sampleRate / bestLag;
        if (freq < 50 || freq > 500) return 0;
        return Math.round(freq);
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Update UI
            this.recordBtnText.textContent = 'Start Recording';
            this.recordBtn.classList.remove('recording');
            this.resultBadge.textContent = 'Processing...';
            if (this.resultBadge) {
                this.resultBadge.classList.remove('badge-circle');
                this.resultBadge.style.display = 'inline-block';
                this.resultBadge.style.background = '';
                this.resultBadge.style.boxShadow = '';
                this.resultBadge.title = '';
            }
            
            // Stop timer
            this.stopTimer();
            
            // Stop visualization
            if (this.visualizationInterval) {
                cancelAnimationFrame(this.visualizationInterval);
            }
        }
    }
    
    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            const seconds = Math.floor(elapsed / 1000);
            const minutes = Math.floor(seconds / 60);
            const displaySeconds = seconds % 60;
            this.timerDisplay.textContent = 
                `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
            
            // Auto-stop after 30 seconds
            if (seconds >= 30) {
                this.stopRecording();
            }
        }, 1000);
    }
    
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    visualizeRecording() {
        if (!this.analyser || !this.waveformCanvas) return;
        
        const ctx = this.waveformCanvas.getContext('2d');
        const container = this.waveformCanvas.parentElement;
        const width = this.waveformCanvas.width = container.offsetWidth * (window.devicePixelRatio || 1);
        const height = this.waveformCanvas.height = container.offsetHeight * (window.devicePixelRatio || 1);
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            if (!this.isRecording) return;
            
            this.visualizationInterval = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(dataArray);
            
            // Clear canvas
            ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
            ctx.fillRect(0, 0, container.offsetWidth, container.offsetHeight);
            
            // Draw bars
            const barWidth = (container.offsetWidth / bufferLength) * 2.5;
            let barHeight;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                barHeight = (dataArray[i] / 255) * container.offsetHeight;
                
                // Create gradient
                const gradient = ctx.createLinearGradient(0, container.offsetHeight - barHeight, 0, container.offsetHeight);
                gradient.addColorStop(0, '#2563eb');
                gradient.addColorStop(1, '#7c3aed');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, container.offsetHeight - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        };
        
        draw();
    }
    
    async analyzeRecording(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            
            const response = await fetch('https://voice-assisted-diagnosis.onrender.com/analyze', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error('Analysis failed');
            }
            
            const result = await response.json();
            this.displayResults(result);
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.displayError();
        }
    }
    
    displayResults(result) {
        // Update risk indicator
        const riskPercentage = Math.round(result.risk_score * 100);
        this.riskValue.textContent = `${riskPercentage}%`;
        
        // Animate progress circle
        const circumference = 534;
        const offset = circumference - (riskPercentage / 100) * circumference;
        this.riskProgress.style.strokeDashoffset = offset;
        
        // Set risk level and color
        let riskLevel, riskColor, description;
        
        if (riskPercentage > 70) {
            riskLevel = 'High Risk';
            riskColor = '#dc2626';
            description = 'Significant vocal biomarkers detected. Clinical evaluation recommended.';
        } else if (riskPercentage > 40) {
            riskLevel = 'Moderate Risk';
            riskColor = '#f59e0b';
            description = 'Moderate vocal biomarkers detected. Consider follow-up monitoring.';
        } else {
            riskLevel = 'Low Risk';
            riskColor = '#059669';
            description = 'Minimal vocal biomarkers detected. Continue regular monitoring.';
        }
        
        this.riskLevel.textContent = riskLevel;
        this.riskLevel.style.color = riskColor;
        this.riskDescription.textContent = description;
        this.riskProgress.style.stroke = riskColor;
        
        // Update feature values
        if (result.features) {
            this.jitterValue.textContent = `${(result.features.jitter * 100).toFixed(2)}%`;
            this.shimmerValue.textContent = `${(result.features.shimmer * 100).toFixed(2)}%`;
            this.hnrValue.textContent = `${result.features.hnr.toFixed(1)} dB`;
            this.pitchValue.textContent = `${result.features.pitch_variation.toFixed(1)} Hz`;
            this.featuresCount.textContent = '4 Features';
        }
        
        // Update graph: prefer client-side computed visuals (this.latestVisuals)
        const visuals = this.latestVisuals || {};
        const graphData = (visuals && visuals[this.currentGraph]) || result.waveform_data || [];
        this.updateGraphWithData(graphData);
        
        // Update the result badge to a small colored circle reflecting risk
        if (this.resultBadge) {
            // clear text and apply circle styling class
            this.resultBadge.textContent = '';
            this.resultBadge.classList.add('badge-circle');
            this.resultBadge.style.background = riskColor;
            this.resultBadge.style.boxShadow = `0 0 10px ${riskColor}`;
            this.resultBadge.style.display = 'inline-block';
            this.resultBadge.title = `${riskLevel} (${riskPercentage}%)`;
        }
    }
    
    displayError() {
        this.riskValue.textContent = 'Error';
        this.riskLevel.textContent = 'Analysis Failed';
        this.riskLevel.style.color = '#dc2626';
        this.riskDescription.textContent = 'Unable to analyze recording. Please try again.';
        // Show result badge as a small red circle when an error occurs
        if (this.resultBadge) {
            this.resultBadge.textContent = '';
            this.resultBadge.classList.add('badge-circle');
            this.resultBadge.style.background = '#dc2626';
            this.resultBadge.style.boxShadow = '0 0 10px #dc2626';
            this.resultBadge.style.display = 'inline-block';
            this.resultBadge.title = 'Analysis Error';
        }
        
        // Reset feature values
        this.jitterValue.textContent = '--';
        this.shimmerValue.textContent = '--';
        this.hnrValue.textContent = '--';
        this.pitchValue.textContent = '--';
        this.featuresCount.textContent = '0 Features';
    }
    
    updateGraph() {
        if (!this.graphChart) return;
        
        // Update graph type based on selection
        if (this.currentGraph === 'waveform') {
            this.graphChart.config.type = 'line';
            this.graphChart.options.scales.y.title.text = 'Amplitude';
        } else if (this.currentGraph === 'spectrum') {
            this.graphChart.config.type = 'bar';
            this.graphChart.options.scales.y.title.text = 'Intensity (dB)';
        } else if (this.currentGraph === 'pitch') {
            this.graphChart.config.type = 'line';
            this.graphChart.options.scales.y.title.text = 'Pitch (Hz)';
        }
        
        this.graphChart.update();
    }
    
    updateGraphWithData(data) {
        if (!this.graphChart) return;
        // Defensive: ensure array and numeric values
        let cleaned = Array.isArray(data) ? data.slice() : [];

        // If we have no meaningful data, fall back to random visualization to avoid blank chart
        const allZeros = cleaned.length === 0 || cleaned.every(v => v === 0 || v === null || v === undefined || !isFinite(v));

        // For large arrays (waveform), downsample to a reasonable size for chart performance
        const maxPoints = 800;
        if (cleaned.length > maxPoints) {
            const step = Math.ceil(cleaned.length / maxPoints);
            cleaned = cleaned.filter((_, i) => i % step === 0);
        }

        // Handle different graph types
        let labels = cleaned.map((_, i) => i);
        let datasetData = cleaned;
        let borderColor = '#2563eb';
        let backgroundColor = 'rgba(37, 99, 235, 0.1)';
        let tension = 0.4;

        if (this.currentGraph === 'spectrum') {
            // Expect magnitudes => convert to dB for better visual
            const mags = cleaned.map(v => (v && isFinite(v)) ? Math.max(1e-8, Math.abs(v)) : 1e-8);
            const db = mags.map(m => 20 * Math.log10(m));
            // normalize to 0..100
            const minDb = Math.min(...db);
            const maxDb = Math.max(...db);
            const norm = db.map(v => (v - minDb) / (maxDb - minDb || 1) * 100);
            datasetData = norm;
            borderColor = '#f59e0b';
            backgroundColor = 'rgba(245, 158, 11, 0.15)';
            tension = 0.0;
        } else if (this.currentGraph === 'pitch') {
            // Replace 0 or invalid pitch values with null to break line on unvoiced segments
            datasetData = cleaned.map(v => (v && isFinite(v) && v > 0) ? v : null);
            borderColor = '#7c3aed';
            backgroundColor = 'rgba(124, 58, 237, 0.08)';
            tension = 0.2;
        } else { // waveform
            // scale waveform to visible range
            const maxAbs = Math.max(...cleaned.map(v => Math.abs(v) || 0), 1e-6);
            datasetData = cleaned.map(v => (isFinite(v) ? v / maxAbs * 100 : 0));
            borderColor = '#2563eb';
            backgroundColor = 'rgba(37, 99, 235, 0.1)';
            tension = 0.3;
        }

        // If datasetData is empty or all nulls, provide a small placeholder to avoid Chart errors
        const allNull = datasetData.length === 0 || datasetData.every(v => v === null || v === undefined);
        if (allZeros || allNull) {
            labels = Array.from({length: 100}, (_, i) => i);
            datasetData = Array.from({length: 100}, () => Math.random() * 10);
        }

        const dataset = {
            label: this.currentGraph.charAt(0).toUpperCase() + this.currentGraph.slice(1),
            data: datasetData,
            borderColor,
            backgroundColor,
            borderWidth: 2,
            fill: this.currentGraph === 'waveform',
            tension
        };

        // Apply config and update chart
        this.graphChart.data.labels = labels;
        this.graphChart.data.datasets = [dataset];
        // ensure chart type matches selection
        this.graphChart.config.type = (this.currentGraph === 'spectrum') ? 'bar' : 'line';
        this.graphChart.update();
    }

    updateProgressBar() {
        if (!this.audioPlayer || !this.audioPlayer.duration) return;
        
        const progress = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
        if (this.progressFill) {
            this.progressFill.style.width = progress + '%';
        }
        if (this.progressSlider) {
            this.progressSlider.value = progress;
        }
        if (this.currentTimeDisplay) {
            this.currentTimeDisplay.textContent = this.formatTime(this.audioPlayer.currentTime);
        }
    }

    updateTotalTime() {
        if (!this.audioPlayer) return;
        if (this.totalTimeDisplay) {
            this.totalTimeDisplay.textContent = this.formatTime(this.audioPlayer.duration);
        }
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VoiceAnalysisApp();
});
