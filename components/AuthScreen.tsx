import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorBox } from './ui';

// Zwei Wege: Passwort (schnell, wenn eins gesetzt ist) oder Code per E-Mail.
// Ein Code statt nur Link, weil auf dem iPhone ein Link in Safari aufgeht und nicht in der Homescreen-App.
// Die Sitzung bleibt gespeichert, Anmelden ist nur nach Abmelden oder auf einem neuen Gerät nötig.

const EMAIL_KEY = 'recomp_login_email';
const MODE_KEY = 'recomp_login_mode';

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* egal */
  }
};
const recall = (key: string) => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<'password' | 'code'>(() => (recall(MODE_KEY) === 'password' ? 'password' : 'code'));
  const [email, setEmail] = useState(() => recall(EMAIL_KEY));
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ error: { message: string } | null }>, after?: () => void) => {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(friendly(error.message));
    else {
      remember(EMAIL_KEY, email.trim());
      after?.();
    }
  };

  const sendCode = () =>
    run(
      () => supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + window.location.pathname } }),
      () => setSent(true),
    );
  const verifyCode = () => run(() => supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }), () => remember(MODE_KEY, 'code'));
  const loginPassword = () => run(() => supabase.auth.signInWithPassword({ email: email.trim(), password }), () => remember(MODE_KEY, 'password'));

  const input =
    'w-full rounded-xl bg-cyber-black border border-white/10 px-3 py-3 text-base text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyber-purple';
  const emailField = (
    <input
      className={input}
      type="email"
      autoComplete="username"
      placeholder="E-Mail"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
    />
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <Card className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-100">Chakka</h1>
          <p className="text-sm text-slate-400 mt-1">Der Fitness-Tracker für Körper, Ernährung und Training.</p>
        </div>

        {mode === 'password' && (
          <>
            {emailField}
            <input
              className={input}
              type="password"
              autoComplete="current-password"
              placeholder="Passwort"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email && password && loginPassword()}
            />
            <Button className="w-full" disabled={!email.includes('@') || password.length < 8 || busy} onClick={loginPassword}>
              {busy ? 'Melde an …' : 'Anmelden'}
            </Button>
            <button className="text-xs text-slate-500 underline w-full" onClick={() => setMode('code')}>
              Stattdessen Code per Mail (auch bei vergessenem Passwort)
            </button>
          </>
        )}

        {mode === 'code' && !sent && (
          <>
            {emailField}
            <Button className="w-full" disabled={!email.includes('@') || busy} onClick={sendCode}>
              {busy ? 'Sende …' : 'Code per Mail schicken'}
            </Button>
            <button className="text-xs text-slate-500 underline w-full" onClick={() => setMode('password')}>
              Mit Passwort anmelden
            </button>
          </>
        )}

        {mode === 'code' && sent && (
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
            <Button className="w-full" disabled={code.length < 6 || busy} onClick={verifyCode}>
              Anmelden
            </Button>
            <button className="text-xs text-slate-500 underline w-full" onClick={() => setSent(false)}>
              Andere E-Mail
            </button>
          </>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}
        <p className="text-[11px] text-slate-500">Ein Passwort legst du nach dem ersten Anmelden unter Einstellungen fest. Die App bleibt danach angemeldet.</p>
      </Card>
    </div>
  );
};

/** Supabase-Meldungen auf Deutsch, der Rest bleibt wie er ist. */
function friendly(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort stimmt nicht. Kein Passwort gesetzt? Dann Code per Mail nutzen.';
  if (/token has expired|otp_expired/i.test(msg)) return 'Der Code ist abgelaufen. Bitte neu anfordern.';
  if (/invalid.*otp|token.*invalid/i.test(msg)) return 'Der Code stimmt nicht.';
  if (/rate limit|too many/i.test(msg)) return 'Zu viele Versuche. Bitte kurz warten.';
  return msg;
}

export default AuthScreen;
