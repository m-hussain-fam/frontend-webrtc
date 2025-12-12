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
  const pendingOfferRef = useRef<any>(null); // <-- Queue offers if PC not ready

  useEffect(() => {
    const urlCam = Number(searchParams.get("cameraId")) || 1;
    setCameraId(urlCam);

    console.log('\n🎬 MOBILE CAMERA STARTUP');
    console.log('Match ID:', matchId);
    console.log('Camera ID:', urlCam);

    const SIGNAL_URL = "https://signaling-server-2-production.up.railway.app";

    socket.current = io(SIGNAL_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // ───────── SOCKET EVENTS ─────────

    socket.current.on("connect", () => {
      console.log('✅ SOCKET CONNECTED');
      console.log('Socket ID:', socket.current.id);
      toast.success("✅ Connected to server");
    });

    socket.current.on("disconnect", () => {
      console.log('❌ SOCKET DISCONNECTED');
      setStatus({ status: "waiting", message: "Disconnected. Reconnecting..." });
      toast.error("❌ Disconnected from server");
    });

    socket.current.on("connect_error", (e: any) => {
      console.error('❌ CONNECTION ERROR:', e);
      toast.error("❌ Connection error");
    });

    // ───────── WEBRTC OFFER FROM ADMIN ─────────

    socket.current.on("webrtc-offer", async (data: any) => {
      console.log('📨 RECEIVED WebRTC OFFER', data.cameraId);

      if (!pc.current || !localStream.current) {
        console.log('⏳ PeerConnection or localStream not ready, queuing offer');
        pendingOfferRef.current = data;
        return;
      }

      await handleOffer(data);
    });

    // ───────── ICE CANDIDATES FROM ADMIN ─────────

    socket.current.on("ice-candidate", (data: any) => {
      console.log('📥 RECEIVED ICE Candidate');
      console.log('From:', data.from?.substring(0, 8) + '...');
      
      if (!pc.current || !data?.candidate) return;

      try {
        pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log('✅ ICE candidate added');
      } catch (err) {
        console.error('❌ Error adding ICE candidate:', err);
      }
    });

    // ───────── ADMIN EVENTS ─────────

    socket.current.on("admin-disconnected", () => {
      console.log('👋 ADMIN DISCONNECTED');
      setStatus({ status: "waiting", message: "Admin disconnected" });
      toast.warning("⚠️ Admin disconnected");
      adminIdRef.current = null;
    });

    socket.current.on("admin-joined", (data: any) => {
      console.log('✅ ADMIN JOINED');
      console.log('Admin ID:', data.adminId?.substring(0, 8) + '...');
      toast.success("✅ Admin connected!");
    });

    // Start camera setup
    setTimeout(() => startCamera(urlCam), 500);

    return () => {
      console.log('🧹 CLEANUP: Disconnecting...');
      socket.current?.disconnect();
      pc.current?.close();
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [matchId]);

  // ───────── HANDLE OFFER ─────────
  const handleOffer = async (data: any) => {
    adminIdRef.current = data.from;
    iceCounterRef.current = 0;

    try {
      console.log('📍 Setting remote description...');
      await pc.current!.setRemoteDescription(new RTCSessionDescription(data.offer));
      console.log('✅ Remote description set');

      console.log('🎬 Creating answer...');
      const answer = await pc.current!.createAnswer();
      await pc.current!.setLocalDescription(answer);

      socket.current!.emit("webrtc-answer", {
        to: data.from,
        answer,
        cameraId: data.cameraId
      });

      console.log('✅ Answer sent');
      setStatus({ status: "connecting", message: "Answer sent, waiting for ICE..." });
    } catch (err) {
      console.error("❌ Error handling offer:", err);
      setStatus({ status: "error", message: "Offer handling failed" });
    }
  };

  // ───────── START CAMERA ─────────
  const startCamera = async (camId: number) => {
    try {
      setStatus({ status: "connecting", message: "Accessing camera..." });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "environment" },
        audio: true
      });

      localStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      // Create PeerConnection
      pc.current = new RTCPeerConnection({ iceServers: STUN_SERVERS });

      // Add tracks
      stream.getTracks().forEach((t) => pc.current!.addTrack(t, stream));

      // ICE candidate handler
      pc.current.onicecandidate = (e) => {
        if (e.candidate) {
          iceCounterRef.current++;
          socket.current.emit("ice-candidate", {
            to: adminIdRef.current,
            candidate: e.candidate,
            cameraId: camId,
            matchId
          });
        }
      };

      pc.current.onconnectionstatechange = () => {
        if (!pc.current) return;
        const state = pc.current.connectionState;
        if (state === "connected") setStatus({ status: "connected", message: "🎥 Streaming live" });
        else if (state === "failed") setStatus({ status: "error", message: "Connection failed" });
        else if (state === "disconnected") setStatus({ status: "waiting", message: "Disconnected" });
      };

      // Process pending offer if any
      if (pendingOfferRef.current) {
        console.log('⏳ Processing queued offer');
        await handleOffer(pendingOfferRef.current);
        pendingOfferRef.current = null;
      }

      // Join room
      socket.current.emit("join-room", {
        matchId,
        role: "broadcaster",
        cameraId: camId
      });

      setStatus({ status: "waiting", message: "Waiting for admin to connect..." });
    } catch (err: any) {
      console.error('❌ CAMERA ERROR:', err);
      const errorMsg = err.name === 'NotAllowedError'
        ? 'Camera permission denied'
        : err.name === 'NotFoundError'
        ? 'No camera found'
        : err.message || 'Camera error';
      setStatus({ status: "error", message: errorMsg });
      toast.error("❌ Camera Error", { description: errorMsg });
    }
  };

  // ───────── UI ─────────
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

      <div className="mb-6">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">📱 Camera {cameraId}</h1>
        <p className="text-sm text-gray-400">Match: {matchId}</p>
      </div>

      <div className={`relative rounded-lg border-4 ${colors.border} aspect-square overflow-hidden bg-gray-900 mb-6 max-w-2xl transition-all duration-300`}>
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
        {status.status !== "connected" && (
          <div className="absolute inset-0 bg-black/60 flex flex-col justify-center items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-700 border-t-yellow-500 mb-4"></div>
            <p className="text-center font-semibold text-lg">{status.message}</p>
          </div>
        )}
        <div className="absolute top-3 right-3 bg-black/80 backdrop-blur rounded px-3 py-2 flex items-center gap-2 border border-gray-700">
          <div className={`w-3 h-3 rounded-full ${colors.indicator} ${status.status === 'connecting' ? 'animate-pulse' : ''}`}></div>
          <span className="text-xs font-medium capitalize">{status.status}</span>
        </div>
      </div>
    </div>
  );
}
