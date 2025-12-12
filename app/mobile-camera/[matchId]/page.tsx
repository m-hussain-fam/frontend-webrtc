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

  useEffect(() => {
    const urlCam = Number(searchParams.get("cameraId")) || 1;
    setCameraId(urlCam);

    const SIGNAL_URL = "https://signaling-server-2-production.up.railway.app";

    socket.current = io(SIGNAL_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true
    });

    // ---- SOCKET EVENTS ----
    socket.current.on("connect", () => {
      console.log('✅ Mobile connected - Socket ID:', socket.current.id);
      toast.success("✅ Connected to server");
    });

    socket.current.on("disconnect", () => {
      console.log('❌ Mobile disconnected');
      setStatus({ status: "waiting", message: "Disconnected. Reconnecting..." });
    });

    socket.current.on("connect_error", (e: any) => {
      console.error('❌ Connection error:', e);
      toast.error("❌ Socket connection error");
    });

    // ---- OFFER FROM ADMIN ----
    socket.current.on("webrtc-offer", async (data: any) => {
      console.log('📨 Received offer from Admin:', data.from);
      console.log('   - Camera ID:', data.cameraId);
      
      // SAVE ADMIN ID FOR ICE ROUTING
      adminIdRef.current = data.from;
      console.log('💾 Saved admin ID:', adminIdRef.current);
      
      if (!pc.current) {
        console.error('❌ PeerConnection not initialized');
        return;
      }
      if (!localStream.current) {
        console.error('❌ Local stream not available');
        return;
      }

      try {
        console.log('📍 Setting remote description...');
        await pc.current.setRemoteDescription(data.offer);

        console.log('🎬 Creating answer...');
        const answer = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answer);

        console.log('📤 Sending answer to:', data.from);
        socket.current.emit("webrtc-answer", {
          to: data.from,
          answer,
          cameraId: data.cameraId
        });

        console.log('✅ Answer sent successfully');
        setStatus({ status: "connecting", message: "Answer sent, waiting for ICE..." });

      } catch (err) {
        console.error("❌ Offer handling error →", err);
        setStatus({ status: "error", message: "Offer handling failed" });
      }
    });

    // ---- ICE CANDIDATES FROM ADMIN ----
    socket.current.on("ice-candidate", (data: any) => {
      console.log('📥 Received ICE candidate from admin');
      console.log('   - Data:', data);
      
      if (!pc.current) {
        console.error('❌ PeerConnection not available');
        return;
      }
      
      if (!data?.candidate) {
        console.error('❌ Candidate field missing in data');
        return;
      }

      try {
        console.log('🧊 Adding ICE candidate...');
        pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log('✅ ICE candidate added');
      } catch (err) {
        console.error('❌ Error adding ICE candidate:', err);
      }
    });

    // ---- ADMIN LEFT ----
    socket.current.on("admin-disconnected", () => {
      console.log('👋 Admin disconnected');
      setStatus({ status: "waiting", message: "Admin disconnected" });
      adminIdRef.current = null;
    });

    // Start stream
    setTimeout(() => startCamera(urlCam), 300);

    return () => {
      socket.current?.disconnect();
      pc.current?.close();
      localStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // --------------------------
  // START CAMERA + CREATE PC
  // --------------------------
  const startCamera = async (camId: number) => {
    try {
      console.log('📹 Starting camera for camera ID:', camId);
      setStatus({ status: "connecting", message: "Accessing camera..." });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
        audio: true
      });

      console.log('✅ Camera granted');
      localStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      console.log('🔗 Creating PeerConnection...');
      pc.current = new RTCPeerConnection({ iceServers: STUN_SERVERS });

      console.log('📤 Adding tracks...');
      stream.getTracks().forEach((t) => {
        console.log('   - Adding track:', t.kind);
        pc.current!.addTrack(t, stream);
      });

      // ICE SENDING
      pc.current.onicecandidate = (e) => {
        if (e.candidate) {
          if (!adminIdRef.current) {
            console.warn('⚠️ Admin ID not set, cannot send ICE candidate');
            return;
          }

          console.log('🧊 Emitting ICE candidate to admin:', adminIdRef.current);
          socket.current.emit("ice-candidate", {
            to: adminIdRef.current,  // ✅ FIXED: Include admin ID
            candidate: e.candidate,
            cameraId: camId
          });
        }
      };

      // CONNECTION STATE
      pc.current.onconnectionstatechange = () => {
        if (!pc.current) return;
        const state = pc.current.connectionState;
        console.log('📡 Connection state changed:', state);

        if (state === "connected") {
          console.log('✅ WebRTC CONNECTED!');
          setStatus({ status: "connected", message: "Streaming live 🎥" });
        } else if (state === "failed") {
          console.error('❌ Connection failed');
          setStatus({ status: "error", message: "Connection failed" });
        } else if (state === "disconnected") {
          console.warn('⚠️ Connection disconnected');
          setStatus({ status: "waiting", message: "Disconnected" });
        }
      };

      // ICE CONNECTION STATE
      pc.current.oniceconnectionstatechange = () => {
        if (!pc.current) return;
        console.log('🧊 ICE connection state:', pc.current.iceConnectionState);
      };

      // JOIN ROOM
      console.log('🚪 Joining room...');
      socket.current.emit("join-room", {
        matchId,
        role: "broadcaster",
        cameraId: camId
      });

      console.log('⏳ Waiting for admin offer...');
      setStatus({ status: "waiting", message: "Waiting for admin..." });

    } catch (err: any) {
      console.error('❌ Camera error:', err);
      setStatus({
        status: "error",
        message: err.message || "Camera error"
      });
    }
  };

  // UI THEMES
  const ui = {
    waiting: "yellow",
    connecting: "blue",
    connected: "green",
    error: "red"
  }[status.status];

  return (
    <div className="text-white bg-black min-h-screen p-4">
      <Toaster richColors />

      <h1 className="text-3xl font-bold mb-4">📱 Camera {cameraId}</h1>

      <div className={`relative rounded-lg border-4 border-${ui}-500 mt-4 aspect-square overflow-hidden bg-gray-900`}>
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

        {status.status !== "connected" && (
          <div className="absolute inset-0 bg-black/60 flex flex-col justify-center items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-700 border-t-yellow-500 mb-4"></div>
            <p className="text-center font-semibold">{status.message}</p>
          </div>
        )}

        {/* Status Badge */}
        <div className="absolute top-3 right-3 bg-black/70 rounded px-3 py-2 flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full bg-${ui}-500`}></div>
          <span className="text-xs font-medium">{status.status}</span>
        </div>
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-gray-900 rounded-lg">
        <p className="text-xs text-gray-400">Match: {matchId}</p>
        <p className="text-xs text-gray-400">Status: {status.message}</p>
        <p className="text-xs text-gray-400">Admin ID: {adminIdRef.current?.substring(0, 8) || 'waiting...'}</p>
      </div>
    </div>
  );
}