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

  useEffect(() => {
    const urlCam = Number(searchParams.get("cameraId")) || 1;
    setCameraId(urlCam);

    const SIGNAL_URL = "https://signaling-server-2-production.up.railway.app";

    socket.current = io(SIGNAL_URL, {
      transports: ['websocket'],
      reconnection: true
    });

    // ---- SOCKET EVENTS ----
    socket.current.on("connect", () => {
      toast.success("Connected to server");
    });

    socket.current.on("disconnect", () => {
      setStatus({ status: "waiting", message: "Disconnected. Reconnecting..." });
    });

    socket.current.on("connect_error", (e: any) => {
      toast.error("Socket connection error");
    });

    // ---- OFFER FROM ADMIN ----
    socket.current.on("webrtc-offer", async (data: any) => {
      if (!pc.current) return;
      if (!localStream.current) return;

      try {
        await pc.current.setRemoteDescription(data.offer);

        const answer = await pc.current.createAnswer();
        await pc.current.setLocalDescription(answer);

        socket.current.emit("webrtc-answer", {
          to: data.from,
          answer,
          cameraId: data.cameraId
        });

        setStatus({ status: "connecting", message: "Sending answer..." });

      } catch (err) {
        console.error("Offer handling error →", err);
        setStatus({ status: "error", message: "Offer handling failed" });
      }
    });

    // ---- ICE CANDIDATES ----
    socket.current.on("ice-candidate", (data: any) => {
      if (pc.current && data.candidate) {
        pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    // ---- ADMIN LEFT ----
    socket.current.on("admin-disconnected", () => {
      setStatus({ status: "waiting", message: "Admin disconnected" });
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
      setStatus({ status: "connecting", message: "Accessing camera..." });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
        audio: true
      });

      localStream.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      pc.current = new RTCPeerConnection({ iceServers: STUN_SERVERS });

      stream.getTracks().forEach((t) => pc.current!.addTrack(t, stream));

      // ICE SENDING
      pc.current.onicecandidate = (e) => {
        if (e.candidate) {
          socket.current.emit("ice-candidate", {
            candidate: e.candidate,
            cameraId: camId
          });
        }
      };

      // CONNECTION STATE
      pc.current.onconnectionstatechange = () => {
        if (!pc.current) return;
        const state = pc.current.connectionState;

        if (state === "connected") {
          setStatus({ status: "connected", message: "Streaming live" });
        } else if (state === "failed") {
          setStatus({ status: "error", message: "Connection failed" });
        } else if (state === "disconnected") {
          setStatus({ status: "waiting", message: "Disconnected" });
        }
      };

      // JOIN ROOM
      socket.current.emit("join-room", {
        matchId,
        role: "broadcaster",
        cameraId: camId
      });

      setStatus({ status: "waiting", message: "Waiting for admin..." });

    } catch (err: any) {
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

      <h1 className="text-xl font-bold">📱 Camera {cameraId}</h1>

      <div className={`rounded-lg border-2 border-${ui}-500 mt-4`}>
        <video ref={videoRef} autoPlay muted playsInline className="w-full rounded" />

        {status.status !== "connected" && (
          <div className="absolute inset-0 bg-black/60 flex justify-center items-center">
            <p>{status.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
