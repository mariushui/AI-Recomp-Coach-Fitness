import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorBox } from './ui';

// Anmeldung per E-Mail-Code. Ein Code statt nur Link, weil auf dem iPhone ein Link in Safari aufgeht
// und nicht in der Homescreen-App. Der Code funktioniert in beiden.
const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(error.message);
  };

  const input =
    'w-full rounded-xl bg-cyber-black border border-white/10 px-3 py-3 text-base text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-purple';

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <Card className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">Recomp Coach</h1>
          <p className="text-sm text-slate-400 mt-1">Gesundheit, Körper und Training an einem Ort sammeln.</p>
        </div>
        {!sent ? (
          <>
            <input
              className={input}
              type="email"
              autoComplete="email"
              placeholder="E-Mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email && send()}
            />
            <Button className="w-full" disabled={!email.includes('@') || busy} onClick={send}>
              {busy ? 'Sende …' : 'Code per Mail schicken'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-300">
              Mail an <b>{email}</b> ist raus. Gib den Code ein oder tippe auf den Link in der Mail.
            </p>
            <input
              className={`${input} tracking-[0.4em] text-center`}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <Button className="w-full" disabled={code.length < 6 || busy} onClick={verify}>
              Anmelden
            </Button>
            <button className="text-xs text-slate-500 underline w-full" onClick={() => setSent(false)}>
              Andere E-Mail
            </button>
          </>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
      </Card>
    </div>
  );
};

export default AuthScreen;
