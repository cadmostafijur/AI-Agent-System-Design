import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-indigo-950">
      {/* Navigation */}
      <nav className="border-b border-gray-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">
              RF
            </div>
            <span className="text-xl font-bold">ReplyForce AI</span>
          </div>
          <div className="flex gap-4">
            <Link
              href="/auth"
              className="px-4 py-2 text-sm text-gray-300 hover:text-white transition"
            >
              Sign In
            </Link>
            <Link
              href="/auth"
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-24 text-center">
        <div className="inline-block px-4 py-1.5 mb-6 text-xs font-medium bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400">
          AI-Powered Social Media Automation
        </div>
        <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6">
          Turn Social Messages
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            Into Revenue
          </span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          Auto-reply to Facebook, Instagram, WhatsApp, and Twitter messages with AI.
          Score leads instantly. Sync everything to your CRM. Zero manual work.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/auth"
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium text-lg transition shadow-lg shadow-indigo-500/20"
          >
            Start Free Trial
          </Link>
          <a
            href="#features"
            className="px-8 py-3 border border-gray-700 hover:border-gray-500 rounded-lg font-medium text-lg transition"
          >
            See How It Works
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: '<2s', label: 'Response Time' },
            { value: '95%', label: 'Auto-Reply Rate' },
            { value: '3x', label: 'More Leads Captured' },
            { value: '0', label: 'Messages Missed' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold text-indigo-400">{stat.value}</div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-16">Everything You Need</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              title: 'Unified Inbox',
              description: 'All social media conversations in one dashboard. Facebook, Instagram, WhatsApp, Twitter/X.',
              icon: '💬',
            },
            {
              title: 'AI Auto-Reply',
              description: 'Instant, contextual responses powered by GPT-4o. Matches your brand voice perfectly.',
              icon: '🤖',
            },
            {
              title: 'Lead Scoring',
              description: 'Automatically tag leads as HOT, WARM, or COLD based on intent and behavior signals.',
              icon: '🎯',
            },
            {
              title: 'CRM Sync',
              description: 'One-click integration with HubSpot and Salesforce. Leads sync automatically.',
              icon: '🔄',
            },
            {
              title: 'Smart Escalation',
              description: 'AI knows when to hand off to a human. Seamless transition, nothing falls through.',
              icon: '🚀',
            },
            {
              title: 'Real-Time Analytics',
              description: 'Track response times, lead conversion, and AI performance. Make data-driven decisions.',
              icon: '📊',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="p-6 rounded-xl bg-gray-900/50 border border-gray-800 hover:border-indigo-500/30 transition group"
            >
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-indigo-400 transition">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center text-sm text-gray-500">
          <span>2026 ReplyForce AI. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-gray-300 transition">Privacy</a>
            <a href="#" className="hover:text-gray-300 transition">Terms</a>
            <a href="#" className="hover:text-gray-300 transition">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
