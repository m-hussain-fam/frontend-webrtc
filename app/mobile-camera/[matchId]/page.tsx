


// 'use client';

// import { useEffect, useRef, useState } from 'react';
// import { useParams, useSearchParams } from 'next/navigation';
// import io from 'socket.io-client';
// import { Toaster, toast } from 'sonner';

// interface ConnectionStatus {
//   status: 'waiting' | 'connecting' | 'connected' | 'error';
//   message: string;
// }

// const STUN_SERVERS = [
//   { urls: ['stun:stun.l.google.com:19302'] },
//   { urls: ['stun:stun1.l.google.com:19302'] },
// ];

// export default function MobileCamera() {
//   const params = useParams();
//   const searchParams = useSearchParams();
//   const matchId = params.matchId as string;

//   const [cameraId, setCameraId] = useState<number>(1);
//   const [status, setStatus] = useState<ConnectionStatus>({
//     status: 'waiting',
//     message: 'Initializing...',
//   });

//   const socketRef = useRef<any>(null);
//   const videoRef = useRef<HTMLVideoElement>(null);
//   const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
//   const localStreamRef = useRef<MediaStream | null>(null);
//   const toastIdRef = useRef<string | number | null>(null);

//   useEffect(() => {
//     const urlCameraId = searchParams.get('cameraId');
//     const finalCameraId = urlCameraId ? parseInt(urlCameraId, 10) : 1;
//     setCameraId(finalCameraId);

//     console.log('🎬 Starting Mobile Camera Setup');
//     console.log('📱 Camera ID:', finalCameraId);
//     console.log('🎯 Match ID:', matchId);

//     toast.info('🎬 Initializing camera setup...', { duration: 2000 });

//     const socketUrl = 'https://signaling-server-2-production.up.railway.app';

//     socketRef.current = io(socketUrl, {
//       reconnection: true,
//       reconnectionDelay: 1000,
//       reconnectionDelayMax: 5000,
//       reconnectionAttempts: 5,
//       secure: false,
//       rejectUnauthorized: false,
//     });

//     // Connection events
//     socketRef.current.on('connect', () => {
//       console.log('✅ MOBILE SOCKET CONNECTED - Socket ID:', socketRef.current.id);
//       console.log('🔗 Server URL:', socketUrl);

//       toast.success('✅ Connected to server!', {
//         description: `Socket ID: ${socketRef.current.id.substring(0, 8)}...`,
//         duration: 3000,
//       });
//     });

//     socketRef.current.on('disconnect', () => {
//       console.log('❌ MOBILE SOCKET DISCONNECTED');
//       toast.error('❌ Disconnected from server', { duration: 2000 });
//     });

//     socketRef.current.on('connect_error', (error: any) => {
//       console.error('❌ MOBILE CONNECTION ERROR:', error);
//       toast.error('❌ Connection Error', {
//         description: error.message || 'Failed to connect to server',
//         duration: 3000,
//       });
//     });

//     // WebRTC offer from admin
//     socketRef.current.on('webrtc-offer', async (data: { from: string; offer: RTCSessionDescriptionInit; cameraId: number }) => {
//       console.log('📨 Received WebRTC Offer from Admin');
//       console.log('  - From:', data.from);
//       console.log('  - Camera ID:', data.cameraId);

//       toast.loading('📨 Received offer from admin, connecting...', { id: 'webrtc-offer' });
//       setStatus({ status: 'connecting', message: 'Establishing connection...' });

//       try {
//         const pc = peerConnectionRef.current;
//         if (pc && localStreamRef.current) {
//           console.log('📍 Setting remote description...');
//           await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

//           console.log('🎬 Creating answer...');
//           const answer = await pc.createAnswer();
//           await pc.setLocalDescription(answer);

//           console.log('📤 Sending answer back to admin...');
//           socketRef.current.emit('webrtc-answer', {
//             to: data.from,
//             answer: pc.localDescription,
//             cameraId: data.cameraId,
//           });

//           console.log('✅ Answer sent successfully');
//           toast.success('📤 Answer sent to admin!', { id: 'webrtc-offer', duration: 2000 });
//         } else {
//           console.error('❌ PeerConnection or localStream not available');
//           toast.error('❌ Connection error', { id: 'webrtc-offer', duration: 2000 });
//         }
//       } catch (error) {
//         console.error('❌ Error handling offer:', error);
//         toast.error('❌ Connection failed', { id: 'webrtc-offer', duration: 2000 });
//         setStatus({ status: 'error', message: 'Connection failed' });
//       }
//     });

//     // ICE candidates
//     socketRef.current.on('ice-candidate', (data: { from: string; candidate: RTCIceCandidateInit; cameraId: number }) => {
//       console.log('🧊 Received ICE Candidate');
//       if (peerConnectionRef.current && data.candidate) {
//         try {
//           peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
//         } catch (error) {
//           console.error('❌ Error adding ICE candidate:', error);
//         }
//       }
//     });

//     // Admin disconnected
//     socketRef.current.on('admin-disconnected', () => {
//       console.log('❌ Admin disconnected from server');
//       toast.warning('⚠️ Admin disconnected', { duration: 2000 });
//       setStatus({ status: 'waiting', message: 'Admin disconnected, waiting for reconnection...' });
//     });

//     // Admin joined (confirmation)
//     socketRef.current.on('admin-joined', (data: any) => {
//       console.log('✅ ADMIN JOINED - Admin ID:', data.adminId);
//       toast.success('✅ Admin is here!', { duration: 2000 });
//     });

//     // Start camera after socket is ready
//     setTimeout(() => {
//       console.log('⏱️ Starting camera setup...');
//       startCamera(finalCameraId);
//     }, 500);

//     return () => {
//       console.log('🧹 Cleaning up Mobile Camera...');
//       socketRef.current?.disconnect();
//       peerConnectionRef.current?.close();
//       localStreamRef.current?.getTracks().forEach((track) => track.stop());
//     };
//   }, [searchParams, matchId]);

//   const startCamera = async (finalCameraId: number) => {
//     try {
//       console.log('📹 Requesting camera access...');
//       setStatus({ status: 'connecting', message: 'Requesting camera access...' });

//       toast.loading('📹 Requesting camera access...', { id: 'camera-setup' });

//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: {
//           width: { ideal: 1280 },
//           height: { ideal: 720 },
//           facingMode: 'environment',
//         },
//         audio: true,
//       });

//       console.log('✅ Camera access granted');
//       localStreamRef.current = stream;

//       if (videoRef.current) {
//         videoRef.current.srcObject = stream;
//         console.log('✅ Video stream attached to element');
//       }

//       toast.success('✅ Camera access granted!', { id: 'camera-setup', duration: 2000 });

//       // Setup WebRTC
//       console.log('🔗 Setting up WebRTC Peer Connection...');
//       const peerConnection = new RTCPeerConnection({
//         iceServers: STUN_SERVERS,
//       });

//       peerConnectionRef.current = peerConnection;

//       // Add tracks
//       stream.getTracks().forEach((track) => {
//         console.log('📤 Adding track:', track.kind);
//         peerConnection.addTrack(track, stream);
//       });

//       // ICE candidate handling
//       peerConnection.onicecandidate = (event) => {
//         if (event.candidate) {
//           console.log('🧊 Emitting ICE candidate');
//           socketRef.current?.emit('ice-candidate', {
//             to: null,
//             candidate: event.candidate,
//             cameraId: finalCameraId,
//           });
//         }
//       };

//       // Connection state changes
//       peerConnection.onconnectionstatechange = () => {
//         const state = peerConnection.connectionState;
//         console.log('📡 WebRTC Connection State:', state);

//         if (state === 'connected') {
//           console.log('✅ WebRTC CONNECTED - Video streaming!');
//           toast.success('✅ WebRTC Connected - Streaming!', { duration: 3000 });
//           setStatus({ status: 'connected', message: 'Connected to stream' });
//         } else if (state === 'failed' || state === 'disconnected') {
//           console.log('❌ WebRTC Connection', state);
//           toast.error(`❌ Connection ${state}`, { duration: 2000 });
//           setStatus({ status: 'error', message: 'Connection lost' });
//         }
//       };

//       // Join room
//       console.log('🚪 Joining room as broadcaster...');
//       console.log('  - Match ID:', matchId);
//       console.log('  - Role: broadcaster');
//       console.log('  - Camera ID:', finalCameraId);

//       toast.loading('🚪 Joining room...', { id: 'join-room' });

//       socketRef.current?.emit('join-room', {
//         matchId,
//         role: 'broadcaster',
//         cameraId: finalCameraId,
//       });

//       console.log('✅ Join-room event emitted');
//       toast.success('🚪 Joined room! Waiting for admin...', { id: 'join-room', duration: 2000 });
//       setStatus({ status: 'waiting', message: 'Waiting for admin to connect...' });
//     } catch (error: any) {
//       console.error('❌ Camera Error:', error);
//       console.error('  - Name:', error.name);
//       console.error('  - Message:', error.message);

//       toast.error('❌ Camera Error', {
//         description: error.name === 'NotAllowedError'
//           ? 'Camera permission denied'
//           : error.message,
//         duration: 3000,
//       });

//       setStatus({
//         status: 'error',
//         message: error.name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera error: ' + error.message,
//       });
//     }
//   };

//   const statusColors = {
//     waiting: { border: 'border-yellow-500', indicator: 'bg-yellow-500', text: 'text-yellow-500' },
//     connecting: { border: 'border-blue-500', indicator: 'bg-blue-500', text: 'text-blue-500' },
//     connected: { border: 'border-green-500', indicator: 'bg-green-500', text: 'text-green-500' },
//     error: { border: 'border-red-500', indicator: 'bg-red-500', text: 'text-red-500' },
//   };

//   const colors = statusColors[status.status];

//   return (
//     <div className="min-h-screen bg-gray-900 px-4 py-6 text-white md:px-6">
//       <Toaster
//         position="top-center"
//         richColors
//         theme="dark"
//         toastOptions={{
//           classNames: {
//             toast: 'w-full max-w-md mx-auto',
//             title: 'text-lg font-semibold',
//             description: 'text-sm text-gray-300',
//           },
//         }}
//       />

//       <style>{`
//         @keyframes spin {
//           to { transform: rotate(360deg); }
//         }
//         @keyframes pulse {
//           0%, 100% { opacity: 1; }
//           50% { opacity: 0.5; }
//         }
//       `}</style>

//       {/* Header */}
//       <div className="mb-6">
//         <h1 className="mb-2 text-2xl font-bold md:text-3xl">📱 Camera {cameraId} - Broadcasting</h1>
//         <p className="text-sm text-gray-400 md:text-base">Match: {matchId} | Broadcasting video stream...</p>
//       </div>

//       {/* Video Container */}
//       <div className="mb-6 max-w-2xl">
//         <div className={`relative aspect-square overflow-hidden rounded-lg border-4 ${colors.border} bg-black`}>
//           <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

//           {/* Status Overlay */}
//           {status.status !== 'connected' && (
//             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
//               <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-yellow-500"></div>
//               <p className="text-center font-bold">{status.message}</p>
//             </div>
//           )}

//           {/* Camera Label */}
//           <div className="absolute bottom-3 left-3 rounded bg-black/70 px-4 py-2">
//             <p className="text-sm font-bold">Camera {cameraId}</p>
//           </div>

//           {/* Status Badge */}
//           <div className="absolute right-3 top-3 flex items-center gap-2 rounded bg-black/70 px-3 py-2">
//             {status.status === 'waiting' && <div className={`h-3 w-3 animate-pulse rounded-full ${colors.indicator}`}></div>}
//             {status.status === 'connecting' && <div className={`h-3 w-3 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500`}></div>}
//             {status.status === 'connected' && (
//               <div className={`h-3 w-3 rounded-full ${colors.indicator} shadow-lg`} style={{ boxShadow: '0 0 8px rgba(76, 175, 80, 0.5)' }}></div>
//             )}
//             {status.status === 'error' && (
//               <div className={`h-3 w-3 rounded-full ${colors.indicator} shadow-lg`} style={{ boxShadow: '0 0 8px rgba(244, 67, 54, 0.5)' }}></div>
//             )}
//             <span className="text-xs font-medium capitalize">{status.status}</span>
//           </div>
//         </div>
//       </div>

//       {/* Info Panel */}
//       <div className="max-w-2xl rounded-lg bg-gray-800 p-4">
//         <h3 className="mb-4 text-sm font-bold">📊 Connection Status</h3>
//         <div className="grid grid-cols-3 gap-4">
//           <div>
//             <p className="text-xs text-gray-400">Status</p>
//             <p className={`font-bold ${colors.text}`}>{status.status}</p>
//           </div>
//           <div>
//             <p className="text-xs text-gray-400">Camera ID</p>
//             <p className="font-bold text-white">{cameraId}</p>
//           </div>
//           <div>
//             <p className="text-xs text-gray-400">Message</p>
//             <p className="text-xs text-white">{status.message}</p>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }


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
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
];

export default function MobileCamera() {
  const params = useParams();
  const searchParams = useSearchParams();
  const matchId = params.matchId as string;

  const [cameraId, setCameraId] = useState<number>(1);
  const [status, setStatus] = useState<ConnectionStatus>({
    status: 'waiting',
    message: 'Initializing...',
  });

  const socketRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const urlCameraId = searchParams.get('cameraId');
    const finalCameraId = urlCameraId ? parseInt(urlCameraId, 10) : 1;
    setCameraId(finalCameraId);

    console.log('🎬 Starting Mobile Camera Setup');
    console.log('📱 Camera ID:', finalCameraId);
    console.log('🎯 Match ID:', matchId);

    toast.info('🎬 Initializing camera setup...', { duration: 2000 });

    const socketUrl = 'https://signaling-server-2-production.up.railway.app';

    socketRef.current = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });

    // Connection events
    socketRef.current.on('connect', () => {
      console.log('✅ MOBILE SOCKET CONNECTED - Socket ID:', socketRef.current.id);
      console.log('🔗 Server URL:', socketUrl);

      toast.success('✅ Connected to server!', {
        description: `Socket ID: ${socketRef.current.id.substring(0, 8)}...`,
        duration: 3000,
      });
    });

    socketRef.current.on('disconnect', () => {
      console.log('❌ MOBILE SOCKET DISCONNECTED');
      toast.error('❌ Disconnected from server', { duration: 2000 });
      setStatus({ status: 'waiting', message: 'Disconnected, attempting to reconnect...' });
    });

    socketRef.current.on('connect_error', (error: any) => {
      console.error('❌ MOBILE CONNECTION ERROR:', error);
      toast.error('❌ Connection Error', {
        description: error.message || 'Failed to connect to server',
        duration: 3000,
      });
    });

    // WebRTC offer from admin
    socketRef.current.on('webrtc-offer', async (data: { from: string; offer: RTCSessionDescriptionInit; cameraId: number }) => {
      console.log('📨 Received WebRTC Offer from Admin');
      console.log('  - From:', data.from);
      console.log('  - Camera ID:', data.cameraId);

      toast.loading('📨 Received offer from admin, connecting...', { id: 'webrtc-offer' });
      setStatus({ status: 'connecting', message: 'Establishing connection...' });

      try {
        const pc = peerConnectionRef.current;
        if (!pc) {
          console.error('❌ PeerConnection not initialized');
          toast.error('❌ Connection error', { id: 'webrtc-offer', duration: 2000 });
          return;
        }

        if (!localStreamRef.current) {
          console.error('❌ Local stream not available');
          toast.error('❌ Stream error', { id: 'webrtc-offer', duration: 2000 });
          return;
        }

        const signalingState = pc.signalingState;
        console.log('📡 Signaling state before answer:', signalingState);

        if (signalingState === 'stable') {
          console.log('📍 Setting remote description...');
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

          console.log('🎬 Creating answer...');
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          console.log('📤 Sending answer back to admin...');
          socketRef.current.emit('webrtc-answer', {
            to: data.from,
            answer: pc.localDescription,
            cameraId: data.cameraId,
          });

          console.log('✅ Answer sent successfully');
          toast.success('📤 Answer sent to admin!', { id: 'webrtc-offer', duration: 2000 });
        } else {
          console.warn('⚠️ Cannot process offer - wrong signaling state:', signalingState);
          toast.warning('⚠️ Connection already in progress', { id: 'webrtc-offer', duration: 2000 });
        }
      } catch (error) {
        console.error('❌ Error handling offer:', error);
        toast.error('❌ Connection failed', { id: 'webrtc-offer', duration: 2000 });
        setStatus({ status: 'error', message: 'Connection failed' });
      }
    });

    // ICE candidates
    socketRef.current.on('ice-candidate', (data: { from: string; candidate: RTCIceCandidateInit; cameraId: number }) => {
      if (peerConnectionRef.current && data.candidate) {
        try {
          peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('🧊 ICE candidate added');
        } catch (error) {
          console.error('❌ Error adding ICE candidate:', error);
        }
      }
    });

    // Admin disconnected
    socketRef.current.on('admin-disconnected', () => {
      console.log('❌ Admin disconnected from server');
      toast.warning('⚠️ Admin disconnected', { duration: 2000 });
      setStatus({ status: 'waiting', message: 'Admin disconnected, waiting for reconnection...' });
    });

    // Admin joined (confirmation)
    socketRef.current.on('admin-joined', (data: any) => {
      console.log('✅ ADMIN JOINED - Admin ID:', data.adminId);
      toast.success('✅ Admin is here!', { duration: 2000 });
    });

    // Start camera after socket is ready
    setTimeout(() => {
      console.log('⏱️ Starting camera setup...');
      startCamera(finalCameraId);
    }, 500);

    return () => {
      console.log('🧹 Cleaning up Mobile Camera...');
      socketRef.current?.disconnect();
      peerConnectionRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [searchParams, matchId]);

  const startCamera = async (finalCameraId: number) => {
    try {
      console.log('📹 Requesting camera access...');
      setStatus({ status: 'connecting', message: 'Requesting camera access...' });

      toast.loading('📹 Requesting camera access...', { id: 'camera-setup' });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment',
        },
        audio: true,
      });

      console.log('✅ Camera access granted');
      console.log('📊 Stream tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled })));
      
      localStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log('✅ Video stream attached to element');
      }

      toast.success('✅ Camera access granted!', { id: 'camera-setup', duration: 2000 });

      // Setup WebRTC
      console.log('🔗 Setting up WebRTC Peer Connection...');
      
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }

      const peerConnection = new RTCPeerConnection({
        iceServers: STUN_SERVERS,
      });

      peerConnectionRef.current = peerConnection;

      // startCamera function mein, after peerConnection setup
setTimeout(() => {
  console.log('📊 Mobile PC State after 3s:');
  console.log('  - Connection:', peerConnectionRef.current?.connectionState);
  console.log('  - ICE:', peerConnectionRef.current?.iceConnectionState);
  console.log('  - Signaling:', peerConnectionRef.current?.signalingState);
  console.log('  - Track count:', peerConnectionRef.current?.getSenders().length);
}, 3000);

      // Add tracks
      stream.getTracks().forEach((track) => {
        console.log('📤 Adding track:', track.kind);
        peerConnection.addTrack(track, stream);
      });

      // ICE candidate handling
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Emitting ICE candidate');
          socketRef.current?.emit('ice-candidate', {
            to: null,
            candidate: event.candidate,
            cameraId: finalCameraId,
          });
        }
      };

      // Connection state changes
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log('📡 WebRTC Connection State:', state);

        if (state === 'connected') {
          console.log('✅ WebRTC CONNECTED - Video streaming!');
          toast.success('✅ WebRTC Connected - Streaming!', { duration: 3000 });
          setStatus({ status: 'connected', message: 'Connected to stream' });
        } else if (state === 'failed' || state === 'disconnected') {
          console.log('❌ WebRTC Connection', state);
          toast.error(`❌ Connection ${state}`, { duration: 2000 });
          setStatus({ status: 'error', message: 'Connection lost' });
        }
      };

      // ICE connection state
      peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 ICE Connection State:', peerConnection.iceConnectionState);
      };

      // Signaling state tracking
      peerConnection.onsignalingstatechange = () => {
        console.log('🔄 Signaling State:', peerConnection.signalingState);
      };

      // Join room
      console.log('🚪 Joining room as broadcaster...');
      console.log('  - Match ID:', matchId);
      console.log('  - Role: broadcaster');
      console.log('  - Camera ID:', finalCameraId);

      toast.loading('🚪 Joining room...', { id: 'join-room' });

      socketRef.current?.emit('join-room', {
        matchId,
        role: 'broadcaster',
        cameraId: finalCameraId,
      });

      console.log('✅ Join-room event emitted');
      toast.success('🚪 Joined room! Waiting for admin...', { id: 'join-room', duration: 2000 });
      setStatus({ status: 'waiting', message: 'Waiting for admin to connect...' });
    } catch (error: any) {
      console.error('❌ Camera Error:', error);
      console.error('  - Name:', error.name);
      console.error('  - Message:', error.message);

      const errorMessage = error.name === 'NotAllowedError' 
        ? 'Camera permission denied' 
        : error.name === 'NotFoundError'
        ? 'No camera found'
        : error.message || 'Unknown error';

      toast.error('❌ Camera Error', {
        description: errorMessage,
        duration: 3000,
      });

      setStatus({
        status: 'error',
        message: errorMessage,
      });
    }
  };

  const statusColors = {
    waiting: { border: 'border-yellow-500', indicator: 'bg-yellow-500', text: 'text-yellow-500' },
    connecting: { border: 'border-blue-500', indicator: 'bg-blue-500', text: 'text-blue-500' },
    connected: { border: 'border-green-500', indicator: 'bg-green-500', text: 'text-green-500' },
    error: { border: 'border-red-500', indicator: 'bg-red-500', text: 'text-red-500' },
  };

  const colors = statusColors[status.status];

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-6 text-white md:px-6">
      <Toaster
        position="top-center"
        richColors
        theme="dark"
        toastOptions={{
          classNames: {
            toast: 'w-full max-w-md mx-auto',
            title: 'text-lg font-semibold',
            description: 'text-sm text-gray-300',
          },
        }}
      />

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-bold md:text-3xl">📱 Camera {cameraId} - Broadcasting</h1>
        <p className="text-sm text-gray-400 md:text-base">Match: {matchId} | Broadcasting video stream...</p>
      </div>

      {/* Video Container */}
      <div className="mb-6 max-w-2xl">
        <div className={`relative aspect-square overflow-hidden rounded-lg border-4 transition-all ${colors.border} bg-black`}>
          <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

          {/* Status Overlay */}
          {status.status !== 'connected' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
              <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-yellow-500"></div>
              <p className="text-center font-bold">{status.message}</p>
            </div>
          )}

          {/* Camera Label */}
          <div className="absolute bottom-3 left-3 rounded bg-black/70 px-4 py-2">
            <p className="text-sm font-bold">Camera {cameraId}</p>
          </div>

          {/* Status Badge */}
          <div className="absolute right-3 top-3 flex items-center gap-2 rounded bg-black/70 px-3 py-2">
            {status.status === 'waiting' && <div className={`h-3 w-3 animate-pulse rounded-full ${colors.indicator}`}></div>}
            {status.status === 'connecting' && <div className={`h-3 w-3 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500`}></div>}
            {status.status === 'connected' && (
              <div className={`h-3 w-3 rounded-full ${colors.indicator} shadow-lg`} style={{ boxShadow: '0 0 8px rgba(76, 175, 80, 0.5)' }}></div>
            )}
            {status.status === 'error' && (
              <div className={`h-3 w-3 rounded-full ${colors.indicator} shadow-lg`} style={{ boxShadow: '0 0 8px rgba(244, 67, 54, 0.5)' }}></div>
            )}
            <span className="text-xs font-medium capitalize">{status.status}</span>
          </div>
        </div>
      </div>

      {/* Info Panel */}
      <div className="max-w-2xl rounded-lg bg-gray-800 p-4">
        <h3 className="mb-4 text-sm font-bold">📊 Connection Status</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-400">Status</p>
            <p className={`font-bold ${colors.text}`}>{status.status}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Camera ID</p>
            <p className="font-bold text-white">{cameraId}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Message</p>
            <p className="text-xs text-white">{status.message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}