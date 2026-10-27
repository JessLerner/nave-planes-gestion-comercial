import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';

export const LoginScreen: React.FC = () => {
  const { signIn, resetPassword, configurationError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'reset'>('login');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    const result = mode === 'login'
      ? await signIn(email, password)
      : await resetPassword(email);
    setIsSubmitting(false);
    setMessage(result.error || (mode === 'reset'
      ? 'Si el correo está registrado, vas a recibir un enlace para restablecer tu contraseña.'
      : null));
  };

  return (
    <main className="min-h-screen bg-[#18191b] px-5 py-10 flex items-center justify-center">
      <section className="w-full max-w-md overflow-hidden border border-white/10 bg-white shadow-2xl">
        <div className="border-b-[3px] border-[#a41f27] px-8 py-7">
          <img src="/brand/nave-plan-logo.png" alt="Nave.Plan — Tu próximo auto, más cerca" className="w-64 max-w-full h-auto" />
        </div>
        <div className="px-8 py-8">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] uppercase text-[#a41f27]">
            <ShieldCheck className="h-4 w-4" /> Plataforma de gestión
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#18191b]">
            {mode === 'login' ? 'Ingresar a Nave.Plan' : 'Recuperar acceso'}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#57575c]">
            {mode === 'login'
              ? 'Ingresá con la cuenta que recibió tu invitación institucional.'
              : 'Ingresá tu correo institucional. Te enviaremos un enlace seguro para crear una nueva contraseña.'}
          </p>

          {configurationError && <div className="mt-5 border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">{configurationError}</div>}
          {message && <div className="mt-5 border border-[#a41f27]/30 bg-[#a41f27]/5 px-3 py-2.5 text-xs leading-5 text-[#6f151a]">{message}</div>}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-xs font-bold text-[#18191b]">Correo institucional
              <span className="relative mt-1.5 block">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-[#57575c]" />
                <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@naveplanes.com.ar" className="w-full border border-[#d8d8d9] py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[#a41f27]" />
              </span>
            </label>

            {mode === 'login' && <label className="block text-xs font-bold text-[#18191b]">Contraseña
              <span className="relative mt-1.5 block">
                <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-[#57575c]" />
                <input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Tu contraseña" className="w-full border border-[#d8d8d9] py-2.5 pl-10 pr-11 text-sm outline-none transition focus:border-[#a41f27]" />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute right-0 top-0 h-full px-3 text-[#57575c] hover:text-[#a41f27]">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>}

            <button disabled={isSubmitting || Boolean(configurationError)} className="mt-2 flex w-full items-center justify-center gap-2 bg-[#a41f27] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#18191b] disabled:cursor-not-allowed disabled:opacity-50">
              {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {mode === 'login' ? 'Ingresar' : 'Enviar enlace'}
            </button>
          </form>

          <button type="button" onClick={() => { setMode(value => value === 'login' ? 'reset' : 'login'); setMessage(null); }} className="mt-5 text-xs font-semibold text-[#57575c] underline decoration-[#a41f27] underline-offset-4 hover:text-[#a41f27]">
            {mode === 'login' ? '¿Olvidaste tu contraseña?' : 'Volver al inicio de sesión'}
          </button>
        </div>
        <footer className="bg-[#18191b] px-8 py-5 text-xs text-[#a9a9ae]">NAVE.PLAN · Tu próximo auto, más cerca</footer>
      </section>
    </main>
  );
};
