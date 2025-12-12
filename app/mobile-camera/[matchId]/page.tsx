'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import io from 'socket.io-client';
import { Toaster, toast } from 'sonner';

interface ConnectionStatus {
  status: 'waiting' | 'connecting' | 'connected' | 'error';
  message: string;
}

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export default function MobileCamera() {
  const params = useParams();
  const searchParams = useSearchParams();
  const matchId = params.matchId as string;

  const [cameraId, setCameraId] = useState(1);
  const [status, setStatus] = useState<ConnectionStatus>({
    status: 'waiting',
    message: 'Initializing...',
  });

  const socket = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const adminIdRef = useRef<string | null>(null);
  const iceCounterRef = useRef<number>(0);

  useEffect(() => {
    const urlCam = Number(searchParams.get("cameraId")) || 1;
    setCameraId(urlCam);

    console.log('\n════════════════════════════════════');
    console.log('🎬 MOBILE CAMERA STARTUP');
    console.log('════════════════════════════════════');
    console.log('Match ID:', matchId);
    console.log('Camera ID:', urlCam);
    console.log('Timestamp:', new Date().toLocaleTimeString());

    const SIGNAL_URL = "https://signaling-server-2-production.up.railway.app";

    socket.current = io(SIGNAL_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // ────────────────────────────────────────
    // SOCKET EVENTS
    // ────────────────────────────────────────

    socket.current.on("connect", () => {
      console.log('\n✅ SOCKET CONNECTED');
      console.log('Socket ID:', socket.current.id);
      toast.success("✅ Connected to server");
    });

    socket.current.on("disconnect", () => {
      console.log('\n❌ SOCKET DISCONNECTED');
      setStatus({ status: "waiting", message: "Disconnected. Reconnecting..." });
      toast.error("❌ Disconnected from server");
    });

    socket.current.on("connect_error", (e: any) => {
      console.error('\n❌ CONNECTION ERROR:', e);
      toast.error("❌ Connection error");
    });

    // ────────────────────────────────────────
    // WEBRTC OFFER FROM ADMIN
    // ────────────────────────────────────────

    socket.current.on("webrtc-offer", async (data: any) => {
      console.log('\n────────────────────────────────────');
      console.log('📨 RECEIVED WebRTC OFFER');
      console.log('────────────────────────────────────');
      console.log('From (Admin):', data.from);
      console.log('Camera ID:', data.cameraId);
      
      adminIdRef.current = data.from;
      iceCounterRef.current = 0;
      console.log('💾 Saved Admin ID:', adminIdRef.current);
      
      if (!pc.current) {
        console.error('❌ PeerConnection not initialized');
        toast.error("❌ Connection error - PC not ready");
        return;
      }

      if (!localStream.current) {
        console.error('❌ Local stream not available');
        toast.error("❌ Stream error");
        return;
      }

      try {
        console.log('📍 Setting remote description...');
        await pc.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        console.log('✅ Remote description set');

        console.log('🎬 Creating answer...');
        const answer = await pc.current.createAnswer();
        console.log('✅ Answer created');
        console.log('   Type:', answer.type);
        console.log('   SDP length:', answer.sdp?.length);

        await pc.current.setLocalDescription(answer);
        console.log('✅ Local description set (answer)');

        console.log('📤 Sending answer to admin...');
        socket.current.emit("webrtc-answer", {
          to: data.from,
          answer: answer,
          cameraId: data.cameraId
        });

        console.log('✅ Answer sent');
        setStatus({ status: "connecting", message: "Answer sent, waiting for ICE..." });
        toast.success("✅ Answer sent to admin");

      } catch (err) {
        console.error("❌ ERROR handling offer →", err);
        setStatus({ status: "error", message: "Offer handling failed" });
        toast.error("❌ Offer handling failed");
      }
    });

    // ────────────────────────────────────────
    // ICE CANDIDATES FROM ADMIN
    // ────────────────────────────────────────

    socket.current.on("ice-candidate", (data: any) => {
      console.log('\n📥 RECEIVED ICE Candidate');
      console.log('From:', data.from?.substring(0, 8) + '...');
      console.log('Has candidate:', !!data?.candidate);
      
      if (!pc.current) {
        console.error('❌ PeerConnection not available');
        return;
      }
      
      if (!data?.candidate) {
        console.error('❌ Candidate field missing');
        return;
      }

      try {
        pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log('✅ ICE candidate added');
      } catch (err) {
        console.error('❌ Error adding ICE candidate:', err);
      }
    });

    // ────────────────────────────────────────
    // ADMIN EVENTS
    // ────────────────────────────────────────

    socket.current.on("admin-disconnected", () => {
      console.log('\n👋 ADMIN DISCONNECTED');
      setStatus({ status: "waiting", message: "Admin disconnected" });
      toast.warning("⚠️ Admin disconnected");
      adminIdRef.current = null;
    });

    socket.current.on("admin-joined", (data: any) => {
      console.log('\n✅ ADMIN JOINED');
      console.log('Admin ID:', data.adminId?.substring(0, 8) + '...');
      toast.success("✅ Admin connected!");
    });

    // Start camera setup
    setTimeout(() => startCamera(urlCam), 500);

    return () => {
      console.log('\n🧹 CLEANUP: Disconnecting...');
      socket.current?.disconnect();
      pc.current?.close();
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [matchId]);

  // ────────────────────────────────────────
  // START CAMERA & SETUP PeerConnection
  // ────────────────────────────────────────

  const startCamera = async (camId: number) => {
    try {
      console.log('\n════════════════════════════════════');
      console.log('📹 CAMERA SETUP START');
      console.log('════════════════════════════════════');
      
      setStatus({ status: "connecting", message: "Accessing camera..." });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
        audio: true
      });

      console.log('✅ CAMERA GRANTED');
      console.log('Video tracks:', stream.getVideoTracks().length);
      console.log('Audio tracks:', stream.getAudioTracks().length);

      localStream.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log('✅ Video element updated');
      }

      console.log('\n🔗 Creating PeerConnection...');
      pc.current = new RTCPeerConnection({ 
        iceServers: STUN_SERVERS,
      });

      console.log('✅ PeerConnection created');

      console.log('📤 Adding tracks to stream...');
      stream.getTracks().forEach((t) => {
        console.log('   - Track:', t.kind, `(${t.label})`);
        pc.current!.addTrack(t, stream);
      });
      console.log('✅ All tracks added');

      // ════════════════════════════════════════════════
      // ICE CANDIDATE HANDLING
      // ════════════════════════════════════════════════

      pc.current.onicecandidate = (e) => {
        if (e.candidate) {
          iceCounterRef.current++;
          console.log(`\n🧊 ICE Candidate #${iceCounterRef.current}`);
          console.log('   To (Admin):', adminIdRef.current?.substring(0, 8) + '...' || 'NOT YET SET');
          console.log('   Type:', e.candidate.candidate?.split(' ')[7]);

          socket.current.emit("ice-candidate", {
            to: adminIdRef.current,
            candidate: e.candidate,
            cameraId: camId,
            matchId: matchId
          });

          console.log('   ✅ Emitted to server');
        } else {
          console.log('\n🧊 ICE gathering completed');
          console.log(`   Total candidates: ${iceCounterRef.current}`);
        }
      };

      // ════════════════════════════════════════════════
      // CONNECTION STATE CHANGES
      // ════════════════════════════════════════════════

      pc.current.onconnectionstatechange = () => {
        if (!pc.current) return;
        const state = pc.current.connectionState;
        console.log('\n📡 CONNECTION STATE CHANGED:', state);

        if (state === "connected") {
          console.log('✅ ✅ ✅ WebRTC FULLY CONNECTED!');
          console.log('Video streaming active!');
          setStatus({ status: "connected", message: "🎥 Streaming live" });
          toast.success("✅ WebRTC Connected - Streaming!");
        } else if (state === "failed") {
          console.error('❌ Connection FAILED');
          setStatus({ status: "error", message: "Connection failed" });
          toast.error("❌ Connection failed");
        } else if (state === "disconnected") {
          console.warn('⚠️ Connection DISCONNECTED');
          setStatus({ status: "waiting", message: "Disconnected" });
        }
      };

      pc.current.oniceconnectionstatechange = () => {
        if (!pc.current) return;
        console.log('🧊 ICE Connection State:', pc.current.iceConnectionState);
      };

      pc.current.onsignalingstatechange = () => {
        if (!pc.current) return;
        console.log('🔄 Signaling State:', pc.current.signalingState);
      };

      // ════════════════════════════════════════════════
      // JOIN ROOM
      // ════════════════════════════════════════════════

      console.log('\n🚪 JOINING ROOM');
      console.log('Match ID:', matchId);
      console.log('Role: broadcaster');
      console.log('Camera ID:', camId);

      socket.current.emit("join-room", {
        matchId,
        role: "broadcaster",
        cameraId: camId
      });

      console.log('✅ Join-room event emitted');
      console.log('⏳ Waiting for admin offer...\n');

      setStatus({ status: "waiting", message: "Waiting for admin to connect..." });
      toast.info("⏳ Waiting for admin...", { duration: 2000 });

    } catch (err: any) {
      console.error('\n❌ CAMERA ERROR');
      console.error('Name:', err.name);
      console.error('Message:', err.message);

      const errorMsg = err.name === 'NotAllowedError' 
        ? 'Camera permission denied'
        : err.name === 'NotFoundError'
        ? 'No camera found'
        : err.message || 'Camera error';

      setStatus({ status: "error", message: errorMsg });
      toast.error("❌ Camera Error", { description: errorMsg });
    }
  };

  // ────────────────────────────────────────
  // UI
  // ────────────────────────────────────────

  const colorMap = {
    waiting: { border: "border-yellow-500", indicator: "bg-yellow-500" },
    connecting: { border: "border-blue-500", indicator: "bg-blue-500" },
    connected: { border: "border-green-500", indicator: "bg-green-500" },
    error: { border: "border-red-500", indicator: "bg-red-500" }
  };

  const colors = colorMap[status.status];

  return (
    <div className="text-white bg-black min-h-screen p-4 md:p-6">
      <Toaster richColors theme="dark" />

      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">📱 Camera {cameraId}</h1>
        <p className="text-sm text-gray-400">Match: {matchId}</p>
      </div>

      {/* VIDEO CONTAINER */}
      <div className={`relative rounded-lg border-4 ${colors.border} aspect-square overflow-hidden bg-gray-900 mb-6 max-w-2xl transition-all duration-300`}>
        <video 
          ref={videoRef} 
          autoPlay 
          muted 
          playsInline 
          className="w-full h-full object-cover" 
        />

        {/* LOADING OVERLAY */}
        {status.status !== "connected" && (
          <div className="absolute inset-0 bg-black/60 flex flex-col justify-center items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-700 border-t-yellow-500 mb-4"></div>
            <p className="text-center font-semibold text-lg">{status.message}</p>
          </div>
        )}

        {/* STATUS BADGE */}
        <div className="absolute top-3 right-3 bg-black/80 backdrop-blur rounded px-3 py-2 flex items-center gap-2 border border-gray-700">
          <div className={`w-3 h-3 rounded-full ${colors.indicator} ${status.status === 'connecting' ? 'animate-pulse' : ''}`}></div>
          <span className="text-xs font-medium capitalize">{status.status}</span>
        </div>

        {/* CAMERA LABEL */}
        <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur rounded px-4 py-2 border border-gray-700">
          <p className="text-sm font-bold">Camera {cameraId}</p>
        </div>
      </div>

      {/* STATUS PANEL */}
      <div className="max-w-2xl p-4 bg-gray-900/80 backdrop-blur rounded-lg border border-gray-800">
        <h3 className="text-sm font-bold mb-4">📊 Connection Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-gray-400">Status</p>
            <p className={`font-bold capitalize ${
              status.status === 'waiting' ? 'text-yellow-400' :
              status.status === 'connecting' ? 'text-blue-400' :
              status.status === 'connected' ? 'text-green-400' :
              'text-red-400'
            }`}>{status.status}</p>
          </div>
          <div>
            <p className="text-gray-400">Camera</p>
            <p className="font-bold">{cameraId}</p>
          </div>
          <div>
            <p className="text-gray-400">Admin</p>
            <p className="font-mono text-xs">{adminIdRef.current?.substring(0, 8) || 'waiting...'}</p>
          </div>
          <div>
            <p className="text-gray-400">Message</p>
            <p className="text-xs truncate">{status.message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}