import React from 'react';
import LiveAssistant from './components/LiveAssistant';
import Dashboard from './components/Dashboard';
import { ShieldCheck, Gem } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
              <Gem className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Achal Jewels</h1>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">CFO Office</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Jitendra Online</span>
            </div>
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-12">
        {/* Hero Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-4">
              <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900 leading-[1.1]">
                Ashish sir's <br />
                <span className="text-indigo-600">Personal Assistant.</span>
              </h2>
              <p className="text-xl text-slate-500 max-w-xl leading-relaxed">
                Namaste! Main Jitendra hoon. I manage Ashish sir's schedule and appointments
                so he can focus on leading Achal Jewels.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="px-6 py-3 bg-white rounded-2xl border border-black/5 shadow-sm text-sm font-medium flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full" />
                Book Appointments
              </div>
              <div className="px-6 py-3 bg-white rounded-2xl border border-black/5 shadow-sm text-sm font-medium flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-500 rounded-full" />
                Check Availability
              </div>
              <div className="px-6 py-3 bg-white rounded-2xl border border-black/5 shadow-sm text-sm font-medium flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                Take Messages
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <LiveAssistant />
          </div>
        </section>

        {/* Dashboard Section */}
        <section className="pt-12 border-t border-black/5">

          <Dashboard />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-black/5 py-12 mt-24">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <Gem className="w-6 h-6 text-slate-400" />
            <span className="text-slate-500 font-medium">© 2026 Achal Jewels. All rights reserved.</span>
          </div>
          <div className="flex gap-8 text-sm font-medium text-slate-400">
            <a href="#" className="hover:text-slate-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-slate-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-slate-600 transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
