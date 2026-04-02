import { MOCK_SCREENS } from "@/lib/mock-data";

export default function ScreensPage() {
  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>Screen Fleet Status</h3>
      <p className="muted">Online/offline visibility baseline for operator workflows.</p>

      <table className="table">
        <thead>
          <tr>
            <th>Device ID</th>
            <th>Name</th>
            <th>Location</th>
            <th>Status</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_SCREENS.map((screen) => (
            <tr key={screen.id}>
              <td>{screen.id}</td>
              <td>{screen.name}</td>
              <td>{screen.location}</td>
              <td>
                <span className={`badge ${screen.status}`}>
                  {screen.status.toUpperCase()}
                </span>
              </td>
              <td>{new Date(screen.lastSeenAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
