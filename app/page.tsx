
import Link from 'next/link';



export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 px-5 py-10 md:px-0 md:py-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center md:mb-16">
          <h1 className="mb-3 text-4xl font-bold text-gray-900">
            🎬 Cricket Live Streaming
          </h1>
          <p className="text-lg text-gray-600">
            WebRTC-based multi-camera live streaming platform
          </p>
        </div>

        {/* Admin Section */}
        <div className="mb-5 rounded-lg bg-gray-50 p-6 shadow-md">
          <h2 className="mb-2 text-xl font-bold text-gray-900">
            👨‍💼 Admin Dashboard
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            View live stream from 4 cameras in a 2x2 grid layout
          </p>
          <Link
            href="/admin-dashboard/sample-match-001"
            className="block w-full rounded bg-blue-600 px-6 py-3 text-center font-medium text-white transition-all hover:bg-blue-700 hover:shadow-lg"
          >
            Open Admin Dashboard
          </Link>
        </div>

        {/* Mobile Camera Sections */}
        <div className="mb-5 rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-2 text-xl font-bold text-gray-900">📱 Mobile Cameras</h2>
          <p className="mb-4 text-sm text-gray-600">
            Each camera must use the same Match ID as Admin
          </p>

          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((cam) => (
              <Link
                key={cam}
                href={`/mobile-camera/sample-match-001?cameraId=${cam}`}
                className="rounded border-2 border-blue-600 px-4 py-3 text-center font-medium text-blue-600 transition-all hover:bg-gray-50"
              >
                Camera {cam}
              </Link>
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="mb-5 rounded-lg border border-yellow-300 bg-yellow-50 p-6">
          <h3 className="mb-3 font-bold text-gray-900">⚠️ Setup Instructions</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>✓ Make sure Node.js server is running on localhost:5001</li>
            <li>✓ Open Admin Dashboard first</li>
            <li>✓ Then open Camera 1, 2, 3, 4 in separate tabs/windows</li>
            <li>✓ Each camera must request permission to access camera</li>
            <li>✓ Admin dashboard will show video streams from all 4 cameras</li>
            <li>
              <strong>Match ID:</strong> All screens must use the same Match ID
              (sample-match-001)
            </li>
          </ul>
        </div>

        {/* Match ID Selector */}
        <div className="rounded-lg border border-green-300 bg-green-50 p-6">
          <h3 className="mb-2 font-bold text-gray-900">🔗 Custom Match ID</h3>
          <p className="mb-3 text-sm text-gray-600">
            Edit URLs to use custom match IDs:
          </p>
          <pre className="rounded bg-gray-200 p-3 text-xs text-gray-800 overflow-x-auto">
            {`/admin-dashboard/YOUR_MATCH_ID
/mobile/YOUR_MATCH_ID?cameraId=1`}
          </pre>
        </div>
      </div>
    </div>
  );
}