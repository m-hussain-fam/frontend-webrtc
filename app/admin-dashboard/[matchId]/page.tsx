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
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export default function AdminDashboard() {
  const params = useParams();
  const matchId = params.matchId as string;
  const socketRef = useRef<any>(null);

  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceCounterRef = useRef<Map<number, number>>(new Map());

  const [cameras, setCameras] = useState<Camera[]>([
    { id: 'cam1', number: 1, status: 'waiting' },
    { id: 'cam2', number: 2, status: 'waiting' },
    { id: 'cam3', number: 3, status: 'waiting' },
    { id: 'cam4', number: 4, status: 'waiting' },
  ]);

  const [broadcasters, setBroadcasters] = useState<Map<string, BroadcasterInfo>>(new Map());

  useEffect(() => {
    console.log('\n════════════════════════════════════');
    console.log('🎬 ADMIN DASHBOARD STARTUP');
    console.log('════════════════════════════════════');
    console.log('Match ID:', matchId);
    console.log('Timestamp:', new Date().toLocaleTimeString());

    socketRef.current = io('https://signaling-server-2-production.up.railway.app/', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });

    socketRef.current.on('connect', () => {
      console.log('\n✅ SOCKET CONNECTED');
      console.log('Socket ID:', socketRef.current.id);

      socketRef.current.emit('join-room', {
        matchId,
        role: 'admin',
      });
      console.log('🚪 Admin joined room:', matchId);
    });

    socketRef.current.on('connect_error', (error: any) => {
      console.error('❌ CONNECTION ERROR:', error);
    });

    socketRef.current.on('disconnect', () => {
      console.log('❌ SOCKET DISCONNECTED');
    });

    socketRef.current.on('room-broadcasters', (data: { broadcasters: BroadcasterInfo[] }) => {
      console.log('\n📋 ROOM BROADCASTERS');
      console.log('Count:', data.broadcasters.length);
      data.broadcasters.forEach((b) => {
        console.log(`   - Camera ${b.cameraId}: ${b.broadcasterId}`);
        setBroadcasters((prev) => new Map(prev).set(b.cameraId.toString(), b));
        initiateConnection(b);
      });
    });

    socketRef.current.on('broadcaster-joined', (data: BroadcasterInfo) => {
      console.log('\n✨ NEW BROADCASTER JOINED');
      console.log('Camera:', data.cameraId);
      console.log('ID:', data.broadcasterId);
      
      setBroadcasters((prev) => new Map(prev).set(data.cameraId.toString(), data));

      setCameras((prev) =>
        prev.map((cam) =>
          cam.number === data.cameraId ? { ...cam, status: 'connected', broadcasterId: data.broadcasterId } : cam
        )
      );

      iceCounterRef.current.set(data.cameraId, 0);
      initiateConnection(data);
    });

    socketRef.current.on('broadcaster-disconnected', (data: { broadcasterId: string; cameraId: number }) => {
      console.log('\n👋 BROADCASTER DISCONNECTED');
      console.log('Camera:', data.cameraId);

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

      iceCounterRef.current.delete(data.cameraId);
    });

    socketRef.current.on('webrtc-answer', async (data: { from: string; answer: RTCSessionDescriptionInit; cameraId: number }) => {
      console.log('\n📨 RECEIVED WebRTC ANSWER');
      console.log('From:', data.from?.substring(0, 8) + '...');
      console.log('Camera:', data.cameraId);

      const pc = peerConnectionsRef.current.get(data.from);
      if (pc) {
        try {
          const currentState = pc.signalingState;
          console.log('Signaling state:', currentState);

          if (currentState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('✅ Remote description set');
            console.log('⏳ Waiting for ICE candidates...');
          } else {
            console.warn('⚠️ Wrong signaling state:', currentState);
          }
        } catch (error) {
          console.error('❌ Error setting remote description:', error);
        }
      }
    });

    socketRef.current.on('ice-candidate', (data: { from: string; candidate: RTCIceCandidateInit; cameraId: number }) => {
      const cameraNum = data.cameraId;
      const currentCount = (iceCounterRef.current.get(cameraNum) || 0) + 1;
      iceCounterRef.current.set(cameraNum, currentCount);

      console.log(`\n🧊 ICE Candidate #${currentCount} (Camera ${cameraNum})`);
      console.log('From:', data.from?.substring(0, 8) + '...');
      
      const pc = peerConnectionsRef.current.get(data.from);
      if (pc && data.candidate) {
        try {
          pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('✅ Added successfully');
        } catch (error) {
          console.error('❌ Error adding ICE candidate:', error);
        }
      } else {
        if (!pc) console.error('❌ PC not found');
        if (!data.candidate) console.error('❌ Candidate missing');
      }
    });

    return () => {
      console.log('\n🧹 CLEANUP: Disconnecting...');
      socketRef.current?.disconnect();
      peerConnectionsRef.current.forEach((pc) => pc.close());
    };
  }, [matchId]);

  useEffect(() => {
  // Expose for debugging
  (window as any).debugAdminPC = () => {
    const pcs = Array.from(peerConnectionsRef.current.values());
    if (pcs.length > 0) {
      const pc = pcs[0];
      return {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState,
        receivers: pc.getReceivers().length,
        senders: pc.getSenders().length
      };
    }
    else
    {
      console.warn('No peer connections found');
    }
    return null;
  };
}, []);

  const initiateConnection = (broadcaster: BroadcasterInfo) => {
    console.log('\n────────────────────────────────────');
    console.log('🔗 INITIATING WebRTC CONNECTION');
    console.log('────────────────────────────────────');
    console.log('Camera:', broadcaster.cameraId);
    console.log('Broadcaster ID:', broadcaster.broadcasterId);

    const peerConnection = new RTCPeerConnection({
      iceServers: STUN_SERVERS,
    });

    // Add after the useEffect hook (around line 200)


    // ════════════════════════════════════════════════
    // TRACK HANDLER
    // ════════════════════════════════════════════════

    peerConnection.ontrack = (event) => {
      console.log(`\n📹 TRACK RECEIVED (Camera ${broadcaster.cameraId})`);
      console.log('Track kind:', event.track.kind);
      console.log('Stream count:', event.streams.length);

      const videoRef = videoRefs.current.get(broadcaster.cameraId);
      if (videoRef) {
        videoRef.srcObject = event.streams[0];
        console.log('✅ Video element updated');
      } else {
        console.warn('⚠️ Video ref not found');
      }
    };

    // ════════════════════════════════════════════════
    // CONNECTION STATE
    // ════════════════════════════════════════════════

    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`\n📡 CONNECTION STATE (Camera ${broadcaster.cameraId}):`, state);

      if (state === 'connected') {
        console.log('✅ ✅ ✅ FULLY CONNECTED & STREAMING!');
        setCameras((prev) =>
          prev.map((cam) =>
            cam.number === broadcaster.cameraId ? { ...cam, status: 'connected' } : cam
          )
        );
      } else if (state === 'failed' || state === 'disconnected') {
        console.error('❌ Connection issue');
        setCameras((prev) =>
          prev.map((cam) =>
            cam.number === broadcaster.cameraId ? { ...cam, status: 'disconnected' } : cam
          )
        );
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE State (Camera ${broadcaster.cameraId}):`, peerConnection.iceConnectionState);
    };

    peerConnection.onicecandidate = (event) => {
      console.log(`\n🧊 onicecandidate FIRED (Camera ${broadcaster.cameraId})`);
      console.log('Has candidate:', !!event.candidate);
      
      if (event.candidate) {
        console.log('Candidate type:', event.candidate.candidate?.split(' ')[7]);
        console.log('Emitting to broadcaster:', broadcaster.broadcasterId?.substring(0, 8) + '...');
        
        socketRef.current?.emit('ice-candidate', {
          to: broadcaster.broadcasterId,
          candidate: event.candidate,
          cameraId: broadcaster.cameraId,
        });
        
        console.log('✅ Emitted to server');
      } else {
        const totalIce = iceCounterRef.current.get(broadcaster.cameraId) || 0;
        console.log(`→ ICE gathering completed (${totalIce} total candidates)`);
      }
    };

    // ════════════════════════════════════════════════
    // CREATE OFFER
    // ════════════════════════════════════════════════

    console.log('\n📤 Creating offer...');

    peerConnection
      .createOffer()
      .then((offer) => {
        console.log('✅ Offer created');
        console.log('SDP length:', offer.sdp?.length);
        return peerConnection.setLocalDescription(offer);
      })
      .then(() => {
        console.log('✅ Local description set');
        
        socketRef.current?.emit('webrtc-offer', {
          to: broadcaster.broadcasterId,
          offer: peerConnection.localDescription,
          cameraId: broadcaster.cameraId,
        });
        
        console.log('✅ Offer sent to broadcaster');
        console.log('⏳ Waiting for answer and ICE candidates...\n');
      })
      .catch((error) => {
        console.error('❌ Error creating offer:', error);
      });

    peerConnectionsRef.current.set(broadcaster.broadcasterId, peerConnection);
  };

  const connectedCount = cameras.filter((c) => c.status === 'connected').length;

  return (
    <div className="min-h-screen bg-black px-6 py-8 text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">🎬 Cricket Match Live Stream</h1>
        <p className="text-gray-400">
          Match ID: {matchId} | Status: <span className="text-green-400 font-bold">{connectedCount}/4</span> cameras connected
        </p>
      </div>

      {/* 2x2 Grid Layout */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:max-w-5xl">
        {cameras.map((camera) => (
          <div
            key={camera.id}
            className={`relative aspect-square overflow-hidden rounded-lg border-4 transition-all duration-300 ${
              camera.status === 'connected' 
                ? 'border-green-500 shadow-lg shadow-green-500/30' 
                : 'border-gray-600'
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
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded bg-black/80 backdrop-blur px-3 py-2 border border-gray-700">
              {camera.status === 'waiting' && (
                <div className="h-3 w-3 animate-pulse rounded-full bg-yellow-500"></div>
              )}
              {camera.status === 'connected' && (
                <div className="h-3 w-3 rounded-full bg-green-500 shadow-lg shadow-green-500/50 animate-pulse"></div>
              )}
              {camera.status === 'disconnected' && (
                <div className="h-3 w-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50"></div>
              )}
              <span className="text-xs font-medium capitalize text-white">{camera.status}</span>
            </div>

            {/* Camera Label */}
            <div className="absolute bottom-3 left-3 rounded bg-black/80 backdrop-blur px-4 py-2 border border-gray-700">
              <p className="text-sm font-bold text-white">Camera {camera.number}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Debug Info */}
      <div className="rounded-lg bg-gray-900/80 backdrop-blur p-4 lg:max-w-5xl border border-gray-800">
        <p className="mb-3 text-xs font-bold text-white">
          📊 Connected Broadcasters: {broadcasters.size}
        </p>
        {broadcasters.size === 0 ? (
          <p className="text-xs text-gray-400">Waiting for cameras to connect...</p>
        ) : (
          <div className="space-y-2">
            {Array.from(broadcasters.values()).map((b) => (
              <div key={b.broadcasterId} className="flex justify-between text-xs">
                <span className="text-green-400 font-mono">✓ Camera {b.cameraId}</span>
                <span className="text-gray-500">{b.broadcasterId?.substring(0, 12)}...</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connection Info */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 lg:max-w-5xl">
        <div className="bg-gray-900/80 backdrop-blur rounded p-4 border border-gray-800">
          <p className="text-xs text-gray-400">Total Cameras</p>
          <p className="text-2xl font-bold">4</p>
        </div>
        <div className="bg-gray-900/80 backdrop-blur rounded p-4 border border-gray-800">
          <p className="text-xs text-gray-400">Connected</p>
          <p className="text-2xl font-bold text-green-400">{connectedCount}</p>
        </div>
        <div className="bg-gray-900/80 backdrop-blur rounded p-4 border border-gray-800">
          <p className="text-xs text-gray-400">Waiting</p>
          <p className="text-2xl font-bold text-yellow-400">{4 - connectedCount}</p>
        </div>
        <div className="bg-gray-900/80 backdrop-blur rounded p-4 border border-gray-800">
          <p className="text-xs text-gray-400">Match</p>
          <p className="text-lg font-mono text-gray-300">{matchId?.substring(0, 8)}</p>
        </div>
      </div>
    </div>
  );
}