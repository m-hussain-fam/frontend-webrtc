'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import io from 'socket.io-client';

interface Camera {
  id: string;
  number: number;
  status: 'waiting' | 'connected' | 'disconnected';
  broadcasterId?: string;
}

interface BroadcasterInfo {
  broadcasterId: string;
  cameraId: number;
  status: string;
}

const STUN_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
];

export default function AdminDashboard() {
  const params = useParams();
  const matchId = params.matchId as string;
  const socketRef = useRef<any>(null);

  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const [cameras, setCameras] = useState<Camera[]>([
    { id: 'cam1', number: 1, status: 'waiting' },
    { id: 'cam2', number: 2, status: 'waiting' },
    { id: 'cam3', number: 3, status: 'waiting' },
    { id: 'cam4', number: 4, status: 'waiting' },
  ]);

  const [broadcasters, setBroadcasters] = useState<Map<string, BroadcasterInfo>>(new Map());

  useEffect(() => {
    socketRef.current = io('http://signaling-server-2-production.up.railway.app/', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current.emit('join-room', {
      matchId,
      role: 'admin',
    });

    socketRef.current.on('room-broadcasters', (data: { broadcasters: BroadcasterInfo[] }) => {
      console.log('Current broadcasters:', data.broadcasters);
      data.broadcasters.forEach((broadcaster) => {
        setBroadcasters((prev) => new Map(prev).set(broadcaster.cameraId.toString(), broadcaster));
        initiateConnection(broadcaster);
      });
    });

    socketRef.current.on('broadcaster-joined', (data: BroadcasterInfo) => {
      console.log('New broadcaster joined:', data);
      setBroadcasters((prev) => new Map(prev).set(data.cameraId.toString(), data));

      setCameras((prev) =>
        prev.map((cam) =>
          cam.number === data.cameraId ? { ...cam, status: 'connected', broadcasterId: data.broadcasterId } : cam
        )
      );

      initiateConnection(data);
    });

    socketRef.current.on('broadcaster-disconnected', (data: { broadcasterId: string; cameraId: number }) => {
      console.log('Broadcaster disconnected:', data);

      const pc = peerConnectionsRef.current.get(data.broadcasterId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(data.broadcasterId);
      }

      const videoRef = videoRefs.current.get(data.cameraId);
      if (videoRef) {
        videoRef.srcObject = null;
      }

      setCameras((prev) =>
        prev.map((cam) =>
          cam.number === data.cameraId ? { ...cam, status: 'waiting', broadcasterId: undefined } : cam
        )
      );

      setBroadcasters((prev) => {
        const updated = new Map(prev);
        updated.delete(data.cameraId.toString());
        return updated;
      });
    });

    socketRef.current.on('webrtc-answer', async (data: { from: string; answer: RTCSessionDescriptionInit; cameraId: number }) => {
      console.log('Received answer from camera', data.cameraId);

      const pc = peerConnectionsRef.current.get(data.from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log('Remote description set for camera', data.cameraId);
        } catch (error) {
          console.error('Error setting remote description:', error);
        }
      }
    });

    socketRef.current.on('ice-candidate', (data: { from: string; candidate: RTCIceCandidateInit; cameraId: number }) => {
      const pc = peerConnectionsRef.current.get(data.from);
      if (pc && data.candidate) {
        try {
          pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    });

    return () => {
      socketRef.current?.disconnect();
      peerConnectionsRef.current.forEach((pc) => pc.close());
    };
  }, [matchId]);

  const initiateConnection = (broadcaster: BroadcasterInfo) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: STUN_SERVERS,
    });

    peerConnection.ontrack = (event) => {
      console.log('Track received from camera', broadcaster.cameraId);
      const videoRef = videoRefs.current.get(broadcaster.cameraId);
      if (videoRef) {
        videoRef.srcObject = event.streams[0];
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log(`Camera ${broadcaster.cameraId} connection state:`, peerConnection.connectionState);

      if (peerConnection.connectionState === 'connected') {
        setCameras((prev) =>
          prev.map((cam) =>
            cam.number === broadcaster.cameraId ? { ...cam, status: 'connected' } : cam
          )
        );
      } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        setCameras((prev) =>
          prev.map((cam) =>
            cam.number === broadcaster.cameraId ? { ...cam, status: 'disconnected' } : cam
          )
        );
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', {
          to: broadcaster.broadcasterId,
          candidate: event.candidate,
          cameraId: broadcaster.cameraId,
        });
      }
    };

    peerConnection
      .createOffer()
      .then((offer) => {
        return peerConnection.setLocalDescription(offer);
      })
      .then(() => {
        socketRef.current?.emit('webrtc-offer', {
          to: broadcaster.broadcasterId,
          offer: peerConnection.localDescription,
          cameraId: broadcaster.cameraId,
        });
        console.log('Offer sent to broadcaster - Camera', broadcaster.cameraId);
      })
      .catch((error) => console.error('Error creating offer:', error));

    peerConnectionsRef.current.set(broadcaster.broadcasterId, peerConnection);
  };

  const connectedCount = cameras.filter((c) => c.status === 'connected').length;

  return (
    <div className="min-h-screen bg-black px-6 py-8 text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">🎬 Cricket Match Live Stream</h1>
        <p className="text-gray-400">
          Match ID: {matchId} | Status: {connectedCount}/4 cameras connected
        </p>
      </div>

      {/* 2x2 Grid Layout */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:max-w-5xl">
        {cameras.map((camera) => (
          <div
            key={camera.id}
            className={`relative aspect-square overflow-hidden rounded-lg border-4 ${
              camera.status === 'connected' ? 'border-green-500' : 'border-gray-600'
            } bg-black`}
          >
            <video
              ref={(el) => {
                if (el) videoRefs.current.set(camera.number, el);
              }}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />

            {/* Status Badge */}
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded bg-black/70 px-3 py-2">
              {camera.status === 'waiting' && (
                <div className="h-3 w-3 animate-pulse rounded-full bg-yellow-500"></div>
              )}
              {camera.status === 'connected' && (
                <div className="h-3 w-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50"></div>
              )}
              {camera.status === 'disconnected' && (
                <div className="h-3 w-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50"></div>
              )}
              <span className="text-xs font-medium capitalize text-white">{camera.status}</span>
            </div>

            {/* Camera Label */}
            <div className="absolute bottom-3 left-3 rounded bg-black/70 px-4 py-2">
              <p className="text-sm font-bold text-white">Camera {camera.number}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Debug Info */}
      <div className="rounded-lg bg-gray-900 p-4 lg:max-w-5xl">
        <p className="mb-3 text-xs font-bold text-white">
          📊 Connected Broadcasters: {broadcasters.size}
        </p>
        {Array.from(broadcasters.values()).map((b) => (
          <p key={b.broadcasterId} className="text-xs font-mono text-green-400">
            ✓ Camera {b.cameraId} - {b.broadcasterId}
          </p>
        ))}
      </div>
    </div>
  );
}