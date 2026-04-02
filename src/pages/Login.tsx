import { useState } from "react";
import { Anchor } from "lucide-react";
import { useAuthStore } from "../stores/authStore";

export function Login() {
  const { signIn } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-deepest bg-noise flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Anchor className="w-8 h-8 text-accent-blue" />
          </div>
          <h1 className="text-3xl font-display font-bold text-text-primary tracking-tight">
            CrewTracker
          </h1>
          <p className="text-sm text-text-secondary mt-2">
            Real-time crew tracking & management
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-bg-surface border border-border-divider rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-bg-surface border border-border-divider rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium transition-all shadow-[0_0_15px_rgba(43,108,255,0.4)]"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
