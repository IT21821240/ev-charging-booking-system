import { Link } from "react-router-dom";

export default function OperatorDashboard() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Station Operator</h2>
      <Link className="inline-block px-4 py-2 bg-black text-white rounded" to="/operator/qr">
        Scan / Enter QR
      </Link>
    </div>
  );
}
