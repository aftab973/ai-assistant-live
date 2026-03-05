import React from 'react';
import { ShieldCheck, Calendar, Clock, User, Building2, MessageSquare, Award, MapPin, Gem, Share2, Cloud, CheckCircle2, Loader2, Trash2 } from 'lucide-react';

export default function Dashboard() {
  const [appointments, setAppointments] = React.useState<any[]>([]);
  const [messages, setMessages] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isGoogleAuth, setIsGoogleAuth] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredAppointments = appointments.filter(apt =>
    apt.caller_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (apt.company && apt.company.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (apt.purpose && apt.purpose.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredMessages = messages.filter(msg =>
    (msg.caller_name && msg.caller_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    msg.message.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const checkAuthStatus = React.useCallback(() => {
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => setIsGoogleAuth(data.isAuthenticated))
      .catch(err => console.error("Auth status check failed:", err));
  }, []);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/appointments').then(res => res.json()),
      fetch('/api/messages').then(res => res.json())
    ]).then(([aptData, msgData]) => {
      setAppointments(aptData);
      setMessages(msgData);
      setLoading(false);
    }).catch(err => {
      console.error("Failed to fetch dashboard data:", err);
      setLoading(false);
    });
  }, []);

  React.useEffect(() => {
    fetchData();
    checkAuthStatus();

    const handleUpdate = () => {
      console.log("Data updated event received, refreshing...");
      fetchData();
    };

    const handleOAuthSuccess = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsGoogleAuth(true);
      }
    };

    window.addEventListener('data-updated', handleUpdate);
    window.addEventListener('message', handleOAuthSuccess);
    return () => {
      window.removeEventListener('data-updated', handleUpdate);
      window.removeEventListener('message', handleOAuthSuccess);
    };
  }, [fetchData, checkAuthStatus]);

  const handleExport = async () => {
    if (!isGoogleAuth) {
      try {
        const res = await fetch('/api/auth/google/url');
        const { url } = await res.json();
        window.open(url, 'google_oauth', 'width=600,height=700');
      } catch (err) {
        alert("Failed to start Google authentication.");
      }
      return;
    }

    setExporting(true);
    try {
      const res = await fetch('/api/export/drive', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully saved to Google Drive!\n\nYou can find the file in your Drive.`);
      } else {
        alert(`Export failed: ${data.error}`);
      }
    } catch (err) {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const deleteAppointment = async (date: string, time: string) => {
    if (!confirm("Are you sure you want to delete this appointment?")) return;
    try {
      const res = await fetch('/api/appointments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time })
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Failed to delete appointment:", err);
    }
  };

  const deleteMessage = async (id: number) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Office Overview</h1>
          <p className="text-slate-500">Manage Ashish sir's schedule and messages.</p>
        </div>
        <div className="relative w-full md:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Share2 className="w-4 h-4 text-slate-400 rotate-90" />
          </div>
          <input
            type="text"
            placeholder="Search everything..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-black/5 rounded-2xl bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="p-6 bg-white rounded-3xl border border-black/5 shadow-sm space-y-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Appointments</p>
            <h3 className="text-3xl font-bold text-slate-900">{appointments.length}</h3>
          </div>
        </div>

        <div className="p-6 bg-white rounded-3xl border border-black/5 shadow-sm space-y-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Company Status</p>
            <h3 className="text-xl font-bold text-slate-900">Achal Jewels (CFO Office)</h3>
          </div>
        </div>

        <div className="p-6 bg-white rounded-3xl border border-black/5 shadow-sm space-y-4">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Assistant</p>
            <h3 className="text-xl font-bold text-slate-900">Jitendra (Active)</h3>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className={`p-6 rounded-3xl border shadow-sm space-y-4 text-left transition-all group ${isGoogleAuth
              ? 'bg-blue-50 border-blue-100 hover:bg-blue-100'
              : 'bg-white border-black/5 hover:border-blue-200'
            }`}
        >
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isGoogleAuth ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-400 group-hover:text-blue-600'
            }`}>
            {exporting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Cloud className="w-6 h-6" />}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Google Drive</p>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-900">
                {isGoogleAuth ? (exporting ? 'Saving...' : 'Save Overview') : 'Connect Drive'}
              </h3>
              {isGoogleAuth && !exporting && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
            </div>
          </div>
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
        <div className="p-6 border-bottom border-black/5 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-900">Upcoming Schedule</h3>
          <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full uppercase tracking-tighter">
            Live View
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Caller</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Company</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Purpose</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Date & Time</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Loading schedule...</td>
                </tr>
              ) : filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    {searchQuery ? `No results found for "${searchQuery}"` : "No appointments scheduled yet."}
                  </td>
                </tr>
              ) : (
                filteredAppointments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-600">
                          <User className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-slate-900">{apt.caller_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{apt.company || 'N/A'}</td>
                    <td className="px-6 py-4 text-slate-600">{apt.purpose || 'General Meeting'}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-slate-900 font-medium">{apt.date}</span>
                        <span className="text-slate-500 text-sm">{apt.time}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => deleteAppointment(apt.date, apt.time)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
        <div className="p-6 border-bottom border-black/5 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-900">Recent Messages</h3>
          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-full uppercase tracking-tighter">
            For Ashish Sir
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">From</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Message</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Received At</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">Loading messages...</td>
                </tr>
              ) : filteredMessages.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                    {searchQuery ? `No results found for "${searchQuery}"` : "No messages yet."}
                  </td>
                </tr>
              ) : (
                filteredMessages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                          <User className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-slate-900">{msg.caller_name || 'Anonymous'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 max-w-md truncate">{msg.message}</td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {new Date(msg.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="p-8 bg-indigo-600 text-white rounded-3xl flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-2xl font-bold">Need to reach Ashish sir?</h3>
            <p className="text-indigo-100">
              Jitendra is here to help you manage your time and ensure Ashish sir gets your message.
            </p>
          </div>
          <div className="flex items-center gap-4 mt-8">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-indigo-200">Current Status</p>
              <p className="font-bold">Jitendra is Online</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
