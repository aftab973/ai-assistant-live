import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Mic, MicOff, PhoneOff, User, Building2, Calendar, Clock, MessageSquare, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SYSTEM_INSTRUCTION, TOOLS } from '../constants';

export default function LiveAssistant() {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [volume, setVolume] = useState(0);
  const [reconnectCount, setReconnectCount] = useState(0);
  const reconnectCountRef = useRef(0);
  const [transcription, setTranscription] = useState<string>("");
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log(`[ASSISTANT] ${msg}`);
    setLogs(prev => [msg, ...prev].slice(0, 5));
  };

  useEffect(() => {
    if (reconnectCount > 0) {
      addLog(`Reconnection attempt ${reconnectCount} of 3...`);
    }
  }, [reconnectCount]);

  const sessionRef = useRef<any>(null);
  const userInitiatedStop = useRef(false);
  const reconnectTimeoutRef = useRef<any>(null);
  const heartbeatIntervalRef = useRef<any>(null);
  const connectionTimeoutRef = useRef<any>(null);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueue = useRef<Int16Array[]>([]);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isPlaying = useRef(false);

  const nextStartTimeRef = useRef<number>(0);

  const greetingSentRef = useRef(false);

  const startSession = async (isReconnect = false) => {
    addLog(isReconnect ? "Retrying connection..." : "Starting new session...");
    if (status === 'active' && !isReconnect) return;

    try {
      if (!isReconnect) {
        setErrorMessage(null);
        userInitiatedStop.current = false;
        setReconnectCount(0);
        reconnectCountRef.current = 0;
      }

      setStatus('connecting');
      setIsActive(false);
      setDebugInfo("Checking server configuration...");

      const configRes = await fetch('/api/config');
      const configData = await configRes.json();
      console.log("Server config check:", configData);

      if (!configData.hasApiKey) {
        throw new Error("Gemini API Key is missing on the server. Please add GEMINI_API_KEY to the Secrets panel.");
      }

      setDebugInfo(isReconnect ? `Reconnecting (Attempt ${reconnectCountRef.current + 1})...` : "Initializing...");

      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = setTimeout(() => {
        if (status === 'connecting') {
          setErrorMessage("Connection timed out. Please check your internet and try again.");
          stopSession();
        }
      }, 15000);

      if (!isReconnect) {
        audioQueue.current = [];
        isPlaying.current = false;
        nextStartTimeRef.current = 0;
        greetingSentRef.current = false;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      console.log("Starting session. API Key available:", !!apiKey);
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing. Please check your Secrets panel.");
      }

      if (!streamRef.current) {
        setDebugInfo("Requesting microphone access...");
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (!audioContextRef.current) {
        addLog("Setting up AudioContext...");
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Ensure we have a 16kHz context for input, also resumed
      if (!(window as any).inputAudioContext) {
        (window as any).inputAudioContext = new AudioContext({ sampleRate: 16000 });
      }
      if ((window as any).inputAudioContext.state === 'suspended') {
        await (window as any).inputAudioContext.resume();
      }

      const ai = new GoogleGenAI({ apiKey });

      const modelToUse = "gemini-2.5-flash-native-audio-preview-12-2025";

      addLog(`Connecting to model: ${modelToUse}`);
      const sessionPromise = ai.live.connect({
        model: modelToUse,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
          tools: TOOLS,
        },
        callbacks: {
          onopen: () => {
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            addLog("Connection opened successfully!");
            setStatus('active');
            setIsActive(true);
            setDebugInfo("Session Active");
            setReconnectCount(0);
            reconnectCountRef.current = 0;
            setupAudioInput();
            startHeartbeat();

            // Trigger initial greeting only on first connect
            if (!greetingSentRef.current) {
              greetingSentRef.current = true;
              sessionPromise.then(session => {
                try {
                  addLog("Sending initial greeting...");
                  (session as any).send({
                    clientContent: {
                      turns: [{
                        role: 'user',
                        parts: [{ text: "Hello Jitender, please introduce yourself as Ashish sir's assistant and ask for my name. Speak in Hinglish." }]
                      }],
                      turnComplete: true
                    }
                  });
                } catch (e) {
                  console.error("Greeting trigger failed:", e);
                }
              });
            }
          },
          onmessage: async (message) => {
            handleServerMessage(message);
          },
          onclose: () => {
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            addLog("Connection closed.");
            if (!userInitiatedStop.current && reconnectCountRef.current < 3) {
              handleReconnect();
            } else {
              if (reconnectCountRef.current >= 3) {
                setErrorMessage("Connection failed after 3 attempts.");
                setStatus('error');
              }
              stopSession();
            }
          },
          onerror: (err) => {
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            const msg = err.message || JSON.stringify(err);
            addLog(`Error: ${msg}`);

            if (msg.includes("API_KEY_INVALID") || msg.includes("403")) {
              setErrorMessage("API Key Error. Check Secrets.");
              stopSession();
            } else if (!userInitiatedStop.current && reconnectCountRef.current < 3) {
              handleReconnect();
            } else {
              setErrorMessage(`Connection failed: ${msg}`);
              setStatus('error');
              stopSession();
            }
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Failed to start session:", err);
      setErrorMessage(err.message || "Failed to start session.");
      setStatus('error');
      stopSession();
    }
  };

  const handleReconnect = () => {
    if (userInitiatedStop.current) return;

    reconnectCountRef.current += 1;
    setReconnectCount(reconnectCountRef.current);
    setStatus('connecting');
    setIsActive(false);
    setIsAiSpeaking(false);
    setDebugInfo(`Reconnecting (Attempt ${reconnectCountRef.current} of 3)...`);

    // Cleanup only the session-specific parts, keep stream and context
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) { }
      sessionRef.current = null;
    }
    sessionPromiseRef.current = null;

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = setTimeout(() => {
      if (!userInitiatedStop.current) {
        console.log(`Retrying connection... Attempt ${reconnectCountRef.current}`);
        startSession(true);
      }
    }, 3000); // Increased delay to 3s
  };

  const startHeartbeat = () => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = setInterval(() => {
      if (sessionRef.current && status === 'active') {
        // Sending a small silent buffer or just checking connection
        // The audio input already sends data, but this ensures activity if muted
        setDebugInfo(prev => prev.includes("Active") ? "Session Active." : "Session Active");
      }
    }, 30000);
  };

  const setupAudioInput = () => {
    if (!audioContextRef.current || !streamRef.current) return;

    // Use the pre-warmed 16kHz context
    const inputContext = (window as any).inputAudioContext || new AudioContext({ sampleRate: 16000 });
    const source = inputContext.createMediaStreamSource(streamRef.current);
    const processor = inputContext.createScriptProcessor(2048, 1, 1);
    const gainNode = inputContext.createGain();
    gainNode.gain.value = 0;

    processor.onaudioprocess = (e) => {
      if (isMuted) {
        setVolume(0);
        return;
      }
      const inputData = e.inputBuffer.getChannelData(0);

      // Calculate volume for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      setVolume(Math.sqrt(sum / inputData.length));

      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }

      if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
          // Safer base64 conversion
          const uint8 = new Uint8Array(pcmData.buffer);
          let binary = "";
          for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64Data = btoa(binary);

          session.sendRealtimeInput({
            media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
          });
        });
      }
    };

    source.connect(processor);
    processor.connect(gainNode);
    gainNode.connect(inputContext.destination);

    // Store for cleanup
    (processorRef as any).current = { processor, context: inputContext, gainNode };
  };

  const handleServerMessage = async (message: any) => {
    console.log("Live API Message:", message);

    const serverContent = message.serverContent;

    // Handle Interruption
    if (serverContent?.interrupted) {
      console.log("Interruption received");
      setIsAiSpeaking(false);
      audioQueue.current = [];
      activeSourcesRef.current.forEach(s => { try { s.stop(); } catch (e) { } });
      activeSourcesRef.current = [];
      if (audioContextRef.current) nextStartTimeRef.current = audioContextRef.current.currentTime;
      return;
    }

    // Handle Model Turn (AI Speaking/Text)
    if (serverContent?.modelTurn?.parts) {
      const parts = serverContent.modelTurn.parts;
      for (const part of parts) {
        if (part.text) {
          console.log("AI Text:", part.text);
          // Filter out model thinking/reasoning text (contains markdown like **, backticks, etc.)
          const isThinkingText = part.text.includes('**') || part.text.includes('`') ||
            part.text.includes('tool') || part.text.includes('step') ||
            part.text.startsWith('I\'ve determined') || part.text.startsWith('My next');
          if (!isThinkingText) {
            setTranscription(`Jitender: ${part.text}`);
          }
          setIsAiSpeaking(true);
        }
        if (part.inlineData?.data) {
          setIsAiSpeaking(true);
          const binary = atob(part.inlineData.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          audioQueue.current.push(new Int16Array(bytes.buffer));
          processAudioQueue();
        }
      }
    }

    // Handle Turn Complete
    if (serverContent?.turnComplete) {
      setIsAiSpeaking(false);
    }

    // Handle User Transcription (Input)
    // The key might be userContent or userTurn depending on version
    const userParts = serverContent?.userContent?.parts || serverContent?.userTurn?.parts;
    if (userParts) {
      for (const part of userParts) {
        if (part.text) {
          setTranscription(`You: ${part.text}`);
        }
      }
    }

    // Handle Tool Calls
    const toolCall = message.toolCall;
    if (toolCall) {
      console.log("Tool Call received:", toolCall.functionCalls?.length);
      for (const call of toolCall.functionCalls) {
        console.log(`Executing tool: ${call.name}`, call.args);
        const result = await executeTool(call.name, call.args);
        console.log(`Tool result for ${call.name}:`, result);

        if (sessionRef.current) {
          sessionRef.current.sendToolResponse({
            functionResponses: [{
              name: call.name,
              id: call.id,
              response: { result }
            }]
          });
        }
      }
    }

    // Handle Interruption
    if (message.serverContent?.interrupted) {
      console.log("Interruption received, stopping audio...");
      audioQueue.current = [];
      isPlaying.current = false;

      // Stop all currently playing/scheduled sources
      activeSourcesRef.current.forEach(source => {
        try {
          source.stop();
          source.disconnect();
        } catch (e) {
          // Source might have already stopped
        }
      });
      activeSourcesRef.current = [];

      if (audioContextRef.current) {
        nextStartTimeRef.current = audioContextRef.current.currentTime;
      }
    }
  };

  const executeTool = async (name: string, args: any) => {
    try {
      let endpoint = '';
      let method = 'POST';

      switch (name) {
        case 'book_appointment':
          endpoint = '/api/appointments';
          break;
        case 'reschedule_appointment':
          endpoint = '/api/appointments';
          method = 'PATCH';
          break;
        case 'cancel_appointment':
          endpoint = '/api/appointments';
          method = 'DELETE';
          break;
        case 'check_availability':
          const res = await fetch(`/api/availability?date=${args.date}&time=${args.time}`);
          return await res.json();
        case 'take_message':
          endpoint = '/api/messages';
          break;
      }

      if (endpoint) {
        const res = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args)
        });
        const data = await res.json();

        // Dispatch event to refresh dashboard
        window.dispatchEvent(new CustomEvent('data-updated'));

        return data;
      }
    } catch (err) {
      console.error(`Tool execution error (${name}):`, err);
      return { error: "Failed to execute action" };
    }
  };

  const processAudioQueue = async () => {
    if (audioQueue.current.length === 0 || !audioContextRef.current) {
      return;
    }

    // Process all available chunks in the queue
    while (audioQueue.current.length > 0 && audioContextRef.current) {
      const pcmData = audioQueue.current.shift()!;
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) floatData[i] = pcmData[i] / 0x7FFF;

      const buffer = audioContextRef.current.createBuffer(1, floatData.length, 24000);
      buffer.getChannelData(0).set(floatData);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);

      const currentTime = audioContextRef.current.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime + 0.05; // Small buffer
      }

      source.start(nextStartTimeRef.current);

      // Track the source so we can stop it if interrupted
      activeSourcesRef.current.push(source);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      };

      nextStartTimeRef.current += buffer.duration;
    }
  };

  const stopSession = () => {
    console.log("Stopping session and cleaning up...");
    userInitiatedStop.current = true;
    setIsActive(false);
    setIsAiSpeaking(false);
    setStatus('idle');
    setDebugInfo("");
    setReconnectCount(0);
    reconnectCountRef.current = 0;
    setTranscription("");

    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    if (processorRef.current) {
      try {
        const p = (processorRef as any).current;
        if (p && p.processor) p.processor.disconnect();
        if (p && p.gainNode) p.gainNode.disconnect();
        if (p && p.context) {
          p.context.close();
          if ((window as any).inputAudioContext === p.context) {
            (window as any).inputAudioContext = null;
          }
        }
      } catch (e) {
        console.error("Error cleaning up processor:", e);
      }
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.error("Error closing audio context:", e);
      }
      audioContextRef.current = null;
    }

    audioQueue.current = [];
    activeSourcesRef.current.forEach(s => {
      try { s.stop(); s.disconnect(); } catch (e) { }
    });
    activeSourcesRef.current = [];
    isPlaying.current = false;
    sessionRef.current = null;
    sessionPromiseRef.current = null;
  };

  useEffect(() => {
    return () => {
      userInitiatedStop.current = true;
      stopSession();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-white/50 backdrop-blur-sm rounded-3xl border border-black/5 shadow-xl">
      <div className="relative mb-8">
        <AnimatePresence mode="wait">
          {isActive ? (
            <motion.div
              key="active"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex items-center justify-center"
            >
              <div className="relative">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute inset-0 bg-emerald-400 rounded-full blur-2xl"
                />
                <div className="relative z-10 w-32 h-32 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200 overflow-hidden">
                  <Mic className="w-12 h-12 text-white relative z-20" />
                  {/* Volume Visualizer Overlay */}
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 bg-white/30 z-10"
                    animate={{ height: `${Math.min(100, volume * 300)}%` }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 cursor-pointer hover:bg-slate-200 transition-colors"
              onClick={startSession}
            >
              <Mic className="w-12 h-12 text-slate-400" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-slate-800">
          {isActive ? (isAiSpeaking ? "Jitender is speaking..." : "Jitender is listening...") : "Talk to Jitender"}
        </h2>

        {transcription && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm text-slate-600 italic max-w-xs mx-auto"
          >
            {transcription}
          </motion.div>
        )}

        <p className="text-slate-500 max-w-xs mx-auto">
          {isActive
            ? "Ask him to book a meeting, check availability, or leave a message for Ashish sir."
            : "Click the microphone to start a conversation with Ashish sir's assistant."}
        </p>
      </div>

      <div className="mt-8 flex gap-4">
        {isActive && (
          <>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`p-4 rounded-2xl transition-all ${isMuted ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button
              onClick={stopSession}
              className="p-4 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all shadow-lg shadow-red-200"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </>
        )}
      </div>

      {status === 'connecting' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 text-emerald-600 font-medium flex flex-col items-center gap-1"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            Connecting to Jitender...
          </div>
          {reconnectCount > 0 && (
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Attempt {reconnectCount} of 3
            </span>
          )}
        </motion.div>
      )}

      {status === 'error' && (
        <div className="flex flex-col items-center gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-red-500 font-medium text-sm text-center px-4"
          >
            {errorMessage || "Something went wrong. Please try again."}
          </motion.div>
          <button
            onClick={() => {
              stopSession();
              setTimeout(startSession, 500);
            }}
            className="px-6 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-all text-sm font-medium"
          >
            Try Again
          </button>
        </div>
      )}

      {isActive && debugInfo && (
        <div className="mt-4 text-[10px] text-slate-400 font-mono uppercase tracking-widest">
          {debugInfo}
        </div>
      )}

      {/* Visual Debug Logs */}
      <div className="mt-8 w-full max-w-xs bg-slate-900 rounded-xl p-3 font-mono text-[10px] text-emerald-400 overflow-hidden">
        <div className="flex justify-between items-center mb-2 border-b border-emerald-900/50 pb-1">
          <span className="text-emerald-500/50 uppercase tracking-tighter">System Logs</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          </div>
        </div>
        <div className="space-y-1">
          {logs.map((log, i) => (
            <div key={i} className={i === 0 ? "opacity-100" : "opacity-40"}>
              {`> ${log}`}
            </div>
          ))}
          {logs.length === 0 && <div className="opacity-20 italic">Waiting for activity...</div>}
        </div>
      </div>
    </div>
  );
}
