'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import io from 'socket.io-client';
import { json } from 'stream/consumers';

interface Camera {
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
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export default function AdminDashboard() {
  const { matchId } = useParams();
  const socketRef = useRef<any>(null);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const [cameras, setCameras] = useState<Camera[]>([
    { number: 1, status: 'waiting' },
    { number: 2, status: 'waiting' },
    { number: 3, status: 'waiting' },
    { number: 4, status: 'waiting' },
  ]);

  useEffect(() => {
    console.log('🎬 AdminDashboard init', matchId);

    socketRef.current = io('https://signaling-server-2-production.up.railway.app', {
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      console.log('✅ Connected to server', socketRef.current.id);
      socketRef.current.emit('join-room', { matchId, role: 'admin' });
    });

    socketRef.current.on('disconnect', () => console.warn('❌ Disconnected'));
    socketRef.current.on('connect_error', (err: any) => console.error('❌ Connect error', err));

    socketRef.current.on('room-broadcasters', (data: { broadcasters: BroadcasterInfo[] }) => {
      data.broadcasters.forEach(initiateConnection);
    });

    socketRef.current.on('broadcaster-joined', initiateConnection);

    socketRef.current.on('webrtc-answer', async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peerConnectionsRef.current.get(data.from);
      if (!pc) return;

      try {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log('✅ Remote description set for', data.from);

          // Process any queued ICE candidates
          const queue = iceQueuesRef.current.get(data.from) || [];
          for (const cand of queue) pc.addIceCandidate(new RTCIceCandidate(cand));
          iceQueuesRef.current.set(data.from, []);
        } else {
          console.warn('⚠️ Wrong signaling state for answer', pc.signalingState);
        }
      } catch (err) {
        console.error('❌ Error setting remote description', err);
      }
    });

    socketRef.current.on('ice-candidate', (data: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnectionsRef.current.get(data.from);
      if (pc && pc.remoteDescription) {
        pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        // Queue ICE candidates until remote description is set
        const queue = iceQueuesRef.current.get(data.from) || [];
        queue.push(data.candidate);
        iceQueuesRef.current.set(data.from, queue);
      }
    });

    return () => {
      socketRef.current.disconnect();
      peerConnectionsRef.current.forEach((pc) => pc.close());
    };
  }, [matchId]);

  const initiateConnection = (b: BroadcasterInfo) => {
    if (peerConnectionsRef.current.has(b.broadcasterId)) return;

    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    peerConnectionsRef.current.set(b.broadcasterId, pc);
    iceQueuesRef.current.set(b.broadcasterId, []);

    // Receive tracks from mobile
    pc.ontrack = (e) => {
      console.log('✅ Track received from', e);
      const video = videoRefs.current.get(b.cameraId);
      console.log('✅ Setting srcObject for video', video);
       if (video) {
    console.log('✅ Setting srcObject for camera', b.cameraId);
    video.srcObject = e.streams[0];
    // Force play
    video.play().catch(err => console.error('Play error:', err));
  } else {
    console.warn('⚠️ Video ref not found for camera', b.cameraId);
  }
    };

    // Send ICE candidates to broadcaster
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log('✅ ICE candidate received for', e);
        socketRef.current.emit('ice-candidate', {
          to: b.broadcasterId,
          candidate: e.candidate,
          cameraId: b.cameraId,
          matchId,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const camState = pc.connectionState === 'connected' ? 'connected' : pc.connectionState === 'failed' ? 'disconnected' : 'waiting';
      setCameras((prev) => prev.map((c) => c.number === b.cameraId ? { ...c, status: camState, broadcasterId: b.broadcasterId } : c));
    };

    // Create offer to receive video/audio
    pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        socketRef.current.emit('webrtc-offer', {
          to: b.broadcasterId,
          offer: pc.localDescription,
          cameraId: b.cameraId,
        });
      })
      .catch(console.error);
  };

  return (
    <div className="min-h-screen bg-black p-4 text-white">
      {JSON.stringify(videoRefs)}
      <h1 className="text-2xl mb-4">🎬 Admin Dashboard - Match {matchId}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cameras.map((c) => (
          <div key={c.number} className={`relative aspect-video rounded border-4 ${c.status === 'connected' ? 'border-green-500' : 'border-gray-700'}`}>
            <video
              ref={(el) => {
                if (el) videoRefs.current.set(c.number, el);
              }}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 text-sm bg-black/50 px-2 rounded">{c.status}</div>
            <div className="absolute bottom-2 left-2 text-sm bg-black/50 px-2 rounded">Cam {c.number}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
