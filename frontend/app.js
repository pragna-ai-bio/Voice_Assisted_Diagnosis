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
        this.stopBtn = document.getElementById('stop-btn');
        this.playBtn = document.getElementById('play-btn');
        this.timerDisplay = document.getElementById('timer');
        this.audioPlayer = document.getElementById('audio-player');
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
    }
    
    initEventListeners() {
        // Recording Controls
        this.recordBtn.addEventListener('click', () => this.startRecording());
        this.stopBtn.addEventListener('click', () => this.stopRecording());
        this.playBtn.addEventListener('click', () => this.audioPlayer.play());
        
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
            const response = await fetch('http://localhost:8000/health');
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
            this.recordBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.resultBadge.textContent = 'Recording';
            this.resultBadge.style.color = '#f59e0b';
            
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
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Update UI
            this.recordBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.resultBadge.textContent = 'Processing...';
            
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
        const width = this.waveformCanvas.width = this.waveformCanvas.offsetWidth;
        const height = this.waveformCanvas.height = this.waveformCanvas.offsetHeight;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            if (!this.isRecording) return;
            
            this.visualizationInterval = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(dataArray);
            
            // Clear canvas
            ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
            ctx.fillRect(0, 0, width, height);
            
            // Draw bars
            const barWidth = (width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                barHeight = (dataArray[i] / 255) * height;
                
                // Create gradient
                const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
                gradient.addColorStop(0, '#2563eb');
                gradient.addColorStop(1, '#7c3aed');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x, height - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        };
        
        draw();
    }
    
    async analyzeRecording(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            
            const response = await fetch('http://localhost:8000/analyze', {
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
        
        // Update graph
        this.updateGraphWithData(result.waveform_data || []);
        
        // Update result badge
        this.resultBadge.textContent = riskLevel;
        this.resultBadge.style.color = riskColor;
    }
    
    displayError() {
        this.riskValue.textContent = 'Error';
        this.riskLevel.textContent = 'Analysis Failed';
        this.riskLevel.style.color = '#dc2626';
        this.riskDescription.textContent = 'Unable to analyze recording. Please try again.';
        this.resultBadge.textContent = 'Error';
        this.resultBadge.style.color = '#dc2626';
        
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
        
        const labels = Array.from({length: data.length || 100}, (_, i) => i);
        const dataset = {
            label: this.currentGraph.charAt(0).toUpperCase() + this.currentGraph.slice(1),
            data: data.length > 0 ? data : Array.from({length: 100}, () => Math.random() * 100),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
        };
        
        this.graphChart.data.labels = labels;
        this.graphChart.data.datasets = [dataset];
        this.graphChart.update();
    }
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VoiceAnalysisApp();
});
